import {
  parseCondition,
  ConditionParseError,
  type Condition,
  type ParsedFile,
  type TextContent
} from '@officium-novum/parser';

import type { OfficeTextIndex } from '../types/model.js';
import type { HourName } from '../types/ordo.js';
import type { SlotName } from '../types/hour-structure.js';
import type { ResolvedVersion } from '../types/version.js';

export interface SkeletonSlot {
  readonly name: SlotName;
  readonly header: string;
  readonly content: readonly TextContent[];
  /**
   * Condition that, when true, marks this slot as omitted under the
   * current policy/context. Sourced from parenthesized Ordinarium rubrics
   * carrying an `omittitur` / `omittuntur` {@link Instruction}, e.g.
   * `(sed rubrica 196 aut rubrica 1955 omittuntur)` after `#Antiphona
   * finalis`.
   */
  readonly omissionCondition?: Condition;
}

export interface OrdinariumSkeleton {
  readonly hour: HourName;
  readonly version: string;
  readonly sourcePath: string;
  readonly slots: readonly SkeletonSlot[];
}

const ORDINARIUM_FILES: Readonly<Record<HourName, string | null>> = {
  matins: 'horas/Ordinarium/Matutinum.txt',
  lauds: 'horas/Ordinarium/Laudes.txt',
  prime: 'horas/Ordinarium/Prima.txt',
  terce: 'horas/Ordinarium/Minor.txt',
  sext: 'horas/Ordinarium/Minor.txt',
  none: 'horas/Ordinarium/Minor.txt',
  vespers: 'horas/Ordinarium/Vespera.txt',
  compline: 'horas/Ordinarium/Completorium.txt'
};

export class OrdinariumSkeletonCache {
  private readonly entries = new Map<string, OrdinariumSkeleton>();

  get(hour: HourName, version: ResolvedVersion, corpus: OfficeTextIndex): OrdinariumSkeleton {
    const key = `${version.handle}::${hour}`;
    const cached = this.entries.get(key);
    if (cached) {
      return cached;
    }

    const built = loadOrdinariumSkeleton(hour, version, corpus);
    this.entries.set(key, built);
    return built;
  }

  getOrEmpty(
    hour: HourName,
    version: ResolvedVersion,
    corpus: OfficeTextIndex
  ): { readonly skeleton: OrdinariumSkeleton; readonly missing: boolean } {
    const path = ORDINARIUM_FILES[hour];
    if (!path || !corpus.getFile(path)) {
      const empty = emptySkeleton(hour, version, path ?? '');
      return { skeleton: empty, missing: true };
    }
    return { skeleton: this.get(hour, version, corpus), missing: false };
  }
}

function emptySkeleton(
  hour: HourName,
  version: ResolvedVersion,
  sourcePath: string
): OrdinariumSkeleton {
  return Object.freeze({
    hour,
    version: version.handle,
    sourcePath,
    slots: Object.freeze([])
  });
}

/**
 * Parses the appropriate `Ordinarium/*.txt` into an ordered list of slots.
 *
 * Ordinarium files use the legacy `#Heading` convention rather than `[Header]`
 * sections. The parser emits those as `{ type: 'heading', value: ... }`
 * {@link TextContent} entries inside the `__preamble` section; we walk those
 * entries in order and map each heading to a {@link SlotName}, collecting the
 * content that follows into that slot.
 */
export function loadOrdinariumSkeleton(
  hour: HourName,
  version: ResolvedVersion,
  corpus: OfficeTextIndex
): OrdinariumSkeleton {
  const path = ORDINARIUM_FILES[hour];
  if (!path) {
    throw new Error(`No Ordinarium file mapping for hour '${hour}'`);
  }

  const file = corpus.getFile(path);
  if (!file) {
    throw new Error(`Ordinarium file not found in corpus: ${path}`);
  }

  const slots = buildSlots(file);
  return {
    hour,
    version: version.handle,
    sourcePath: path,
    slots
  };
}

