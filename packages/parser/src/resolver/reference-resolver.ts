import { languageFallbackChain } from '../corpus/language.js';
import { parseCondition } from '../parser/condition-parser.js';
import { buildSectionContentFromLines } from '../parser/directive-parser.js';
import type { Condition } from '../types/conditions.js';
import type { CrossReference, LineSelector, Substitution } from '../types/directives.js';
import type { TextContent, TextSource } from '../types/schema.js';
import type { ParsedFile, ParsedSection, RawSection } from '../types/sections.js';
import { ensureTxtSuffix, normalizeRelativePath } from '../utils/path.js';
import { FileCache } from './file-cache.js';

const DEFAULT_CONDITIONAL_SCOPE = Object.freeze({
  backwardLines: 0,
  forwardMode: 'line' as const
});

export interface ResolverConfig {
  domain: 'horas' | 'missa';
  language: string;
  rite?: string;
  langfb?: string;
  maxDepth?: number;
  pathResolver?: PathResolver;
}

export interface ResolveContext {
  sourceFile: string;
  currentSection: string;
  visited: Set<string>;
  depth: number;
}

export interface ResolverWarning {
  type:
    | 'missing-file'
    | 'missing-section'
    | 'cycle-detected'
    | 'depth-exceeded'
    | 'ambiguous-section';
  message: string;
  sourceFile: string;
  section?: string;
  reference?: string;
}

export type PathResolver = (referencePath: string, config: ResolverConfig) => string[];

export class CrossReferenceResolver {
  readonly warnings: ResolverWarning[] = [];

  private readonly cache: FileCache;
  private readonly config: ResolverConfig;
  private readonly maxDepth: number;
  private readonly pathResolver: PathResolver;

  constructor(cache: FileCache, config: ResolverConfig) {
    this.cache = cache;
    this.config = config;
    this.maxDepth = config.maxDepth ?? 20;
    this.pathResolver = config.pathResolver ?? defaultPathResolver;
  }

  async resolve(reference: CrossReference, context: ResolveContext): Promise<TextContent[]> {
    if (context.depth >= this.maxDepth) {
      this.warn({
        type: 'depth-exceeded',
        sourceFile: context.sourceFile,
        section: context.currentSection,
        reference: formatReference(reference),
        message: `Reference depth exceeded ${this.maxDepth} while resolving ${formatReference(reference)}.`
      });
      return [];
    }

    const target = await this.resolveTargetFile(reference, context.sourceFile);
    if (!target) {
      this.warn({
        type: 'missing-file',
        sourceFile: context.sourceFile,
        section: context.currentSection,
        reference: formatReference(reference),
        message: `Unable to resolve file for reference ${formatReference(reference)}.`
      });
      return [];
    }

    const sectionName = reference.section ?? context.currentSection;
    const cycleKey = `${target.path}::${sectionName}`;

    if (context.visited.has(cycleKey)) {
      this.warn({
        type: 'cycle-detected',
        sourceFile: context.sourceFile,
        section: context.currentSection,
        reference: formatReference(reference),
        message: `Reference cycle detected at ${cycleKey}.`
      });
      return [];
    }

    const sections = target.raw.filter((candidate) => candidate.header === sectionName);
    if (sections.length === 0) {
      this.warn({
        type: 'missing-section',
        sourceFile: context.sourceFile,
        section: sectionName,
        reference: formatReference(reference),
        message: `Section '${sectionName}' not found in ${target.path}.`
      });
      return [];
    }

    const parsed = buildReferencedSection(sectionName, sections, reference, {
      resolver: this,
      sourceFile: context.sourceFile,
      currentSection: context.currentSection,
      targetPath: target.path
    });

    const nextVisited = new Set(context.visited);
    nextVisited.add(cycleKey);

    const resolvedContent = await this.resolveContent(parsed, {
      sourceFile: target.path,
      currentSection: sectionName,
      visited: nextVisited,
      depth: context.depth + 1
    });

    return annotateContentSource(resolvedContent, {
      path: target.path,
      section: sectionName
    });
  }

  async resolveFile(file: ParsedFile): Promise<ParsedFile> {
    const resolved = await this.resolveFileInternal(
      {
        path: normalizeRelativePath(file.path),
        sections: file.sections.map((section) => cloneSection(section))
      },
      new Set<string>()
    );

    return resolved.file;
  }

