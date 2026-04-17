import {
  defaultPathResolver,
  type ParsedFile,
  type RuleDirective
} from '@officium-novum/parser';

import { conditionMatches } from '../internal/conditions.js';
import type { RubricalWarning } from '../types/directorium.js';
import type { RuleEvaluationContext } from '../types/rule-set.js';

export interface ResolveReferenceResult {
  readonly directives: readonly RuleDirective[];
  readonly warnings: readonly RubricalWarning[];
}

interface ActiveReference {
  readonly mode: 'vide' | 'ex';
  readonly source: RuleDirective;
  readonly path: string;
  readonly modifier?: string;
}

interface CollectState {
  readonly context: Pick<RuleEvaluationContext, 'date' | 'dayOfWeek' | 'season' | 'version' | 'corpus'>;
  readonly maxDepth: number;
  readonly rootPath: string;
}

const DEFAULT_MAX_DEPTH = 10;

export function resolveEx(
  feastFile: ParsedFile,
  context: Pick<RuleEvaluationContext, 'date' | 'dayOfWeek' | 'season' | 'version' | 'corpus'>,
  maxDepth = DEFAULT_MAX_DEPTH
): ResolveReferenceResult {
  return collectReferences('ex', feastFile, {
    context,
    maxDepth,
    rootPath: feastFile.path
  });
}

export function resolveVide(
  feastFile: ParsedFile,
  existingDirectives: readonly RuleDirective[],
  context: Pick<RuleEvaluationContext, 'date' | 'dayOfWeek' | 'season' | 'version' | 'corpus'>,
  maxDepth = DEFAULT_MAX_DEPTH
): ResolveReferenceResult {
  const base = collectReferences('vide', feastFile, {
    context,
    maxDepth,
    rootPath: feastFile.path
  });

  const seen = new Set(existingDirectives.map((directive) => directiveFingerprint(directive)));
  const directives: RuleDirective[] = [];

  for (const directive of base.directives) {
    const fingerprint = directiveFingerprint(directive);
    if (seen.has(fingerprint)) {
      continue;
    }

    seen.add(fingerprint);
    directives.push(directive);
  }

  return {
    directives,
    warnings: base.warnings
  };
}

