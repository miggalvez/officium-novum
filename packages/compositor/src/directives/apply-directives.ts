import type { TextContent } from '@officium-novum/parser';
import type { HourDirective, SlotName } from '@officium-novum/rubrical-engine';

export interface DirectiveContext {
  readonly hour: string;
  readonly directives: readonly HourDirective[];
  readonly gloriaOmittiturReplacement?: readonly TextContent[];
}

type SlotTransform = (
  slot: SlotName,
  content: readonly TextContent[]
) => readonly TextContent[];

/**
 * Per-slot text transformation driven by {@link HourDirective}s on the
 * {@link HourStructure}.
 *
 * Each directive is implemented as a standalone slot transform below. The
 * dispatcher applies them in a fixed, deterministic order so that pairs like
 * `omit-alleluia`/`add-alleluia` (which never co-occur in valid rubrics —
 * see §16.4 of the Phase 2 design) would still compose to a predictable
 * result if a caller somehow emits both.
 *
 * The implementations deliberately operate on resolved {@link TextContent}
 * nodes rather than trying to re-enter the parser. Each transform is a
 * bounded string manipulation keyed off liturgical patterns found in the
 * DO corpus (cf. `horas/Latin/Psalterium/Common/Prayers.txt` for Gloria
 * Patri, `horas/Latin/Psalterium/Special/Preces.txt` for the preces
 * blocks, and `horas/Latin/Psalterium/Doxologies.txt` for the seasonal
 * doxologies).
 */
export function applyDirectives(
  slot: SlotName,
  content: readonly TextContent[],
  context: DirectiveContext
): readonly TextContent[] {
  let out = content;
  const flags = new Set<HourDirective>(context.directives);

  for (const transform of transformsFor(flags, context)) {
    out = transform(slot, out);
  }

  return out;
}

function transformsFor(
  flags: ReadonlySet<HourDirective>,
  context: DirectiveContext
): SlotTransform[] {
  const pipeline: SlotTransform[] = [];

  // Dirge banners land first so the downstream alleluia/preces transforms
  // still see a consistent block.
  if (flags.has('dirge-lauds')) pipeline.push(dirgeBanner('lauds'));
  if (flags.has('dirge-vespers')) pipeline.push(dirgeBanner('vespers'));

  // Structural clip-offs before surface-text manipulations.
  if (flags.has('short-chapter-only')) pipeline.push(shortChapterOnly);
  if (flags.has('omit-gloria-patri')) {
    pipeline.push((slot, content) =>
      omitGloriaPatri(slot, content, context.gloriaOmittiturReplacement)
    );
  }
  if (flags.has('omit-responsory-gloria')) {
    pipeline.push((slot, content) =>
      omitResponsoryGloria(slot, content, context.gloriaOmittiturReplacement)
    );
  }

  if (flags.has('omit-alleluia')) pipeline.push(omitAlleluia);
  if (flags.has('add-alleluia')) pipeline.push(addAlleluia);
  if (flags.has('add-versicle-alleluia')) pipeline.push(addVersicleAlleluia);

  if (flags.has('omit-suffragium')) pipeline.push(clearSlot('suffragium'));

  if (flags.has('genuflection-at-oration')) pipeline.push(genuflectionAtOration);

  return pipeline;
}

// --------------------------------------------------------------------------
// omit-gloria-patri
// --------------------------------------------------------------------------

/**
 * Drop the closing Gloria Patri couplet from a psalmody slot.
 *
 * The doxology appears in Divinum Officium source text in two common forms:
 *
 *   1. An inline `&Gloria` macro, which resolves (post inline-expansion) into
 *      two `verseMarker` nodes: `V. Glória Patri…` and `R. Sicut erat…`.
 *   2. A literal two-line couplet at the end of a Psalm section.
 *
 * We strip both shapes when they appear at the tail of the node list. The
 * Triduum (RI §160) is the primary caller.
 */
const DEFAULT_GLORIA_OMITTITUR_REPLACEMENT: readonly TextContent[] = Object.freeze([
  Object.freeze({ type: 'text', value: 'Gloria omittitur' } satisfies TextContent)
]);

function omitGloriaPatri(
  slot: SlotName,
  content: readonly TextContent[],
  replacement: readonly TextContent[] = DEFAULT_GLORIA_OMITTITUR_REPLACEMENT
): readonly TextContent[] {
  if (slot !== 'psalmody' && !isCanticleSlot(slot)) return content;

  let end = content.length;
  while (end > 0 && content[end - 1]!.type === 'separator') {
    end -= 1;
  }

  let strippedGloria = false;
  while (end > 0 && isGloriaPatriNode(content[end - 1]!)) {
    strippedGloria = true;
    end -= 1;
    while (end > 0 && content[end - 1]!.type === 'separator') {
      end -= 1;
    }
  }

  if (!strippedGloria) {
    return content;
  }

  const out = content.slice(0, end);
  if (replacement.length > 0) {
    if (out.length > 0 && out[out.length - 1]!.type !== 'separator') {
      out.push({ type: 'separator' });
    }
    out.push(...replacement);
  }

  return Object.freeze(out);
}

