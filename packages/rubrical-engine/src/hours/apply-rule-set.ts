import type { ParsedFile } from '@officium-novum/parser';

import { conditionMatches } from '../internal/conditions.js';
import { resolveOfficeFile } from '../internal/content.js';
import { normalizeDateInput } from '../internal/date.js';
import type { ResolvedVersion } from '../types/version.js';
import type { RubricalWarning } from '../types/directorium.js';
import type {
  HourDirective,
  HymnOverrideMeta,
  SlotContent,
  SlotName,
  TextReference
} from '../types/hour-structure.js';
import type { OfficeTextIndex, TemporalContext } from '../types/model.js';
import type { Celebration, Commemoration, HourName } from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';
import type {
  CelebrationRuleSet,
  HourRuleSet,
  OmittableSlot
} from '../types/rule-set.js';
import type { DirectoriumOverlay } from '../types/directorium.js';

import type { OrdinariumSkeleton, SkeletonSlot } from './skeleton.js';

export interface ApplyRuleSetInput {
  readonly hour: HourName;
  readonly skeleton: OrdinariumSkeleton;
  readonly celebration: Celebration;
  readonly commemorations: readonly Commemoration[];
  readonly celebrationRules: CelebrationRuleSet;
  readonly hourRules: HourRuleSet;
  readonly temporal: TemporalContext;
  readonly policy: RubricalPolicy;
  readonly corpus: OfficeTextIndex;
  readonly overlay?: DirectoriumOverlay;
  /**
   * Required to evaluate Ordinarium omission conditions like
   * `(sed rubrica 196 omittuntur)` on heading-level slots. When omitted,
   * heading-level rubrics are skipped (the slot resolves normally).
   */
  readonly version?: ResolvedVersion;
}

export interface AppliedHourStructure {
  readonly slots: Readonly<Partial<Record<SlotName, SlotContent>>>;
  readonly warnings: readonly RubricalWarning[];
}

/**
 * Common skeleton-application pipeline (§16.1).
 *
 * For each slot in the Ordinarium skeleton, in order:
 *   1. Check suppression by `hourRules.omit` → emit `{ kind: 'empty' }`.
 *   2. If slot is `hymn` and overlay carries a `hymnOverride`, attach meta.
 *   3. Look up proper section in the feast file.
 *   4. Fall back to commune (via `celebrationRules.comkey`).
 *   5. For psalmody, defer to `policy.selectPsalmody`.
 *   6. Otherwise reference the Ordinarium slot itself.
 * Finally, append commemoration slots for Lauds/Vespers when applicable.
 */
export function applyRuleSet(input: ApplyRuleSetInput): AppliedHourStructure {
  const warnings: RubricalWarning[] = [];
  const slots: Partial<Record<SlotName, SlotContent>> = {};

  const feastFile = resolveFeastFile(input.corpus, input.celebration);

  for (const skeletonSlot of input.skeleton.slots) {
    const resolved = resolveSlot(skeletonSlot, feastFile, input, warnings);
    slots[skeletonSlot.name] = resolved;
  }

  attachCommemorationSlots(input, slots, warnings);

  return {
    slots,
    warnings
  };
}

function resolveSlot(
  slot: SkeletonSlot,
  feastFile: ParsedFile | undefined,
  input: ApplyRuleSetInput,
  warnings: RubricalWarning[]
): SlotContent {
  if (isSuppressed(slot.name, input.hourRules.omit)) {
    return { kind: 'empty' };
  }

  if (slot.omissionCondition && input.version && isOmittedByHeadingRubric(slot, input)) {
    return { kind: 'empty' };
  }

  if (slot.name === 'psalmody') {
    const psalms = input.policy.selectPsalmody({
      hour: input.hour,
      celebration: input.celebration,
      celebrationRules: input.celebrationRules,
      hourRules: input.hourRules,
      temporal: input.temporal,
      corpus: input.corpus
    });
    if (psalms.length === 0) {
      warnings.push({
        code: 'hour-slot-unresolved',
        message: 'Psalmody slot resolved to an empty psalm list.',
        severity: 'warn',
        context: {
          hour: input.hour,
          feast: input.celebration.feastRef.path
        }
      });
      return { kind: 'empty' };
    }
    return { kind: 'psalmody', psalms };
  }

  const properRef = findProperReference(feastFile, slot, input.hour);
  const communeRef = properRef ? undefined : findCommuneReference(input, slot);
  const ref = properRef ?? communeRef ?? ordinariumFallbackReference(input.skeleton, slot);

  if (!ref) {
    warnings.push({
      code: 'hour-slot-unresolved',
      message: `Could not resolve a text reference for slot '${slot.name}'.`,
      severity: 'warn',
      context: {
        hour: input.hour,
        slot: slot.name,
        feast: input.celebration.feastRef.path
      }
    });
    return { kind: 'empty' };
  }

  if (slot.name === 'hymn' && input.overlay?.hymnOverride) {
    const meta: HymnOverrideMeta = {
      mode: input.overlay.hymnOverride.mode,
      hymnKey: input.overlay.hymnOverride.hymnKey,
      source: 'overlay'
    };
    return { kind: 'single-ref', ref, hymnOverride: meta };
  }

  return { kind: 'single-ref', ref };
}