function buildSlots(file: ParsedFile): readonly SkeletonSlot[] {
  const slots: SkeletonSlot[] = [];
  const seen = new Set<SlotName>();

  const sectionsToScan = file.sections.length > 0 ? file.sections : [];
  for (const section of sectionsToScan) {
    let currentHeading: string | undefined;
    let currentNames: readonly SlotName[] = [];
    let currentBuffer: TextContent[] = [];
    let currentOmission: Condition | undefined;

    const flush = (): void => {
      if (!currentHeading || currentNames.length === 0) {
        return;
      }
      const frozenContent = Object.freeze([...currentBuffer]);
      const header = currentHeading;
      const omission = currentOmission;
      for (const name of currentNames) {
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        slots.push(
          freezeSlot({
            name,
            header,
            content: frozenContent,
            ...(omission ? { omissionCondition: omission } : {})
          })
        );
      }
    };

    for (const content of section.content) {
      if (content.type === 'heading') {
        flush();
        currentHeading = content.value.trim();
        currentNames = mapHeaderToSlots(currentHeading);
        currentBuffer = [];
        currentOmission = undefined;
        continue;
      }

      if (currentNames.length === 0) {
        continue;
      }

      // Detect a parenthesized omission rubric immediately after a heading,
      // e.g. `(sed rubrica 196 aut rubrica 1955 aut rubrica cisterciensis
      // omittuntur)`. Once captured we still append the text to the slot
      // content so downstream consumers see the full skeleton.
      if (
        currentBuffer.length === 0 &&
        currentOmission === undefined &&
        content.type === 'text'
      ) {
        const omission = tryParseOmissionCondition(content.value);
        if (omission) {
          currentOmission = omission;
        }
      }

      currentBuffer.push(content);
    }

    flush();
  }

  return Object.freeze(slots);
}

function tryParseOmissionCondition(raw: string): Condition | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }

  try {
    const condition = parseCondition(trimmed);
    if (
      condition.instruction === 'omittitur' ||
      condition.instruction === 'omittuntur'
    ) {
      return condition;
    }
  } catch (error) {
    if (error instanceof ConditionParseError) {
      return undefined;
    }
    throw error;
  }
  return undefined;
}

/**
 * Ordinarium headings are often "compound" — e.g. `#Capitulum Hymnus Versus`
 * denotes three distinct slots (chapter, hymn, versicle) sharing one line.
 * Returning a list here keeps all the slots reachable while the caller still
 * dedupes by {@link SlotName}.
 */
export function mapHeaderToSlots(header: string): readonly SlotName[] {
  const normalized = header.trim();

  if (normalized === 'Invit' || normalized.startsWith('Invitatorium')) {
    return ['invitatory'];
  }
  if (normalized === 'Oratio') {
    return ['oration'];
  }
  if (normalized === 'Lectio brevis') {
    return ['lectio-brevis'];
  }
  if (/^Preces/u.test(normalized)) {
    return ['preces'];
  }
  if (normalized === 'Suffragium') {
    return ['suffragium'];
  }
  if (normalized === 'Antiphona finalis') {
    return ['final-antiphon-bvm'];
  }
  if (normalized === 'Conclusio') {
    return ['conclusion'];
  }
  if (/^Canticum/u.test(normalized)) {
    if (/Benedictus/u.test(normalized)) {
      return ['antiphon-ad-benedictus'];
    }
    if (/Magnificat/u.test(normalized)) {
      return ['antiphon-ad-magnificat'];
    }
    if (/Nunc dimittis/u.test(normalized)) {
      return ['antiphon-ad-nunc-dimittis'];
    }
  }

  // Compound headings: tokenize and map each token to a slot.
  const tokens = normalized.split(/\s+/u);
  const slots: SlotName[] = [];
  for (const token of tokens) {
    const mapped = mapTokenToSlot(token);
    if (mapped && !slots.includes(mapped)) {
      slots.push(mapped);
    }
  }
  return slots;
}

function mapTokenToSlot(token: string): SlotName | undefined {
  if (token === 'Hymnus' || token === 'Hymn') {
    return 'hymn';
  }
  if (token === 'Psalmi') {
    return 'psalmody';
  }
  if (/^Capitulum/u.test(token)) {
    return 'chapter';
  }
  if (/^Responsorium/u.test(token)) {
    return 'responsory';
  }
  if (/^(Versum|Versus)/u.test(token)) {
    return 'versicle';
  }
  return undefined;
}

function freezeSlot(slot: SkeletonSlot): SkeletonSlot {
  return Object.freeze(slot);
}