function collectReferences(
  mode: 'vide' | 'ex',
  file: ParsedFile,
  state: CollectState,
  depth = 0,
  visited = new Set<string>()
): ResolveReferenceResult {
  const warnings: RubricalWarning[] = [];
  const directives: RuleDirective[] = [];

  if (depth > state.maxDepth) {
    warnings.push(
      makeCycleWarning(mode, {
        source: file.path,
        target: file.path,
        reason: `maximum depth (${state.maxDepth}) exceeded`
      })
    );

    return {
      directives,
      warnings
    };
  }

  const references = extractActiveReferences(file, mode, state.context);

  for (const reference of references) {
    const target = resolveRuleTargetFile(state.context.corpus, file.path, reference.path);
    if (!target) {
      warnings.push(
        makeMissingTargetWarning(mode, {
          source: file.path,
          target: reference.path,
          modifier: reference.modifier
        })
      );
      continue;
    }

    const cycleKey = normalizePathKey(target.path);
    if (visited.has(cycleKey)) {
      warnings.push(
        makeCycleWarning(mode, {
          source: file.path,
          target: target.path,
          modifier: reference.modifier,
          reason: 'cycle detected'
        })
      );
      continue;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(cycleKey);

    const nestedEx = collectReferences('ex', target, state, depth + 1, nextVisited);
    const nestedVide = collectReferences('vide', target, state, depth + 1, nextVisited);

    directives.push(...nestedEx.directives, ...nestedVide.directives, ...extractNonReferenceRules(target));
    warnings.push(...nestedEx.warnings, ...nestedVide.warnings);
  }

  return {
    directives,
    warnings
  };
}

function extractActiveReferences(
  file: ParsedFile,
  mode: 'vide' | 'ex',
  context: Pick<RuleEvaluationContext, 'date' | 'dayOfWeek' | 'season' | 'version'>
): readonly ActiveReference[] {
  const rules = extractRuleDirectives(file);
  const output: ActiveReference[] = [];

  for (const directive of rules) {
    const reference = parseActiveReference(directive);
    if (!reference || reference.mode !== mode) {
      continue;
    }

    if (!conditionMatches(directive.condition, context)) {
      continue;
    }

    output.push(reference);
  }

  return output;
}

export function extractRuleDirectives(file: ParsedFile): readonly RuleDirective[] {
  const directives: RuleDirective[] = [];

  for (const section of file.sections) {
    if (section.header !== 'Rule' || !section.rules) {
      continue;
    }

    directives.push(...section.rules);
  }

  return directives;
}

function extractNonReferenceRules(file: ParsedFile): readonly RuleDirective[] {
  return extractRuleDirectives(file).filter((directive) => {
    const active = parseActiveReference(directive);
    return !active;
  });
}

function parseActiveReference(directive: RuleDirective): ActiveReference | null {
  if (directive.kind !== 'action') {
    return null;
  }

  const keyword = normalizeToken(directive.keyword);
  if (keyword !== 'vide' && keyword !== 'ex') {
    return null;
  }

  const rawTarget = directive.args.join(' ').trim();
  if (!rawTarget) {
    return null;
  }

  const cleaned = rawTarget.replace(/[;,\s]+$/gu, '');
  const [pathPart, ...modifierParts] = cleaned.split(';');
  const path = pathPart?.trim();
  if (!path) {
    return null;
  }

  const modifier = modifierParts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(';');

  return {
    mode: keyword,
    source: directive,
    path,
    ...(modifier ? { modifier } : {})
  };
}

function resolveRuleTargetFile(
  corpus: Pick<RuleEvaluationContext, 'corpus'>['corpus'],
  sourceFilePath: string,
  targetPath: string
): ParsedFile | undefined {
  const contentPaths = candidateContentPaths(targetPath, sourceFilePath);

  for (const contentPath of contentPaths) {
    const direct = corpus.getFile(toCorpusPath(contentPath));
    if (direct) {
      return direct;
    }

    const resolverPaths = defaultPathResolver(contentPath, {
      domain: 'horas',
      language: 'Latin'
    });

    for (const resolverPath of resolverPaths) {
      const match = corpus.getFile(resolverPath);
      if (match) {
        return match;
      }
    }

    const matches = corpus.findByContentPath(contentPath);
    const preferred = chooseBestMatch(matches);
    if (preferred) {
      return preferred;
    }
  }

  return undefined;
}

function candidateContentPaths(targetPath: string, sourceFilePath: string): readonly string[] {
  const normalized = normalizeContentPath(targetPath);
  const paths = new Set<string>();

  paths.add(normalized);

  if (!normalized.includes('/')) {
    if (/^c\d/iu.test(normalized)) {
      paths.add(`Commune/${normalized}`);
    }

    if (/^(adv|nat|epi|quad|quadp|pasc|pent)/iu.test(normalized)) {
      paths.add(`Tempora/${normalized}`);
    }

    paths.add(`Sancti/${normalized}`);

    const sourceContentRoot = inferSourceContentRoot(sourceFilePath);
    if (sourceContentRoot) {
      paths.add(`${sourceContentRoot}/${normalized}`);
    }
  }

  return [...paths];
}

function inferSourceContentRoot(sourceFilePath: string): string | null {
  const match = /horas\/Latin\/([^/]+)\//u.exec(sourceFilePath);
  if (!match) {
    return null;
  }

  const root = match[1];
  return root ?? null;
}

function toCorpusPath(contentPath: string): string {
  const withTxt = contentPath.endsWith('.txt') ? contentPath : `${contentPath}.txt`;
  if (withTxt.startsWith('horas/')) {
    return withTxt;
  }

  return `horas/Latin/${withTxt}`;
}

function chooseBestMatch(matches: readonly ParsedFile[]): ParsedFile | undefined {
  if (matches.length === 0) {
    return undefined;
  }

  return [...matches]
    .sort((left, right) => {
      const leftScore = scorePath(left.path);
      const rightScore = scorePath(right.path);
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      return left.path.localeCompare(right.path);
    })
    .at(0);
}

function scorePath(path: string): number {
  if (path.startsWith('horas/Latin/')) {
    return 0;
  }
  if (path.startsWith('horas/')) {
    return 1;
  }
  return 2;
}

function normalizeContentPath(path: string): string {
  const compact = path.replace(/[;,\s]+$/gu, '');

  if (/^sancti\//iu.test(compact)) {
    return `Sancti/${compact.slice('Sancti/'.length)}`;
  }
  if (/^tempora\//iu.test(compact)) {
    return `Tempora/${compact.slice('Tempora/'.length)}`;
  }
  if (/^commune\//iu.test(compact)) {
    return `Commune/${compact.slice('Commune/'.length)}`;
  }

  return compact;
}

function makeMissingTargetWarning(
  mode: 'vide' | 'ex',
  params: {
    readonly source: string;
    readonly target: string;
    readonly modifier?: string;
  }
): RubricalWarning {
  return {
    code: mode === 'vide' ? 'rule-vide-target-missing' : 'rule-ex-target-missing',
    message: `Unable to resolve ${mode} rule target.`,
    severity: 'warn',
    context: {
      source: params.source,
      target: params.target,
      ...(params.modifier ? { modifier: params.modifier } : {})
    }
  };
}

function makeCycleWarning(
  mode: 'vide' | 'ex',
  params: {
    readonly source: string;
    readonly target: string;
    readonly modifier?: string;
    readonly reason: string;
  }
): RubricalWarning {
  return {
    code: mode === 'vide' ? 'rule-vide-cycle' : 'rule-ex-cycle',
    message: `Stopped ${mode} resolution due to ${params.reason}.`,
    severity: 'warn',
    context: {
      source: params.source,
      target: params.target,
      ...(params.modifier ? { modifier: params.modifier } : {})
    }
  };
}

function directiveFingerprint(directive: RuleDirective): string {
  if (directive.kind === 'assignment') {
    return `assignment:${normalizeToken(directive.key)}=${normalizeToken(directive.value)}`;
  }

  if (directive.kind === 'action') {
    return `action:${normalizeToken([directive.keyword, ...directive.args].join(' '))}`;
  }

  return `reference:${normalizeToken(directive.raw)}`;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/[;:,.]+$/gu, '');
}

function normalizePathKey(value: string): string {
  return value.trim().toLowerCase();
}
