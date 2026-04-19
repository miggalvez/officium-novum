import type { TextContent } from '@officium-novum/parser';
import type { SlotName } from '@officium-novum/rubrical-engine';

/**
 * Slots whose composed output is entirely antiphon text — the Perl renderer
 * prefixes their first line with `Ant. `. Matins psalmody antiphons are
 * handled per-ref by {@link markAntiphonRef}; they are not whole-slot
 * antiphons.
 */
const WHOLE_ANTIPHON_SLOTS: ReadonlySet<SlotName> = new Set<SlotName>([
  'invitatory',
  'antiphon-ad-benedictus',
  'antiphon-ad-magnificat',
  'antiphon-ad-nunc-dimittis',
  'commemoration-antiphons'
]);

export function isWholeAntiphonSlot(slot: SlotName): boolean {
  return WHOLE_ANTIPHON_SLOTS.has(slot);
}

/**
 * Convert the first `text` node in a resolved antiphon block into a
 * `verseMarker` node carrying `marker: 'Ant.'`. Every downstream text node
 * in the same block stays as-is — consecutive text nodes concatenate in the
 * emit layer so the single marker applies to the whole rendered line.
 *
 * Per ADR-011 and the Phase 3 completion plan §3c, this is how the
 * compositor synthesises the `Ant.` marker that the legacy Perl renderer
 * emits at presentation time. Source corpus files store antiphons as bare
 * `text` nodes (e.g. `[Ant Laudes]` in `horas/Latin/Sancti/*.txt`) or
 * inline on `psalmRef.antiphon` — the latter is handled directly in
 * `expand-deferred-nodes.ts`. This helper covers the former.
 *
 * If no `text` node is found (the antiphon resolved to a pure rubric or
 * empty content), the input is returned unchanged — surfacing an `Ant.`
 * marker in front of non-text content would be misleading.
 */
export function markAntiphonFirstText(
  content: readonly TextContent[]
): readonly TextContent[] {
  let captured = false;
  const out: TextContent[] = [];
  for (const node of content) {
    if (!captured && node.type === 'text') {
      out.push({ type: 'verseMarker', marker: 'Ant.', text: node.value });
      captured = true;
      continue;
    }
    out.push(node);
  }
  return captured ? out : content;
}