function isGloriaPatriNode(node: TextContent): boolean {
  if (node.type === 'text') {
    return GLORIA_PATRI_RX.test(node.value) || SICUT_ERAT_RX.test(node.value);
  }
  if (node.type === 'verseMarker') {
    return GLORIA_PATRI_RX.test(node.text) || SICUT_ERAT_RX.test(node.text);
  }
  return false;
}

const GLORIA_PATRI_RX = /gl[óo]ria\s+patri/iu;
const SICUT_ERAT_RX = /sicut\s+erat\s+in\s+princ/iu;

function omitResponsoryGloria(
  slot: SlotName,
  content: readonly TextContent[],
  replacement: readonly TextContent[] = DEFAULT_GLORIA_OMITTITUR_REPLACEMENT
): readonly TextContent[] {
  if (slot !== 'responsory') return content;

  const out: TextContent[] = [];
  let replaced = false;
  for (const node of content) {
    if (isSicutEratNode(node)) {
      continue;
    }
    if (isGloriaPatriNode(node)) {
      if (!replaced) {
        out.push(...replacement);
        replaced = true;
      }
      continue;
    }
    out.push(node);
  }

  return replaced ? Object.freeze(out) : content;
}

function isSicutEratNode(node: TextContent): boolean {
  if (node.type === 'text') {
    return SICUT_ERAT_RX.test(node.value);
  }
  if (node.type === 'verseMarker') {
    return SICUT_ERAT_RX.test(node.text);
  }
  return false;
}

// --------------------------------------------------------------------------
// omit-alleluia / add-alleluia / add-versicle-alleluia
// --------------------------------------------------------------------------

const ALLELUIA_TAIL_RX = /,?\s*allel[úu](?:j|i)?a(?:,?\s*allel[úu](?:j|i)?a)*\.?\s*$/iu;
const ALLELUIA_PRESENT_TAIL_RX =
  /allel[úu](?:j|i)?a(?:,?\s*allel[úu](?:j|i)?a)*[\s.)]*$/iu;

function omitAlleluia(_slot: SlotName, content: readonly TextContent[]): readonly TextContent[] {
  return Object.freeze(
    content.map((node) => stripAlleluiaOnNode(node)).filter((node): node is TextContent => node !== null)
  );
}

function stripAlleluiaOnNode(node: TextContent): TextContent | null {
  if (node.type === 'text') {
    const stripped = node.value.replace(ALLELUIA_TAIL_RX, '').trimEnd();
    if (stripped.length === 0) return null;
    return { type: 'text', value: stripped };
  }
  if (node.type === 'verseMarker') {
    const stripped = node.text.replace(ALLELUIA_TAIL_RX, '').trimEnd();
    if (stripped.length === 0) return null;
    return { type: 'verseMarker', marker: node.marker, text: stripped };
  }
  return node;
}

function addAlleluia(slot: SlotName, content: readonly TextContent[]): readonly TextContent[] {
  if (slot === 'psalmody') {
    return appendAlleluiaToPsalmodyAntiphons(content);
  }
  if (slot === 'chapter') {
    if (containsAntiphonSubstitution(content) || endsWithBareDeoGratias(content)) {
      return content;
    }
  }
  if (!isAntiphonSlot(slot) && slot !== 'chapter') return content;
  return appendAlleluiaToLastText(content, ', allelúja.');
}

function addVersicleAlleluia(
  slot: SlotName,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (slot !== 'versicle' && slot !== 'responsory') return content;
  const out = content.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const node = out[i]!;
    if (node.type === 'verseMarker') {
      if (hasAlleluiaTail(node.text)) return Object.freeze(out);
      out[i] = {
        type: 'verseMarker',
        marker: node.marker,
        text: appendSuffixBeforeLegacyPayload(node.text, ', allelúja, allelúja.')
      };
      return Object.freeze(out);
    }
  }
  return Object.freeze(out);
}

function appendAlleluiaToLastText(
  content: readonly TextContent[],
  suffix: string
): readonly TextContent[] {
  const out = content.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const node = out[i]!;
    if (node.type === 'text') {
      if (hasAlleluiaTail(node.value)) return Object.freeze(out);
      out[i] = { type: 'text', value: appendSuffixBeforeLegacyPayload(node.value, suffix) };
      return Object.freeze(out);
    }
    if (node.type === 'verseMarker') {
      if (hasAlleluiaTail(node.text)) return Object.freeze(out);
      out[i] = {
        type: 'verseMarker',
        marker: node.marker,
        text: appendSuffixBeforeLegacyPayload(node.text, suffix)
      };
      return Object.freeze(out);
    }
  }
  return Object.freeze(out);
}

