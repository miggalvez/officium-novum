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
    case 'canticle-ad-benedictus':
    case 'canticle-ad-magnificat':
    case 'canticle-ad-nunc-dimittis':
      return 'canticle';
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
    const markers: Record<string, string> = {};
    let marker: string | undefined;
    for (const lang of languages) {
      const line = perLanguageLines.get(lang)?.[i];
      if (!line) continue;
      const runs = line.texts[lang];
      if (runs !== undefined) texts[lang] = runs;
      const languageMarker = line.markers?.[lang] ?? line.marker;
      if (languageMarker) markers[lang] = languageMarker;
      if (!marker && line.marker) marker = line.marker;
    }
    if (Object.keys(texts).length === 0 && !marker) continue;
    merged.push(
      Object.freeze({
        marker,
        ...(Object.keys(markers).length > 0 ? { markers: Object.freeze(markers) } : {}),
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
  if (slot === 'te-deum') {
    return teDeumLinesFromContent(language, content);
  }

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
        ...(current.marker ? { markers: Object.freeze({ [language]: localizeMarker(language, current.marker) }) } : {}),
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
    const normalized = normalizeRubricText(value).trim();
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
          const cleaned = normalizeHymnText(language, node.value);
          current = {
            parts: [{ type: 'text', value: cleaned }]
          };
          break;
        }
        if (slot === 'final-antiphon-bvm') {
          flush();
          const text = normalizeLanguageText(language, normalizeFinalAntiphonText(node.value));
          const marker = isFinalAntiphonDivineAssistance(text) ? 'V.' : undefined;
          current = {
            ...(marker ? { marker } : {}),
            parts: [{ type: 'text', value: text }]
          };
          flush();
          break;
        }
        pushRun({ type: 'text', value: normalizeLanguageText(language, normalizeSlotText(slot, node.value)) });
        break;
      case 'verseMarker':
        flush();
        if (slot === 'hymn' && /^v\.?$/iu.test(node.marker.trim())) {
          current = {
            parts: [{ type: 'text', value: normalizeHymnText(language, node.text) }]
          };
          break;
        }
        if (
          slot === 'final-antiphon-bvm' &&
          /^v\.?$/iu.test(node.marker.trim()) &&
          /^(?:Gaude|Rejoice)\b/u.test(stripLeadingGabcInlineCue(node.text).trim())
        ) {
          lines.push(singleRunLine(language, undefined, { type: 'text', value: '_' }));
        }
        if (
          slot === 'final-antiphon-bvm' &&
          /^v\.?$/iu.test(node.marker.trim()) &&
          /^(?:Orémus|Let us pray)\.?$/u.test(stripLeadingGabcInlineCue(node.text).trim())
        ) {
          lines.push(singleRunLine(language, undefined, { type: 'text', value: '_' }));
        }
        current = {
          marker: node.marker,
          parts: [
            {
              type: 'text',
              value: normalizeLanguageText(language, normalizeVerseMarkerText(slot, node.marker, node.text))
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
        lines.push(
          singleRunLine(language, undefined, { type: 'rubric', value: normalizeRubricText(node.value) })
        );
        break;
      case 'heading':
        flush();
        lines.push(singleRunLine(language, '#', { type: 'text', value: node.value }));
        break;
      case 'separator':
        flush();
        // These slots render corpus separator nodes as literal underscore-only
        // lines in the legacy stream.
        if (
          slot === 'hymn' ||
          (slot === 'lectio-brevis' &&
            (node.source !== undefined || isHomilyBoundarySeparator(content, index))) ||
          slot === 'martyrology' ||
          slot === 'responsory' ||
          slot === 'versicle'
        ) {
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

interface TeDeumFlatLine {
  readonly marker?: string;
  readonly text: string;
}

function teDeumLinesFromContent(
  language: string,
  content: readonly TextContent[]
): ComposedLine[] {
  const flat: TeDeumFlatLine[] = [];
  let current: { marker?: string; text: string } | undefined;

  const flush = () => {
    if (!current) return;
    if (current.text.trim().length > 0 || current.marker) {
      flat.push(Object.freeze({ ...current }));
    }
    current = undefined;
  };
  const appendText = (value: string) => {
    if (value.length === 0) return;
    if (!current) current = { text: '' };
    current.text += value;
  };
  const pushLine = (line: TeDeumFlatLine) => {
    flush();
    if (line.text.trim().length > 0 || line.marker) {
      flat.push(Object.freeze(line));
    }
  };

  for (const node of content) {
    switch (node.type) {
      case 'text': {
        if (isSuppressedTeDeumRubricText(node.value)) {
          flush();
          break;
        }
        appendText(normalizeLanguageText(language, normalizeSlotText('te-deum', node.value)));
        break;
      }
      case 'rubric': {
        if (isSuppressedTeDeumRubricText(node.value)) {
          flush();
          break;
        }
        pushLine({ text: normalizeLanguageText(language, normalizeRubricText(node.value)) });
        break;
      }
      case 'verseMarker':
        pushLine({
          marker: node.marker,
          text: normalizeLanguageText(language, normalizeVerseMarkerText('te-deum', node.marker, node.text))
        });
        break;
      case 'heading':
        pushLine({ marker: '#', text: node.value });
        break;
      case 'separator':
        flush();
        break;
      case 'citation':
        appendText(` ${node.value}`);
        break;
      case 'gabcNotation': {
        const headerText = renderGabcHeaderText('te-deum', node.notation);
        if (headerText) {
          pushLine(headerText);
        }
        break;
      }
      case 'conditional':
      case 'psalmRef':
      case 'psalmInclude':
      case 'macroRef':
      case 'formulaRef':
      case 'reference':
        break;
    }
  }
  flush();

  const combined: TeDeumFlatLine[] = [];
  for (let index = 0; index < flat.length; index += 1) {
    const line = flat[index]!;
    if (!line.marker && isTeDeumInlineRubricText(line.text)) {
      const next = flat[index + 1];
      if (next && !next.marker) {
        combined.push(Object.freeze({
          text: `${normalizeRubricText(line.text)} ${next.text}`
        }));
        index += 1;
        continue;
      }
    }
    combined.push(line);
  }

  return combined.map((line) =>
    singleRunLine(language, line.marker, {
      type: 'text',
      value: line.text
    })
  );
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

function stripLeadingGabcInlineCue(text: string): string {
  return text.replace(/^\{:[^}]*:\}\s*/u, '');
}

function normalizeHymnText(language: string, text: string): string {
  const withoutCue = stripLeadingGabcInlineCue(text);
  const verseMatch = withoutCue.match(/^v\.\s+(.*)$/u);
  const normalized = stripHymnDoxologyMarker(verseMatch?.[1] ?? withoutCue);
  if (language === 'English' && normalized === 'Hymnus') {
    return 'Hymn';
  }
  return normalized;
}

function normalizeSlotText(slot: SlotName, text: string): string {
  const withoutContractionMarkerResidue = normalizeContractedMarkerText(stripLeadingGabcInlineCue(text));
  if (slot !== 'psalmody') {
    return slot === 'lectio-brevis'
      ? normalizeLessonVerseInitial(withoutContractionMarkerResidue)
      : withoutContractionMarkerResidue;
  }
  return withoutContractionMarkerResidue
    .replace(/^(\d+:\d+)[a-z](\b)/iu, '$1$2')
    .replace(/\s*†\s*/gu, ' ')
    .replace(/\s*\(\d+[a-z]?\)\s*/giu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

function normalizeLessonVerseInitial(text: string): string {
  return text.replace(/^(\d+\s+)(\p{Ll})/u, (_, prefix: string, initial: string) =>
    `${prefix}${initial.toLocaleUpperCase()}`
  );
}

function isHomilyBoundarySeparator(content: readonly TextContent[], index: number): boolean {
  const previous = content[index - 1];
  const next = content[index + 1];
  if (previous?.type !== 'text' || next?.type !== 'text') {
    return false;
  }
  return (
    /\b(?:Et réliqua|And the rest)\.?$/u.test(previous.value.trim()) &&
    /^(?:Homilía|Homily|Sermo|Tractatus)\b/u.test(next.value.trim())
  );
}

function normalizeLanguageText(language: string, text: string): string {
  if (language !== 'English') {
    return text;
  }
  return text
    .replace(/^Psalmus\b/u, 'Psalm')
    .replace(/Allelú(?:ia|ja)/gu, 'Alleluia')
    .replace(/allelú(?:ia|ja)/gu, 'alleluia');
}

function isTeDeumInlineRubricText(text: string): boolean {
  return /^(?:Fit reverentia|Sequens versus dicitur flexis genibus|During the following verse|Kneel for the following verse|bow head)\b/u.test(text.trim());
}

function isSuppressedTeDeumRubricText(text: string): boolean {
  return /^(?:\(sed rubrica cisterciensis dicitur\)|Fratres, quando incipiunt)/u.test(text.trim());
}

function normalizeVerseMarkerText(slot: SlotName, marker: string, text: string): string {
  if (slot === 'invitatory' && marker === 'v.') {
    return text.replace(/[+*^=_]\s/gu, '');
  }
  if (slot === 'final-antiphon-bvm') {
    return normalizeFinalAntiphonText(text);
  }
  return normalizeSlotText(slot, text);
}

function normalizeFinalAntiphonText(text: string): string {
  return text
    .replace(/^\{:[^}]*:\}\s*/u, '')
    .replace(/^v\.\s+/u, '')
    .replace(/eúndem/gu, 'eúmdem');
}

function isFinalAntiphonDivineAssistance(text: string): boolean {
  return /^(?:Divínum auxílium|May the divine assistance)\b/u.test(text.trim());
}

function normalizeContractedMarkerText(text: string): string {
  return text
    .replace(/(\S)r\. N\./gu, '$1 N.')
    .replace(/\s+r\. N\./gu, ' N.');
}

function normalizeRubricText(text: string): string {
  return text
    .replace(
      /sec(?:u|ú)nda\s+«D(?:o|ó)mine,\s+ex(?:a|á)udi»\s+omittitur/giu,
      'secunda Domine, exaudi omittitur'
    );
}

function renderGabcHeaderText(
  slot: SlotName,
  notation: Extract<TextContent, { type: 'gabcNotation' }>['notation']
): { readonly marker?: string; readonly text: string } | undefined {
  if (notation.kind !== 'header' || !notation.text) {
    return undefined;
  }

  const text = stripLeadingGabcInlineCue(notation.text);
  if (!text) {
    return undefined;
  }

  const verseMatch = text.match(
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
    text: slot === 'hymn' ? stripHymnDoxologyMarker(text) : normalizeSlotText(slot, text)
  };
}

function singleRunLine(
  language: string,
  marker: string | undefined,
  run: ComposedRun
): ComposedLine {
  const localizedMarker = marker ? localizeMarker(language, marker) : undefined;
  return Object.freeze({
    marker: localizedMarker,
    ...(localizedMarker ? { markers: Object.freeze({ [language]: localizedMarker }) } : {}),
    texts: Object.freeze({
      [language]: Object.freeze([run])
    })
  });
}

function localizeMarker(language: string, marker: string): string {
  if (language !== 'English') {
    return marker;
  }

  const trimmed = marker.trim();
  if (/^Benedictio\.?$/iu.test(trimmed)) {
    return 'Benediction.';
  }
  if (/^Absolutio\.?$/iu.test(trimmed)) {
    return 'Absolution.';
  }
  return marker;
}
