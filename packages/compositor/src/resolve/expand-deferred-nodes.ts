import type { TextContent, TextIndex } from '@officium-novum/parser';
import type { TextReference } from '@officium-novum/rubrical-engine';

import { resolveReference } from './reference-resolver.js';

const COMMON_PRAYERS_PATH = 'horas/Latin/Psalterium/Common/Prayers';
const REVTRANS_PATH = 'horas/Latin/Psalterium/Revtrans';

export interface DeferredNodeContext {
  readonly index: TextIndex;
  readonly language: string;
  readonly langfb?: string;
  readonly seen: ReadonlySet<string>;
  readonly maxDepth: number;
}

/**
 * Expand the residual node kinds that remain after Phase 1 has already
 * resolved `@` cross-references for the corpus: `psalmInclude`, `macroRef`,
 * and `formulaRef`.
 *
 * A bare `reference` node reaching this phase is treated as an unresolved
 * artifact and intentionally preserved for the emitter to surface.
 */
export function expandDeferredNodes(
  content: readonly TextContent[],
  context: DeferredNodeContext
): readonly TextContent[] {
  if (context.maxDepth <= 0) {
    return content;
  }

  const out: TextContent[] = [];
  for (const node of content) {
    switch (node.type) {
      case 'psalmInclude': {
        const expanded = expandReference(
          {
            path: `horas/Latin/Psalterium/Psalmorum/Psalm${node.psalmNumber}`,
            section: '__preamble'
          },
          context
        );
        out.push(...(expanded ?? [node]));
        break;
      }
      case 'macroRef': {
        const expanded = expandNamedSection(
          macroSectionCandidates(node.name),
          [COMMON_PRAYERS_PATH, REVTRANS_PATH],
          context
        );
        out.push(...(expanded ?? [node]));
        break;
      }
      case 'formulaRef': {
        const expanded = expandNamedSection(
          formulaSectionCandidates(node.name),
          [COMMON_PRAYERS_PATH, REVTRANS_PATH],
          context
        );
        out.push(...(expanded ?? [node]));
        break;
      }
      default:
        out.push(node);
        break;
    }
  }

  return Object.freeze(out);
}

function expandNamedSection(
  sectionCandidates: readonly string[],
  pathCandidates: readonly string[],
  context: DeferredNodeContext
): readonly TextContent[] | undefined {
  for (const path of pathCandidates) {
    for (const section of sectionCandidates) {
      const expanded = expandReference({ path, section }, context);
      if (expanded) {
        return expanded;
      }
    }
  }
  return undefined;
}

function expandReference(
  reference: TextReference,
  context: DeferredNodeContext
): readonly TextContent[] | undefined {
  const key = `${context.language}:${reference.path}#${reference.section}`;
  if (context.seen.has(key)) {
    return undefined;
  }

  const resolved = resolveReference(context.index, reference, {
    languages: [context.language],
    langfb: context.langfb
  });
  const section = resolved[context.language];
  if (!section) {
    return undefined;
  }

  const nextSeen = new Set(context.seen);
  nextSeen.add(key);
  return expandDeferredNodes(section.content, {
    ...context,
    seen: nextSeen,
    maxDepth: context.maxDepth - 1
  });
}

function macroSectionCandidates(name: string): readonly string[] {
  return dedupe([normalizeMacroLikeName(name), ...macroAliasSections(name)]);
}

function formulaSectionCandidates(name: string): readonly string[] {
  const trimmed = name.trim();
  const strippedPeriod = trimmed.replace(/[.]+$/u, '').trim();
  const strippedRubric = strippedPeriod.replace(/^rubrica\s+/iu, '').trim();
  const rubricLowered =
    strippedRubric.length > 0
      ? `${strippedRubric[0]!.toLowerCase()}${strippedRubric.slice(1)}`
      : strippedRubric;

  return dedupe([trimmed, strippedPeriod, strippedRubric, rubricLowered]);
}

function normalizeMacroLikeName(name: string): string {
  const normalized = name
    .trim()
    .replace(/_/gu, ' ')
    .replace(/([a-z])([A-Z])/gu, '$1 $2');

  if (normalized.length === 0) {
    return normalized;
  }

  return `${normalized[0]!.toUpperCase()}${normalized.slice(1)}`;
}

function macroAliasSections(name: string): readonly string[] {
  switch (name) {
    case 'Dominus_vobiscum':
      return ['Dominus'];
    default:
      return [];
  }
}

function dedupe(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}
