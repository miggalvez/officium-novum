import type { TextContent, TextIndex } from '@officium-novum/parser';
import type { TextReference } from '@officium-novum/rubrical-engine';

import type { ComposeWarning } from '../types/composed-hour.js';
import { resolveReference } from './reference-resolver.js';

const COMMON_PRAYERS_PATH = 'horas/Latin/Psalterium/Common/Prayers';
const COMMON_RUBRICAE_PATH = 'horas/Latin/Psalterium/Common/Rubricae';
const COMMON_TRANSLATE_PATH = 'horas/Latin/Psalterium/Common/Translate';
const REVTRANS_PATH = 'horas/Latin/Psalterium/Revtrans';

export interface DeferredNodeContext {
  readonly index: TextIndex;
  readonly language: string;
  readonly langfb?: string;
  readonly season?: string;
  readonly seen: ReadonlySet<string>;
  readonly maxDepth: number;
  /**
   * Phase 3 §3f: optional compose-time warning sink. Surfaces
   * deferred-depth exhaustion and downstream resolver warnings to the
   * caller; callers aggregate them onto {@link ComposedHour.warnings}.
   */
  readonly onWarning?: (warning: ComposeWarning) => void;
}

/**
 * Expand the residual node kinds that remain after Phase 1 has already
 * resolved `@` cross-references for the corpus: `psalmInclude`, `psalmRef`,
 * `macroRef`, and `formulaRef`.
 *
 * A bare `reference` node reaching this phase is treated as an unresolved
 * artifact and intentionally preserved for the emitter to surface.
 */
export function expandDeferredNodes(
  content: readonly TextContent[],
  context: DeferredNodeContext
): readonly TextContent[] {
  if (context.maxDepth <= 0) {
    if (context.onWarning) {
      context.onWarning({
        code: 'deferred-depth-exhausted',
        message:
          'Deferred-node expansion hit its depth cap; residual nodes surface as unresolved runs.',
        severity: 'warn',
        context: {
          language: context.language,
          ...(context.season ? { season: context.season } : {})
        }
      });
    }
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
        out.push(...(expanded ? interleaveSeparators(expanded) : [node]));
        break;
      }
      case 'psalmRef': {
        const antiphon = node.antiphon?.trim();
        if (antiphon) {
          // The antiphon carried inline on a psalmRef is a rendered-antiphon
          // line (Perl prefixes it with "Ant. " at presentation time). Emit
          // it as a verseMarker so the compositor's line materialisation
          // preserves the marker faithfully instead of dropping it to bare
          // text. See the Phase 3 completion plan §3c and ADR-011.
          out.push({ type: 'verseMarker', marker: 'Ant.', text: antiphon });
        }

        const expanded = expandReference(
          {
            path: `horas/Latin/Psalterium/Psalmorum/Psalm${node.psalmNumber}`,
            section: '__preamble'
          },
          context
        );
        const fallbackPsalm: Extract<TextContent, { type: 'psalmInclude' }> = {
          type: 'psalmInclude',
          psalmNumber: node.psalmNumber
        };
        out.push(
          ...(expanded && expanded.length > 0
            ? interleaveSeparators(expanded)
            : [fallbackPsalm])
        );
        break;
      }
      case 'macroRef': {
        if (node.name === 'Alleluia') {
          const expanded = expandAlleluiaMacro(context);
          out.push(...(expanded ?? [node]));
          break;
        }
        const expanded = expandNamedSection(
          macroSectionCandidates(node.name),
          [COMMON_PRAYERS_PATH, REVTRANS_PATH],
          context
        );
        out.push(...(expanded ?? [node]));
        break;
      }
      case 'formulaRef': {
        const sectionCandidates = formulaSectionCandidates(node.name);
        const expanded = expandNamedSection(
          sectionCandidates,
          formulaPathCandidates(sectionCandidates),
          context
        );
        out.push(...(expanded ?? [node]));
        break;
      }
      case 'conditional': {
        const expandedChildren = expandDeferredNodes(node.content, context);
        out.push({
          type: 'conditional',
          condition: node.condition,
          content: [...expandedChildren],
          scope: node.scope
        });
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
      // Treat empty resolutions as fallthrough so Latin "shadow" sections
      // (e.g. `Revtrans[Gloria omittitur]`) don't mask downstream paths
      // that carry the real localized text.
      if (expanded && expanded.length > 0) {
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
    langfb: context.langfb,
    ...(context.onWarning ? { onWarning: context.onWarning } : {})
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

function expandAlleluiaMacro(
  context: DeferredNodeContext
): readonly TextContent[] | undefined {
  const expanded = expandNamedSection(['Alleluia'], [COMMON_PRAYERS_PATH, REVTRANS_PATH], context);
  if (!expanded) {
    return undefined;
  }

  const verseLines = expanded.filter(
    (node): node is Extract<TextContent, { type: 'verseMarker' }> => node.type === 'verseMarker'
  );
  if (verseLines.length < 2) {
    return expanded;
  }

  const useLausTibi =
    context.season === 'septuagesima' ||
    context.season === 'lent' ||
    context.season === 'passiontide';
  return Object.freeze([useLausTibi ? verseLines[1]! : verseLines[0]!]);
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

function formulaPathCandidates(sectionCandidates: readonly string[]): readonly string[] {
  const base = [COMMON_PRAYERS_PATH, COMMON_RUBRICAE_PATH, REVTRANS_PATH];
  // For `Gloria omittitur`, Latin `Revtrans` holds an empty shadow section;
  // `Common/Translate` carries the actual localized text per language. Keep
  // `Revtrans` ahead of `Translate` so a (hypothetical) localized
  // `Revtrans[Gloria omittitur]` would still win for its own language — the
  // empty-section fallthrough in `expandNamedSection` traverses the Latin
  // shadow safely.
  return sectionCandidates.includes('Gloria omittitur')
    ? [COMMON_PRAYERS_PATH, COMMON_RUBRICAE_PATH, REVTRANS_PATH, COMMON_TRANSLATE_PATH]
    : base;
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

function interleaveSeparators(content: readonly TextContent[]): readonly TextContent[] {
  const out: TextContent[] = [];

  for (const node of content) {
    if (out.length > 0 && out[out.length - 1]?.type !== 'separator' && node.type !== 'separator') {
      out.push({ type: 'separator' });
    }
    out.push(node);
  }

  while (out[out.length - 1]?.type === 'separator') {
    out.pop();
  }

  return Object.freeze(out);
}