  private async resolveFileInternal(
    file: ParsedFile,
    preambleVisited: Set<string>
  ): Promise<ResolvedFileState> {
    const normalizedPath = normalizeRelativePath(file.path);

    if (preambleVisited.has(normalizedPath)) {
      this.warn({
        type: 'cycle-detected',
        sourceFile: normalizedPath,
        section: '__preamble',
        reference: normalizedPath,
        message: `Preamble cycle detected for ${normalizedPath}.`
      });

      return {
        file: {
          path: normalizedPath,
          sections: []
        },
        sectionSource: new Map<string, string>()
      };
    }

    const nextPreambleVisited = new Set(preambleVisited);
    nextPreambleVisited.add(normalizedPath);

    const preambleRefs = file.sections
      .filter((section) => section.header === '__preamble')
      .flatMap((section) => section.content)
      .filter((item): item is Extract<TextContent, { type: 'reference' }> => item.type === 'reference')
      .map((item) => item.ref);

    const mergedSections: ParsedSection[] = [];
    const sectionIndex = new Map<string, number>();
    const sectionSource = new Map<string, string>();

    for (const reference of preambleRefs) {
      const target = await this.resolveTargetFile(reference, normalizedPath);
      if (!target) {
        this.warn({
          type: 'missing-file',
          sourceFile: normalizedPath,
          section: '__preamble',
          reference: formatReference(reference),
          message: `Unable to resolve preamble file for ${formatReference(reference)}.`
        });
        continue;
      }

      const resolved = await this.resolveFileInternal(target.parsed, new Set(nextPreambleVisited));
      for (const section of resolved.file.sections) {
        if (section.header === '__preamble') {
          continue;
        }

        if (sectionIndex.has(section.header)) {
          continue;
        }

        sectionIndex.set(section.header, mergedSections.length);
        mergedSections.push(cloneSection(section));
        sectionSource.set(
          section.header,
          resolved.sectionSource.get(section.header) ?? resolved.file.path
        );
      }
    }

    for (const section of file.sections) {
      if (section.header === '__preamble') {
        continue;
      }

      const clone = cloneSection(section);
      const incomingGateCondition = isTextSection(clone) ? clone.condition : undefined;
      const normalizedClone = materializeTextSectionCondition(clone);
      const index = sectionIndex.get(normalizedClone.header);
      if (index === undefined) {
        sectionIndex.set(normalizedClone.header, mergedSections.length);
        mergedSections.push(normalizedClone);
        sectionSource.set(normalizedClone.header, normalizedPath);
        continue;
      }

      const existing = mergedSections[index];
      const existingSource = sectionSource.get(normalizedClone.header);
      if (
        existing &&
        existingSource === normalizedPath &&
        incomingGateCondition &&
        isTextSection(existing)
      ) {
        mergedSections[index] = mergeSameSourceTextVariants(
          existing,
          normalizedClone,
          incomingGateCondition
        );
        sectionSource.set(normalizedClone.header, normalizedPath);
        continue;
      }

      mergedSections[index] = normalizedClone;
      sectionSource.set(normalizedClone.header, normalizedPath);
    }

    const resolvedSections: ParsedSection[] = [];
    for (const section of file.sections) {
      if (section.header !== '__preamble') {
        continue;
      }

      if (section.content.length === 0) {
        resolvedSections.push(cloneSection(section));
        continue;
      }

      const resolvedContent = await this.resolveContent(section.content, {
        sourceFile: normalizedPath,
        currentSection: '__preamble',
        visited: new Set(),
        depth: 0
      });

      resolvedSections.push(withSectionSource({
        ...section,
        content: annotateContentSource(resolvedContent, {
          path: normalizedPath,
          section: section.header
        })
      }, { path: normalizedPath, section: section.header }));
      sectionSource.set('__preamble', normalizedPath);
    }

    for (const section of mergedSections) {
      const sourceFile = sectionSource.get(section.header) ?? normalizedPath;
      if (section.content.length === 0) {
        resolvedSections.push(withSectionSource(section, { path: sourceFile, section: section.header }));
        continue;
      }

      const resolvedContent = await this.resolveContent(section.content, {
        sourceFile,
        currentSection: section.header,
        visited: new Set(),
        depth: 0
      });

      resolvedSections.push(withSectionSource({
        ...section,
        content: annotateContentSource(resolvedContent, {
          path: sourceFile,
          section: section.header
        })
      }, { path: sourceFile, section: section.header }));
    }

    return {
      file: {
        path: normalizedPath,
        sections: resolvedSections
      },
      sectionSource
    };
  }