function isSuppressed(slot: SlotName, omit: readonly OmittableSlot[]): boolean {
  switch (slot) {
    case 'hymn':
      return omit.includes('hymnus');
    case 'preces':
      return omit.includes('preces');
    case 'suffragium':
      return omit.includes('suffragium');
    case 'invitatory':
      return omit.includes('invitatorium');
    default:
      return false;
  }
}

function resolveFeastFile(
  corpus: OfficeTextIndex,
  celebration: Celebration
): ParsedFile | undefined {
  try {
    return resolveOfficeFile(corpus, celebration.feastRef.path);
  } catch {
    return undefined;
  }
}

function findProperReference(
  feastFile: ParsedFile | undefined,
  slot: SkeletonSlot,
  hour: HourName
): TextReference | undefined {
  if (!feastFile) {
    return undefined;
  }

  const headers = properHeadersForSlot(slot.name, hour);
  for (const header of headers) {
    const section = feastFile.sections.find((entry) => entry.header === header);
    if (section) {
      return {
        path: feastFile.path.replace(/\.txt$/u, ''),
        section: header
      };
    }
  }

  return undefined;
}

function findCommuneReference(
  input: ApplyRuleSetInput,
  slot: SkeletonSlot
): TextReference | undefined {
  const comkey = input.celebrationRules.comkey;
  if (!comkey) {
    return undefined;
  }

  const communePath = `horas/Latin/Commune/${comkey}.txt`;
  const file = input.corpus.getFile(communePath);
  if (!file) {
    return undefined;
  }

  const headers = properHeadersForSlot(slot.name, input.hour);
  for (const header of headers) {
    if (file.sections.some((section) => section.header === header)) {
      return {
        path: `horas/Latin/Commune/${comkey}`,
        section: header
      };
    }
  }

  return undefined;
}

function ordinariumFallbackReference(
  skeleton: OrdinariumSkeleton,
  slot: SkeletonSlot
): TextReference {
  return {
    path: skeleton.sourcePath.replace(/\.txt$/u, ''),
    section: slot.header
  };
}

function properHeadersForSlot(slot: SlotName, hour: HourName): readonly string[] {
  const hourSuffix = HOUR_SECTION_SUFFIX[hour];
  switch (slot) {
    case 'hymn':
      return [`Hymnus ${hourSuffix}`, 'Hymnus'];
    case 'chapter':
      return [`Capitulum ${hourSuffix}`, 'Capitulum'];
    case 'responsory':
      return [`Responsory ${hourSuffix}`, 'Responsorium'];
    case 'versicle':
      // Temporal files encode `[Versum 2]` at Lauds and `[Versum 3]` at
      // Vespers; Minor Hours use `[Versum Tertia]` etc. `Versum 1` is the
      // generic single-versicle marker used when the feast has only one.
      if (hour === 'lauds') {
        return ['Versum 2', `Versum ${hourSuffix}`, 'Versum 1'];
      }
      if (hour === 'vespers') {
        return ['Versum 3', `Versum ${hourSuffix}`, 'Versum 1'];
      }
      return [`Versum ${hourSuffix}`, 'Versum 1'];
    case 'antiphon-ad-benedictus':
      // Upstream temporal files use `[Ant 2]` for the Benedictus antiphon
      // (after the two psalm nocturns of Lauds I/II), and sanctoral files
      // use `[Ant Laudes]` or `[Ant Benedictus]`.
      return ['Ant 2', 'Ant Laudes', 'Ant Benedictus'];
    case 'antiphon-ad-magnificat':
      // Temporal files use `[Ant 3]` for the Magnificat antiphon (after two
      // Vespers psalm segments); sanctoral files vary.
      return ['Ant 3', 'Ant Vespera 3', 'Ant Vespera', 'Ant Magnificat'];
    case 'antiphon-ad-nunc-dimittis':
      return ['Ant Completorium', 'Ant Nunc dimittis'];
    case 'oration':
      return ['Oratio'];
    case 'invitatory':
      return ['Invit', 'Invitatorium'];
    case 'lectio-brevis':
      return ['Lectio brevis', 'Lectio Brevis'];
    default:
      return [];
  }
}