function appendAlleluiaToPsalmodyAntiphons(
  content: readonly TextContent[]
): readonly TextContent[] {
  let changed = false;
  const out = content.map((node) => {
    if (node.type === 'text' && isAntiphonLine(node.value)) {
      if (hasAlleluiaTail(node.value)) {
        return node;
      }
      changed = true;
      return {
        type: 'text',
        value: appendSuffixBeforeLegacyPayload(node.value, ', allelúja.')
      } satisfies TextContent;
    }

    if (
      node.type === 'verseMarker' &&
      (node.marker === 'Ant.' || isAntiphonLine(node.text))
    ) {
      if (hasAlleluiaTail(node.text)) {
        return node;
      }
      changed = true;
      return {
        type: 'verseMarker',
        marker: node.marker,
        text: appendSuffixBeforeLegacyPayload(node.text, ', allelúja.')
      } satisfies TextContent;
    }

    return node;
  });

  return changed ? Object.freeze(out) : content;
}

function hasAlleluiaTail(value: string): boolean {
  return ALLELUIA_PRESENT_TAIL_RX.test(value.replace(/;;.*$/u, ''));
}

function appendSuffixBeforeLegacyPayload(value: string, suffix: string): string {
  const match = /^(?<text>.*?)(?<payload>;;.*)?$/u.exec(value);
  const text = match?.groups?.text ?? value;
  const payload = match?.groups?.payload ?? '';
  return `${text.replace(/\.?\s*$/u, '')}${suffix}${payload}`;
}

function endsWithBareDeoGratias(content: readonly TextContent[]): boolean {
  for (let i = content.length - 1; i >= 0; i--) {
    const node = content[i]!;
    if (node.type === 'separator') continue;
    return isBareDeoGratiasNode(node);
  }
  return false;
}

function isBareDeoGratiasNode(node: TextContent): boolean {
  if (node.type === 'verseMarker') {
    return node.marker === 'R.' && DEO_GRATIAS_TEXT_RX.test(node.text.trim());
  }
  if (node.type === 'text') {
    return DEO_GRATIAS_LINE_RX.test(node.value.trim());
  }
  return false;
}

const DEO_GRATIAS_TEXT_RX = /^Deo gr[áa]tias\.?$/iu;
const DEO_GRATIAS_LINE_RX = /^R\.\s*Deo gr[áa]tias\.?$/iu;

function isAntiphonLine(value: string): boolean {
  return /^ant\./iu.test(value.trimStart());
}

function containsAntiphonSubstitution(content: readonly TextContent[]): boolean {
  return content.some(
    (node) =>
      (node.type === 'verseMarker' && node.marker === 'Ant.') ||
      (node.type === 'text' && isAntiphonLine(node.value))
  );
}

function isAntiphonSlot(slot: SlotName): boolean {
  return (
    slot === 'antiphon-ad-benedictus' ||
    slot === 'antiphon-ad-magnificat' ||
    slot === 'antiphon-ad-nunc-dimittis'
  );
}

function isCanticleSlot(slot: SlotName): boolean {
  return (
    slot === 'canticle-ad-benedictus' ||
    slot === 'canticle-ad-magnificat' ||
    slot === 'canticle-ad-nunc-dimittis'
  );
}

// --------------------------------------------------------------------------
// suffragium / dirge: banner + clear
// --------------------------------------------------------------------------

function clearSlot(targetSlot: SlotName): SlotTransform {
  return (slot, content) => {
    if (slot !== targetSlot) return content;
    return Object.freeze([]);
  };
}

function dirgeBanner(hour: 'lauds' | 'vespers'): SlotTransform {
  const label =
    hour === 'vespers'
      ? 'Pro defunctis — Vesperæ defunctorum'
      : 'Pro defunctis — Laudes defunctorum';
  return (slot, content) => {
    if (slot !== 'oration') return content;
    const rubric: TextContent = { type: 'rubric', value: label };
    return Object.freeze([rubric, ...content]);
  };
}

// --------------------------------------------------------------------------
// short-chapter-only
// --------------------------------------------------------------------------

/**
 * Keep only the chapter's first block — clipping off trailing versicle/
 * responsory content that may have been pulled in by inline reference
 * expansion. The first `separator` or any `R.br.`/`Responsorium.`
 * {@link TextContent.verseMarker} ends the retained slice.
 */
function shortChapterOnly(slot: SlotName, content: readonly TextContent[]): readonly TextContent[] {
  if (slot !== 'chapter') return content;
  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type === 'separator') break;
    if (node.type === 'verseMarker' && (node.marker === 'R.br.' || node.marker === 'Responsorium.')) {
      break;
    }
    out.push(node);
  }
  return Object.freeze(out);
}

// --------------------------------------------------------------------------
// genuflection-at-oration
// --------------------------------------------------------------------------

function genuflectionAtOration(
  slot: SlotName,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (slot !== 'oration') return content;
  const open: TextContent = { type: 'rubric', value: 'Flectámus génua.' };
  const close: TextContent = { type: 'rubric', value: 'Leváte.' };
  return Object.freeze([open, ...content, close]);
}
