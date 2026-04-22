import type { TextContent } from '@officium-novum/parser';
import type { SlotName } from '@officium-novum/rubrical-engine';

import type { ComposedLine, ComposedRun, Section, SectionType } from '../types/composed-hour.js';

export interface EmitSectionOptions {
  readonly slot: SlotName;
  readonly sectionSlot?: string;
  readonly sectionType?: SectionType;
}

/**
 * Classify a {@link SlotName} into a {@link SectionType}. Several slots map
 * cleanly; others fall back to `other`.
 */
export function sectionTypeFor(slot: SlotName): SectionType {
  switch (slot) {
    case 'incipit':
      return 'other';
    case 'hymn':
      return 'hymn';
    case 'psalmody':
      return 'psalm';
    case 'martyrology':
      return 'martyrology';
    case 'de-officio-capituli':
      return 'other';
    case 'chapter':
      return 'chapter';
    case 'responsory':
      return 'responsory';
    case 'versicle':
      return 'versicle';
    case 'antiphon-ad-benedictus':
    case 'antiphon-ad-magnificat':
    case 'antiphon-ad-nunc-dimittis':
      return 'antiphon';
    case 'oration':
      return 'oration';
    case 'lectio-brevis':
      return 'lectio-brevis';
    case 'benedictio':
      return 'benedictio';
    case 'commemoration-antiphons':
    case 'commemoration-versicles':
    case 'commemoration-orations':
      return 'commemoration';
    case 'preces':
      return 'preces';
    case 'suffragium':
      return 'suffragium';
    case 'te-deum':
      return 'te-deum';
    case 'invitatory':
      return 'invitatory';
    case 'conclusion':
      return 'conclusion';
    case 'final-antiphon-bvm':
      return 'antiphon';
    case 'doxology-variant':
      return 'hymn';
  }
}

/**
 * Materialize per-language {@link TextContent} arrays into a single
 * {@link Section} with one line per verse/segment, collapsing parallel
 * languages into a `Record<lang, ComposedRun[]>` on each line.
 *
 * The languages are assumed to be aligned — if one language has more verses
 * than another (e.g., a short translation merges two Latin verses), missing
 * slots are left absent rather than padded with empty strings.
 */
export function emitSection(
  slot: SlotName,
  perLanguage: ReadonlyMap<string, readonly TextContent[]>,
  reference: string | undefined
): Section {
  return emitConfiguredSection({ slot }, perLanguage, reference);
}

export function emitConfiguredSection(
  options: EmitSectionOptions,
  perLanguage: ReadonlyMap<string, readonly TextContent[]>,
  reference: string | undefined
): Section {
  const languages = Array.from(perLanguage.keys());
  const perLanguageLines = new Map<string, ComposedLine[]>();
  for (const [lang, content] of perLanguage) {
    perLanguageLines.set(lang, linesFromContent(options, lang, content));
  }

  const maxLength = Math.max(0, ...Array.from(perLanguageLines.values(), (l) => l.length));
  const merged: ComposedLine[] = [];
  for (let i = 0; i < maxLength; i++) {
    const texts: Record<string, readonly ComposedRun[]> = {};
    let marker: string | undefined;
    for (const lang of languages) {
      const line = perLanguageLines.get(lang)?.[i];
      if (!line) continue;
      const runs = line.texts[lang];
      if (runs !== undefined) texts[lang] = runs;
      if (!marker && line.marker) marker = line.marker;
    }
    if (Object.keys(texts).length === 0 && !marker) continue;
    merged.push(
      Object.freeze({
        marker,
        texts: Object.freeze(texts)
      })
    );
  }

  return Object.freeze({
    type: options.sectionType ?? sectionTypeFor(options.slot),
    slot: options.sectionSlot ?? options.slot,
    reference,
    lines: Object.freeze(merged),
    languages: Object.freeze(languages),
    heading: undefined
  });
}