function attachCommemorationSlots(
  input: ApplyRuleSetInput,
  slots: Partial<Record<SlotName, SlotContent>>,
  warnings: RubricalWarning[]
): void {
  if (input.hour !== 'lauds' && input.hour !== 'vespers') {
    return;
  }

  const applicable = input.commemorations.filter((c) => c.hours.includes(input.hour));
  if (applicable.length === 0) {
    return;
  }

  // Commemoration antiphon headers mirror the canticle antiphon lookup
  // order used elsewhere — temporal feasts emit `Ant 2`/`Ant 3`, sanctoral
  // feasts emit `Ant Laudes`/`Ant Vespera 3` etc. The Phase 3 resolver
  // should fall back through candidates; here we pick the most common
  // temporal form first so that temporal commemorations (the majority)
  // dereference without an extra lookup.
  const antiphonHeader = input.hour === 'lauds' ? 'Ant 2' : 'Ant 3';
  const versicleHeader = input.hour === 'lauds' ? 'Versum 2' : 'Versum 3';
  const orationHeader = 'Oratio';

  const antiphons: TextReference[] = [];
  const versicles: TextReference[] = [];
  const orations: TextReference[] = [];

  for (const commem of applicable) {
    const basePath = `horas/Latin/${commem.feastRef.path}`;
    antiphons.push({ path: basePath, section: antiphonHeader });
    versicles.push({ path: basePath, section: versicleHeader });
    orations.push({ path: basePath, section: orationHeader });
  }

  slots['commemoration-antiphons'] = { kind: 'ordered-refs', refs: antiphons };
  slots['commemoration-versicles'] = { kind: 'ordered-refs', refs: versicles };
  slots['commemoration-orations'] = { kind: 'ordered-refs', refs: orations };

  if (input.celebrationRules.omitCommemoration) {
    warnings.push({
      code: 'commemoration-suppressed-by-rule',
      message: 'Commemorations were attached despite celebrationRules.omitCommemoration; check rule evaluation.',
      severity: 'warn',
      context: {
        hour: input.hour,
        feast: input.celebration.feastRef.path
      }
    });
  }
}

const HOUR_SECTION_SUFFIX: Readonly<Record<HourName, string>> = {
  matins: 'Matutinum',
  lauds: 'Laudes',
  prime: 'Prima',
  terce: 'Tertia',
  sext: 'Sexta',
  none: 'Nona',
  vespers: 'Vespera',
  compline: 'Completorium'
};

function isOmittedByHeadingRubric(
  slot: SkeletonSlot,
  input: ApplyRuleSetInput
): boolean {
  if (!slot.omissionCondition || !input.version) {
    return false;
  }

  // The skeleton loader only attaches `omissionCondition` when the parsed
  // Instruction is `omittitur` / `omittuntur`, so a truthy match here means
  // the slot should be suppressed for this policy.
  return conditionMatches(slot.omissionCondition, {
    date: normalizeDateInput(input.temporal.date),
    dayOfWeek: input.temporal.dayOfWeek,
    season: input.temporal.season,
    version: input.version
  });
}

export function directivesFromPolicy(
  input: ApplyRuleSetInput
): readonly HourDirective[] {
  const set = input.policy.hourDirectives({
    hour: input.hour,
    celebrationRules: input.celebrationRules,
    hourRules: input.hourRules,
    temporal: input.temporal,
    ...(input.overlay ? { overlay: input.overlay } : {})
  });
  return Object.freeze([...set]);
}