  private async resolveContent(content: readonly TextContent[], context: ResolveContext): Promise<TextContent[]> {
    const resolved: TextContent[] = [];

    for (const item of content) {
      if (item.type === 'reference') {
        const expanded = await this.resolve(item.ref, context);
        resolved.push(...expanded);
        continue;
      }

      if (item.type === 'conditional') {
        const innerResolved = await this.resolveContent(item.content, context);
        resolved.push({
          type: 'conditional',
          condition: item.condition,
          content: innerResolved,
          scope: item.scope
        });
        continue;
      }

      resolved.push(item);
    }

    return resolved;
  }

  private async resolveTargetFile(
    reference: CrossReference,
    sourceFile: string
  ): Promise<{ path: string; parsed: ParsedFile; raw: RawSection[] } | undefined> {
    const candidates = reference.path
      ? this.pathResolver(reference.path, this.config).map((candidate) => normalizeRelativePath(candidate))
      : [normalizeRelativePath(sourceFile)];

    for (const candidate of dedupe(candidates)) {
      try {
        const cached = await this.cache.getCached(candidate);
        return {
          path: cached.parsed.path,
          parsed: cached.parsed,
          raw: cached.raw
        };
      } catch (error) {
        if (isMissingFileError(error)) {
          continue;
        }

        throw error;
      }
    }

    return undefined;
  }

  private warn(warning: ResolverWarning): void {
    this.warnings.push(warning);
  }
}

interface ResolvedFileState {
  file: ParsedFile;
  sectionSource: Map<string, string>;
}

interface ReferenceSectionBuildContext {
  readonly resolver: CrossReferenceResolver;
  readonly sourceFile: string;
  readonly currentSection: string;
  readonly targetPath: string;
}

export function defaultPathResolver(referencePath: string, config: ResolverConfig): string[] {
  const normalizedReference = ensureTxtSuffix(normalizeRelativePath(referencePath));

  if (isFullyQualifiedCorpusPath(normalizedReference)) {
    return [normalizedReference];
  }

  const languageFallback = languageFallbackChain(config.language, {
    langfb: config.langfb ?? 'English'
  });

  return languageFallback.map((language) =>
    normalizeRelativePath(`${config.domain}/${language}/${normalizedReference}`)
  );
}

function applyLineSelector(lines: readonly string[], selector?: LineSelector): string[] {
  if (!selector) {
    return [...lines];
  }

  const start = Math.max(selector.start - 1, 0);

  if (selector.type === 'single') {
    if (start >= lines.length) {
      return [];
    }

    return [lines[start] ?? ''];
  }

  const end = Math.max((selector.end ?? selector.start) - 1, 0);
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);

  if (selector.type === 'range') {
    return lines.slice(lower, upper + 1);
  }

  return lines.filter((_, index) => index < lower || index > upper);
}

function applySubstitutions(lines: readonly string[], substitutions: readonly Substitution[]): string[] {
  if (substitutions.length === 0) {
    return [...lines];
  }

  return lines.map((line) => {
    let output = line;

    for (const substitution of substitutions) {
      const expression = new RegExp(substitution.pattern, substitution.flags);
      output = output.replace(expression, substitution.replacement);
    }

    return output;
  });
}

function cloneSection(section: ParsedSection): ParsedSection {
  const clone = {
    ...section,
    content: [...section.content],
    rank: section.rank ? [...section.rank] : undefined,
    rules: section.rules ? [...section.rules] : undefined
  };
  return section.source ? withSectionSource(clone, section.source) : clone;
}

function annotateContentSource(
  content: readonly TextContent[],
  source: TextSource
): TextContent[] {
  return content.map((node) => annotateNodeSource(node, source));
}

