import type { HourName, HourStructure, SlotContent, SlotName } from '@officium-novum/rubrical-engine';

import { isMinorHour } from './psalmody.js';
import type { ComposedLine, ComposedRun, Section } from '../types/composed-hour.js';

export function withMinorHourLaterBlockSeparator(
  hour: HourName,
  slot: SlotName,
  structure: HourStructure,
  section: Section
): Section {
  if (!isMinorHour(hour) || (slot !== 'responsory' && slot !== 'versicle')) {
    return section;
  }
  if (slot === 'responsory' && !isRenderableLaterBlockSlot(structure.slots.chapter)) {
    return section;
  }
  if (
    slot === 'versicle' &&
    !isRenderableLaterBlockSlot(structure.slots.chapter) &&
    !isRenderableLaterBlockSlot(structure.slots.responsory)
  ) {
    return section;
  }

  return Object.freeze({
    ...section,
    lines: Object.freeze([separatorLine(section.languages), ...section.lines])
  });
}

export function withCommemorationSeparator(slot: SlotName, section: Section): Section {
  if (
    slot !== 'commemoration-antiphons' &&
    slot !== 'commemoration-versicles' &&
    slot !== 'commemoration-orations'
  ) {
    return section;
  }
  if (section.lines[0] && isSeparatorLine(section.lines[0])) {
    return section;
  }

  return Object.freeze({
    ...section,
    lines: Object.freeze([separatorLine(section.languages), ...section.lines])
  });
}

function isSeparatorLine(line: ComposedLine): boolean {
  const entries = Object.values(line.texts);
  return (
    entries.length > 0 &&
    entries.every((runs) => runs.length === 1 && runs[0]?.type === 'text' && runs[0].value === '_')
  );
}

function isRenderableLaterBlockSlot(content: SlotContent | undefined): boolean {
  return content !== undefined && content.kind !== 'empty';
}

function separatorLine(languages: readonly string[]): ComposedLine {
  const texts: Record<string, readonly ComposedRun[]> = {};
  for (const language of languages) {
    texts[language] = Object.freeze([{ type: 'text', value: '_' }]);
  }
  return Object.freeze({
    texts: Object.freeze(texts)
  });
}
