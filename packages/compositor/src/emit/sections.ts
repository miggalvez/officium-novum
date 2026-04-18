import type { TextContent } from '@officium-novum/parser';
import type { SlotName } from '@officium-novum/rubrical-engine';

import type { ComposedLine, ComposedRun, Section, SectionType } from '../types/composed-hour.js';

/**
 * Classify a {@link SlotName} into a {@link SectionType}. Several slots map
 * cleanly; others fall back to `other`.
 */
export function sectionTypeFor(slot: SlotName): SectionType {
  switch (slot) {
    case 'hymn':
      return 'hymn';
    case 'psalmody':
      return 'psalm';
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
  const languages = Array.from(perLanguage.keys());
  const perLanguageLines = new Map<string, ComposedLine[]>();
  for (const [lang, content] of perLanguage) {
    perLanguageLines.set(lang, linesFromContent(lang, content));
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
    type: sectionTypeFor(slot),
    slot,
    reference,
    lines: Object.freeze(merged),
    languages: Object.freeze(languages),
    heading: undefined
  });
}

function linesFromContent(language: string, content: readonly TextContent[]): ComposedLine[] {
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

  for (const node of content) {
    switch (node.type) {
      case 'text':
        pushRun({ type: 'text', value: node.value });
        break;
      case 'verseMarker':
        flush();
        current = {
          marker: node.marker,
          parts: [{ type: 'text', value: node.text }]
        };
        flush();
        break;
      case 'rubric':
        flush();
        lines.push(singleRunLine(language, undefined, { type: 'rubric', value: node.value }));
        break;
      case 'heading':
        flush();
        lines.push(singleRunLine(language, '#', { type: 'text', value: node.value }));
        break;
      case 'separator':
        flush();
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
      case 'conditional':
        break;
    }
  }
  flush();
  return lines;
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