function annotateNodeSource(node: TextContent, source: TextSource): TextContent {
  const effectiveSource = node.source ?? source;
  const clone =
    node.type === 'conditional'
      ? {
          ...node,
          content: node.content.map((child) => annotateNodeSource(child, effectiveSource))
        }
      : { ...node };
  if (clone.source) {
    return clone;
  }
  Object.defineProperty(clone, 'source', {
    value: effectiveSource,
    enumerable: false,
    configurable: true
  });
  return clone;
}

function withSectionSource(section: ParsedSection, source: TextSource): ParsedSection {
  Object.defineProperty(section, 'source', {
    value: source,
    enumerable: false,
    configurable: true
  });
  return section;
}

function buildReferencedSection(
  header: string,
  sections: readonly RawSection[],
  reference: CrossReference,
  context: ReferenceSectionBuildContext
): readonly TextContent[] {
  let merged: ParsedSection | undefined;

  for (const section of sections) {
    const gateCondition = section.condition ? parseCondition(section.condition) : undefined;
    const candidate = materializeTextSectionCondition({
      header,
      condition: gateCondition,
      content: buildRawSectionContent(section, reference),
      startLine: section.startLine,
      endLine: section.endLine
    });

    if (!merged) {
      merged = candidate;
      continue;
    }

    if (!gateCondition) {
      context.resolver.warnings.push({
        type: 'ambiguous-section',
        sourceFile: context.sourceFile,
        section: context.currentSection,
        reference: formatReference(reference),
        message:
          `Multiple unconditional sections named '${header}' found in ${context.targetPath}; ` +
          'later duplicate overrides earlier content.'
      });
      merged = candidate;
      continue;
    }

    if (!isTextSection(merged)) {
      merged = candidate;
      continue;
    }

    merged = mergeSameSourceTextVariants(merged, candidate, gateCondition);
  }

  return merged?.content ?? [];
}

function buildRawSectionContent(
  section: RawSection,
  reference: CrossReference
): TextContent[] {
  const selectedLines = applyLineSelector(
    section.lines.map((line) => line.text),
    reference.lineSelector
  );
  const transformedLines = applySubstitutions(selectedLines, reference.substitutions);
  return [...buildSectionContentFromLines(transformedLines)];
}

function isTextSection(section: ParsedSection): boolean {
  return !section.rank && !section.rules;
}

function materializeTextSectionCondition(section: ParsedSection): ParsedSection {
  if (!isTextSection(section) || !section.condition) {
    return section;
  }

  return {
    ...section,
    condition: undefined,
    content: [
      {
        type: 'conditional',
        condition: section.condition,
        content: [...section.content],
        scope: DEFAULT_CONDITIONAL_SCOPE
      }
    ]
  };
}

function mergeSameSourceTextVariants(
  existing: ParsedSection,
  incoming: ParsedSection,
  incomingGateCondition: Condition
): ParsedSection {
  return {
    ...existing,
    condition: undefined,
    startLine: Math.min(existing.startLine, incoming.startLine),
    endLine: Math.max(existing.endLine, incoming.endLine),
    content: [
      {
        type: 'conditional',
        condition: negateCondition(incomingGateCondition),
        content: [...existing.content],
        scope: DEFAULT_CONDITIONAL_SCOPE
      },
      ...incoming.content
    ]
  };
}

function negateCondition(condition: Condition): Condition {
  const negated: Condition = {
    ...condition,
    expression: { type: 'not', inner: condition.expression }
  };
  delete negated.stopword;
  delete negated.instruction;
  delete negated.instructionModifier;
  return negated;
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function isFullyQualifiedCorpusPath(path: string): boolean {
  return /^(horas|missa|Tabulae)\//u.test(path);
}

function formatReference(reference: CrossReference): string {
  const pathPart = reference.path ? `@${reference.path}` : '@';
  const sectionPart = reference.section ? `:${reference.section}` : '';

  return `${pathPart}${sectionPart}`;
}

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError.code === 'ENOENT') {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeErr = cause as NodeJS.ErrnoException;
    if (causeErr.code === 'ENOENT') {
      return true;
    }
  }

  return /not found/iu.test(error.message);
}
