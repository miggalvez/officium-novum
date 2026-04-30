import type { HourStructure, SlotContent, SlotName } from '@officium-novum/rubrical-engine';

import type { Section, SlotAccountingEntry } from '../types/composed-hour.js';

export function buildSlotAccounting(
  hour: HourStructure,
  sections: readonly Section[]
): readonly SlotAccountingEntry[] {
  const renderedSlots = new Set(sections.map((section) => section.slot));
  return (Object.entries(hour.slots) as ReadonlyArray<[SlotName, SlotContent]>).map(
    ([slot, content]) => {
      if (!content) {
        return slotAccounting(slot, 'rubrically-omitted', 'slot is undefined');
      }
      if (renderedSlots.has(slot)) {
        return slotAccounting(slot, 'rendered', 'section emitted');
      }
      if (content.kind === 'empty') {
        return slotAccounting(slot, 'rubrically-omitted', 'empty slot');
      }
      if (slot === 'doxology-variant') {
        return slotAccounting(slot, 'rubrically-omitted', 'directive-only slot');
      }
      if (content.kind === 'matins-invitatorium' && content.source.kind === 'suppressed') {
        return slotAccounting(slot, 'rubrically-omitted', 'suppressed Matins invitatory');
      }
      if (content.kind === 'te-deum') {
        if (content.decision === 'omit') {
          return slotAccounting(slot, 'rubrically-omitted', 'Te Deum omitted by rubric');
        }
        if (content.decision === 'replace-with-responsory') {
          return slotAccounting(slot, 'rendered', 'Te Deum replaced by final responsory');
        }
      }
      if (content.kind === 'matins-nocturns') {
        return slotAccounting(slot, 'unresolved-error', 'Matins nocturn plan emitted no sections');
      }
      return slotAccounting(
        slot,
        'rubrically-omitted',
        'no renderable content after condition or directive filtering'
      );
    }
  );
}

function slotAccounting(
  slot: SlotName,
  status: SlotAccountingEntry['status'],
  reason: string
): SlotAccountingEntry {
  return Object.freeze({ slot, status, reason });
}