function linesFromContent(
  options: EmitSectionOptions,
  language: string,
  content: readonly TextContent[]
): ComposedLine[] {
  const slot = options.slot;
  const lines: ComposedLine[] = [];
  let current: { marker?: string; parts: ComposedRun[] } | undefined;
  const flush = () => {
    if (!current) return;
    if (current.parts.length === 0 && !current.marker) {
      current = undefined;
      return;
    }
    lines.push(
      Object.freeze({
        marker: current.marker,
        texts: Object.freeze({
          [language]: Object.freeze([...current.parts])
        })
      })
    );
    current = undefined;
  };
  const ensure = () => {
    if (!current) current = { parts: [] };
    return current;
  };
  const pushRun = (run: ComposedRun) => {
    const line = ensure();
    const previous = line.parts.at(-1);
    if (run.type === 'text' && previous?.type === 'text') {
      line.parts[line.parts.length - 1] = {
        type: 'text',
        value: `${previous.value}${run.value}`
      };
      return;
    }
    line.parts.push(run);
  };
  const pushInlineRubric = (value: string) => {
    const normalized = value.trim();
    if (normalized.length === 0) return;
    const line = ensure();
    const previous = line.parts.at(-1);
    if (previous?.type === 'text' && !/\s$/u.test(previous.value)) {
      line.parts.push({ type: 'text', value: ' ' });
    }
    line.parts.push({ type: 'rubric', value: normalized });
    line.parts.push({ type: 'text', value: ' ' });
  };

  for (let index = 0; index < content.length; index += 1) {
    const node = content[index]!;
    switch (node.type) {
      case 'text':
        if (slot === 'hymn') {
          flush();
          // Phase 3 §3h: hymn doxology stanzas in the corpus are prefixed
          // with `* ` to mark the doxology (`* Deo Patri sit glória,` etc.)
          // — a DO convention that is not part of the rendered liturgical
          // text. The legacy Perl renderer strips it; we do too so the
          // compositor matches the source author's intent.
          // See `upstream/.../Psalterium/Special/Prima Special.txt:107`.
          const cleaned = stripHymnDoxologyMarker(node.value);
          current = {
            parts: [{ type: 'text', value: cleaned }]
          };
          break;
        }
        pushRun({ type: 'text', value: normalizeSlotText(slot, node.value) });
        break;
      case 'verseMarker':
        flush();
        current = {
          marker: node.marker,
          parts: [
            {
              type: 'text',
              value: normalizeVerseMarkerText(slot, node.marker, node.text)
            }
          ]
        };
        const continuesInlineRubric =
          content[index + 1]?.type === 'rubric' && content[index + 2]?.type === 'text';
        if (!continuesInlineRubric) {
          flush();
        }
        break;
      case 'rubric':
        if (current) {
          pushInlineRubric(node.value);
          break;
        }
        flush();
        lines.push(singleRunLine(language, undefined, { type: 'rubric', value: node.value }));
        break;
      case 'heading':
        flush();
        lines.push(singleRunLine(language, '#', { type: 'text', value: node.value }));
        break;
      case 'separator':
        flush();
        // Hymns and Prime Martyrology both render corpus separator nodes as
        // literal underscore-only lines in the legacy stream.
        if (slot === 'hymn' || slot === 'martyrology') {
          lines.push(singleRunLine(language, undefined, { type: 'text', value: '_' }));
        }
        break;
      case 'citation':
        pushRun({ type: 'text', value: ' ' });
        pushRun({ type: 'citation', value: node.value });
        break;
      case 'psalmRef':
        break;
      case 'psalmInclude':
        pushRun({
          type: 'unresolved-reference',
          ref: {
            path: `horas/Latin/Psalterium/Psalmorum/Psalm${node.psalmNumber}`,
            section: '__preamble',
            substitutions: [],
            isPreamble: false
          }
        });
        break;
      case 'macroRef':
        pushRun({ type: 'unresolved-macro', name: node.name });
        break;
      case 'formulaRef':
        pushRun({ type: 'unresolved-formula', name: node.name });
        break;
      case 'reference':
        pushRun({ type: 'unresolved-reference', ref: node.ref });
        break;
      case 'gabcNotation': {
        const headerText = renderGabcHeaderText(slot, node.notation);
        if (!headerText) {
          break;
        }
        flush();
        lines.push(
          singleRunLine(language, headerText.marker, {
            type: 'text',
            value: headerText.text
          })
        );
        break;
      }
      case 'conditional':
        break;
    }
  }
  flush();
  return lines;
}

/**
 * Strip the `* ` doxology-stanza marker that the Divinum Officium corpus
 * conventionally prefixes to the final stanza of metrical hymns (e.g.
 * `* Deo Patri sit glória,`). The `*` is a rendering hint, not part of the
 * liturgical text; the legacy Perl renderer strips it, and we do too.
 *
 * The function is intentionally narrow — only the leading `*` followed by
 * one whitespace character is removed, preserving any `*` that appears
 * mid-line (which is a legitimate hymn separator in some traditions).
 */
function stripHymnDoxologyMarker(text: string): string {
  return text.replace(/^\*\s+/u, '');
}

function normalizeSlotText(slot: SlotName, text: string): string {
  if (slot !== 'psalmody') {
    return text;
  }
  return text
    .replace(/^(\d+:\d+)[a-z](\b)/iu, '$1$2')
    .replace(/\s*†\s*/gu, ' ')
    .replace(/\s*\(\d+[a-z]?\)\s*/giu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

function normalizeVerseMarkerText(slot: SlotName, marker: string, text: string): string {
  if (slot === 'invitatory' && marker === 'v.') {
    return text.replace(/[+*^=_]\s/gu, '');
  }
  return normalizeSlotText(slot, text);
}

function renderGabcHeaderText(
  slot: SlotName,
  notation: Extract<TextContent, { type: 'gabcNotation' }>['notation']
): { readonly marker?: string; readonly text: string } | undefined {
  if (notation.kind !== 'header' || !notation.text) {
    return undefined;
  }

  const verseMatch = notation.text.match(
    /^(v\.|r\.|V\.|R\.|R\.br\.|Responsorium\.|Ant\.|Benedictio\.|Absolutio\.|M\.|S\.)\s+(.*)$/u
  );
  if (verseMatch) {
    const marker = verseMatch[1];
    const verseText = verseMatch[2];
    if (!marker || !verseText) {
      return undefined;
    }
    if (slot === 'hymn' && marker === 'v.') {
      return { text: stripHymnDoxologyMarker(verseText) };
    }
    return {
      marker,
      text: normalizeVerseMarkerText(slot, marker, verseText)
    };
  }

  return {
    text: slot === 'hymn' ? stripHymnDoxologyMarker(notation.text) : normalizeSlotText(slot, notation.text)
  };
}

function singleRunLine(
  language: string,
  marker: string | undefined,
  run: ComposedRun
): ComposedLine {
  return Object.freeze({
    marker,
    texts: Object.freeze({
      [language]: Object.freeze([run])
    })
  });
}
