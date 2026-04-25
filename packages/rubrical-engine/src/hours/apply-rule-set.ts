import type {
  ParsedFile,
  TextContent
} from '@officium-novum/parser';

import {
  conditionMatches,
  type ConditionEvalContext
} from '../internal/conditions.js';
import { resolveOfficeFile } from '../internal/content.js';
import { normalizeDateInput } from '../internal/date.js';
import type { ResolvedVersion } from '../types/version.js';
import type { RubricalWarning } from '../types/directorium.js';
import type {
  HourDirective,
  HymnOverrideMeta,
  PsalmAssignment,
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
import { resolveRuleReferenceFiles } from '../rules/resolve-vide-ex.js';

const COMMON_PRAYERS_PATH = 'horas/Latin/Psalterium/Common/Prayers';
const PSALMI_MAJOR = 'horas/Latin/Psalterium/Psalmi/Psalmi major';
const PSALMORUM_ROOT = 'horas/Latin/Psalterium/Psalmorum';
const MAJOR_SPECIAL_PATH = 'horas/Latin/Psalterium/Special/Major Special';
const HOLY_WEEK_MON_WED_KEYS = new Set(['Quad6-1', 'Quad6-2', 'Quad6-3']);

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

type InternalVespersAwareInput = ApplyRuleSetInput & {
  readonly __vespersSide?: 'first' | 'second';
};

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
  const properFiles = resolveProperTextFiles(feastFile, input, warnings);

  for (const skeletonSlot of input.skeleton.slots) {
    const resolved = resolveSlot(skeletonSlot, properFiles, input, warnings);
    slots[skeletonSlot.name] = resolved;
  }

  attachDoxologyVariantSlot(slots, properFiles, input);
  attachCommemorationSlots(input, slots, warnings);

  return {
    slots,
    warnings
  };
}

function resolveSlot(
  slot: SkeletonSlot,
  properFiles: readonly ParsedFile[],
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
    const psalms = decoratePsalmodyAssignments(
      input.policy.selectPsalmody({
        hour: input.hour,
        celebration: input.celebration,
        celebrationRules: input.celebrationRules,
        hourRules: input.hourRules,
        temporal: input.temporal,
        corpus: input.corpus
      }),
      properFiles,
      input
    );
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

  if (usesVersum2InPlaceOfLaterBlock(input)) {
    if (slot.name === 'chapter') {
      const ref = findCapitulumVersum2Reference(properFiles, input);
      if (!ref) {
        warnings.push({
          code: 'hour-slot-unresolved',
          message: 'Capitulum Versum 2 did not resolve a Versum 2 reference.',
          severity: 'warn',
          context: {
            hour: input.hour,
            feast: input.celebration.feastRef.path
          }
        });
        return { kind: 'empty' };
      }

      return { kind: 'single-ref', ref };
    }

    if (slot.name === 'responsory' || slot.name === 'versicle') {
      return { kind: 'empty' };
    }
  }

  const specialOration = resolveSpecialMinorHourOration(slot.name, input);
  if (specialOration) {
    return specialOration;
  }

  const primeMartyrology = resolvePrimeMartyrology(slot.name, input);
  if (primeMartyrology) {
    return primeMartyrology;
  }

  const lucanCanticle = resolveLucanCanticle(slot.name);
  if (lucanCanticle) {
    return lucanCanticle;
  }

  const minorHourLaterBlockOverride = minorHourLaterBlockOverrideReference(input, slot.name);
  const properRef = minorHourLaterBlockOverride ? undefined : findProperReference(properFiles, slot, input);
  const inheritedSecondVespersRef = properRef
    ? undefined
    : findInheritedSecondVespersReference(properFiles, slot, input);
  const communeRef = properRef || inheritedSecondVespersRef ? undefined : findCommuneReference(input, slot);
  if (input.hour === 'compline' && slot.name === 'lectio-brevis') {
    const wrapperRef = ordinariumSkeletonReference(input.skeleton, slot);
    const readingRef = properRef ?? communeRef ?? complineSpecialFallbackReference(input.hour, slot.name) ?? wrapperRef;
    const refs = sameReference(readingRef, wrapperRef) ? [readingRef] : [readingRef, wrapperRef];
    return refs.length === 1
      ? { kind: 'single-ref', ref: refs[0]! }
      : { kind: 'ordered-refs', refs };
  }
  const ref =
    minorHourLaterBlockOverride ??
    properRef ??
    inheritedSecondVespersRef ??
    communeRef ??
    majorHourLaterBlockFallbackReference(input, slot.name) ??
    minorHourLaterBlockFallbackReference(input, slot.name) ??
    ordinariumFallbackReference(input.skeleton, slot);

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

function minorHourLaterBlockOverrideReference(
  input: ApplyRuleSetInput,
  slot: SlotName
): TextReference | undefined {
  if (input.policy.name !== 'rubrics-1960' && input.policy.name !== 'reduced-1955') {
    return undefined;
  }

  if (slot !== 'versicle') {
    return undefined;
  }

  const section = minorHourQuadragesimaLaterBlockSection(input, slot);
  if (!section) {
    return undefined;
  }

  return {
    path: minorHourLaterBlockFallbackPath(input.hour, input.temporal.dayOfWeek),
    section
  };
}

function isSuppressed(slot: SlotName, omit: readonly OmittableSlot[]): boolean {
  switch (slot) {
    case 'incipit':
      return omit.includes('incipit');
    case 'chapter':
      return omit.includes('chapter');
    case 'responsory':
      return omit.includes('responsory');
    case 'versicle':
      return omit.includes('versicle');
    case 'hymn':
      return omit.includes('hymnus');
    case 'martyrology':
      return omit.includes('martyrologium');
    case 'lectio-brevis':
      return omit.includes('lectio-brevis');
    case 'de-officio-capituli':
      return omit.includes('de-officio-capituli');
    case 'preces':
      return omit.includes('preces');
    case 'suffragium':
      return omit.includes('suffragium');
    case 'invitatory':
      return omit.includes('invitatorium');
    case 'final-antiphon-bvm':
      return omit.includes('antiphona-finalis');
    case 'conclusion':
      return omit.includes('conclusion');
    default:
      return false;
  }
}

function resolvePrimeMartyrology(
  slotName: SlotName,
  input: ApplyRuleSetInput
): SlotContent | undefined {
  if (slotName !== 'martyrology' || input.hour !== 'prime') {
    return undefined;
  }

  return { kind: 'prime-martyrology' };
}

function resolveLucanCanticle(slotName: SlotName): SlotContent | undefined {
  const psalmNumber =
    slotName === 'canticle-ad-benedictus' ? '231'
    : slotName === 'canticle-ad-magnificat' ? '232'
    : slotName === 'canticle-ad-nunc-dimittis' ? '233'
    : undefined;

  if (!psalmNumber) {
    return undefined;
  }

  return {
    kind: 'single-ref',
    ref: {
      path: `horas/Latin/Psalterium/Psalmorum/Psalm${psalmNumber}`,
      section: '__preamble'
    }
  };
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

function resolveProperTextFiles(
  feastFile: ParsedFile | undefined,
  input: ApplyRuleSetInput,
  warnings: RubricalWarning[]
): readonly ParsedFile[] {
  if (!feastFile) {
    return [];
  }

  if (!input.version) {
    return [feastFile];
  }

  const inherited = resolveRuleReferenceFiles(
    feastFile,
    {
      date: normalizeDateInput(input.temporal.date),
      dayOfWeek: input.temporal.dayOfWeek,
      season: input.temporal.season,
      version: input.version,
      corpus: input.corpus
    }
  );
  warnings.push(...inherited.warnings);
  return [feastFile, ...inherited.files];
}

function findProperReference(
  files: readonly ParsedFile[],
  slot: SkeletonSlot,
  input: ApplyRuleSetInput
): TextReference | undefined {
  if (files.length === 0) {
    return undefined;
  }

  return findReferenceInFiles(files, properHeadersForSlot(slot.name, input.hour, input));
}

function findInheritedSecondVespersReference(
  files: readonly ParsedFile[],
  slot: SkeletonSlot,
  input: ApplyRuleSetInput
): TextReference | undefined {
  if (
    input.hour !== 'vespers' ||
    slot.name !== 'chapter' ||
    (input as InternalVespersAwareInput).__vespersSide !== 'second'
  ) {
    return undefined;
  }

  const inheritedFiles = resolveInheritedSecondVespersFiles(files, input);
  if (inheritedFiles.length === 0) {
    return undefined;
  }

  for (const file of inheritedFiles) {
    const ref = findReferenceInFile(
      file,
      file.path.replace(/\.txt$/u, ''),
      properHeadersForSlot(slot.name, input.hour, input)
    );
    if (ref) {
      return ref;
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

  return findReferenceInFile(
    file,
    `horas/Latin/Commune/${comkey}`,
    properHeadersForSlot(slot.name, input.hour, input)
  );
}

function decoratePsalmodyAssignments(
  assignments: readonly PsalmAssignment[],
  properFiles: readonly ParsedFile[],
  input: ApplyRuleSetInput
): readonly PsalmAssignment[] {
  if (assignments.length === 0) {
    return assignments;
  }

  if (input.hour === 'lauds' || input.hour === 'vespers') {
    const antiphons = resolveMajorHourAntiphonRefs(properFiles, input);
    const properPsalmRefs = resolveMajorHourPsalmRefs(properFiles, input, assignments.length);
    if (antiphons.length === 0) {
      return assignments;
    }
    return assignments.map((assignment, index) =>
      antiphons[index]
        ? {
            ...assignment,
            antiphonRef: antiphons[index],
            // When the office file itself supplies a major-hour psalm row,
            // that source-backed psalm assignment owns the slot even if the
            // psalter fallback already chose a concrete psalm number.
            ...(properPsalmRefs[index]
              ? {
                  psalmRef: properPsalmRefs[index]
                }
              : {})
          }
        : assignment
    );
  }

  if (
    input.hour === 'prime' ||
    input.hour === 'terce' ||
    input.hour === 'sext' ||
    input.hour === 'none'
  ) {
    if (input.hourRules.minorHoursSineAntiphona) {
      return assignments;
    }

    const antiphon = resolveMinorHourAntiphonRef(properFiles, input);
    if (!antiphon) {
      return assignments;
    }
    return assignments.map((assignment, index) =>
      index === 0
        ? {
            ...assignment,
            antiphonRef: antiphon
          }
        : assignment
    );
  }

  return assignments;
}

function resolveMajorHourAntiphonRefs(
  files: readonly ParsedFile[],
  input: ApplyRuleSetInput
): readonly TextReference[] {
  const headers =
    input.hour === 'lauds' ? ['Ant Laudes']
    : (input as InternalVespersAwareInput).__vespersSide === 'second' ?
      ['Ant Vespera 3', 'Ant Vespera']
    : ['Ant Vespera'];
  const match = files.find((file) =>
    headers.some((header) => file.sections.some((section) => section.header === header))
  );
  if (!match) {
    return resolveCommuneAntiphonRefs(
      input,
      input.hour === 'lauds' ? 'Ant Laudes' : 'Ant Vespera'
    );
  }

  const header = headers.find((candidate) =>
    match.sections.some((section) => section.header === candidate)
  );
  if (!header) {
    return [];
  }

  return Array.from({ length: 5 }, (_, index) => ({
    path: match.path.replace(/\.txt$/u, ''),
    section: header,
    selector: String(index + 1)
  }));
}

function resolveMajorHourPsalmRefs(
  files: readonly ParsedFile[],
  input: ApplyRuleSetInput,
  count: number
): readonly TextReference[] {
  const conditionContext = majorHourPsalmConditionContext(input);
  const headers =
    input.hour === 'lauds' ? ['Ant Laudes']
    : (input as InternalVespersAwareInput).__vespersSide === 'second' ?
      ['Ant Vespera 3', 'Ant Vespera']
    : ['Ant Vespera'];

  for (const header of headers) {
    for (const file of files) {
      const section = findMajorHourPsalmSection(file, header, conditionContext);
      if (!section) {
        continue;
      }
      const refs = extractMajorHourPsalmRefs(
        section.content,
        count,
        input,
        header,
        new Set([officeVisitKey(file.path, header)]),
        conditionContext
      );
      if (refs.length > 0) {
        return refs;
      }
      if (stripsPsalmPayloads(section.content, conditionContext)) {
        return [];
      }
    }
  }

  return [];
}

function resolveInheritedSecondVespersFiles(
  files: readonly ParsedFile[],
  input: ApplyRuleSetInput
): readonly ParsedFile[] {
  const conditionContext = majorHourPsalmConditionContext(input);
  const headers = ['Ant Vespera 3', 'Ant Vespera'];
  const resolved: ParsedFile[] = [];
  const seen = new Set<string>();

  for (const header of headers) {
    for (const file of files) {
      const section = findMajorHourPsalmSection(file, header, conditionContext);
      if (!section) {
        continue;
      }

      collectInheritedSecondVespersFiles(
        section.content,
        input,
        header,
        new Set([officeVisitKey(file.path, header)]),
        conditionContext,
        resolved,
        seen
      );
      if (resolved.length > 0) {
        return Object.freeze(resolved);
      }
    }
  }

  return Object.freeze(resolved);
}

function collectInheritedSecondVespersFiles(
  content: readonly TextContent[],
  input: ApplyRuleSetInput,
  currentHeader: string,
  visited: ReadonlySet<string>,
  conditionContext: ConditionEvalContext | undefined,
  resolved: ParsedFile[],
  seen: Set<string>
): void {
  for (const node of content) {
    if (node.type === 'conditional') {
      if (conditionContext && !conditionMatches(node.condition, conditionContext)) {
        continue;
      }
      collectInheritedSecondVespersFiles(
        node.content,
        input,
        currentHeader,
        visited,
        conditionContext,
        resolved,
        seen
      );
      continue;
    }

    if (
      node.type !== 'reference' ||
      !node.ref.path ||
      node.ref.substitutions.length > 0
    ) {
      continue;
    }

    const targetHeader = node.ref.section ?? currentHeader;
    const visitKey = officeVisitKey(node.ref.path, targetHeader);
    if (visited.has(visitKey)) {
      continue;
    }

    try {
      const file = resolveOfficeFile(input.corpus, node.ref.path);
      const section = findMajorHourPsalmSection(file, targetHeader, conditionContext);
      if (!section) {
        continue;
      }

      if (!seen.has(file.path)) {
        resolved.push(file);
        seen.add(file.path);
      }

      const nextVisited = new Set(visited);
      nextVisited.add(visitKey);
      collectInheritedSecondVespersFiles(
        section.content,
        input,
        targetHeader,
        nextVisited,
        conditionContext,
        resolved,
        seen
      );
    } catch {
      continue;
    }
  }
}

function extractMajorHourPsalmRefs(
  content: readonly TextContent[],
  count: number,
  input: ApplyRuleSetInput,
  currentHeader: string,
  visited: ReadonlySet<string>,
  conditionContext: ConditionEvalContext | undefined
): readonly TextReference[] {
  const refs: TextReference[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      if (!conditionContext || conditionMatches(node.condition, conditionContext)) {
        refs.push(
          ...extractMajorHourPsalmRefs(
            node.content,
            count - refs.length,
            input,
            currentHeader,
            visited,
            conditionContext
          )
        );
        if (refs.length >= count) {
          break;
        }
      }
      continue;
    }

    if (
      node.type === 'reference' &&
      node.ref.path &&
      node.ref.substitutions.length === 0
    ) {
      const targetHeader = node.ref.section ?? currentHeader;
      const visitKey = officeVisitKey(node.ref.path, targetHeader);
      if (visited.has(visitKey)) {
        continue;
      }

      try {
        const file = resolveOfficeFile(input.corpus, node.ref.path);
        const section = findMajorHourPsalmSection(file, targetHeader, conditionContext);
        if (!section) {
          continue;
        }

        const nextVisited = new Set(visited);
        nextVisited.add(visitKey);
        refs.push(
          ...extractMajorHourPsalmRefs(
            section.content,
            count - refs.length,
            input,
            targetHeader,
            nextVisited,
            conditionContext
          )
        );
        if (refs.length >= count) {
          break;
        }
      } catch {
        continue;
      }

      continue;
    }

    if (node.type === 'psalmRef') {
      refs.push({
        path: `${PSALMORUM_ROOT}/Psalm${node.psalmNumber}`,
        section: '__preamble',
        selector: String(node.psalmNumber)
      });
      if (refs.length >= count) {
        break;
      }
      continue;
    }

    if (node.type !== 'text') {
      continue;
    }

    const [, psalmSpec] = splitPsalmTaggedTextRow(node.value);
    if (!psalmSpec) {
      continue;
    }

    refs.push(psalmTokenReference(psalmSpec));
    if (refs.length >= count) {
      break;
    }
  }

  return Object.freeze(refs);
}

function majorHourPsalmConditionContext(
  input: ApplyRuleSetInput
): ConditionEvalContext | undefined {
  if (!input.version) {
    return undefined;
  }

  return {
    date: normalizeDateInput(input.temporal.date),
    dayOfWeek: input.temporal.dayOfWeek,
    season: input.temporal.season,
    version: input.version
  };
}

function findMajorHourPsalmSection(
  file: ParsedFile,
  header: string,
  conditionContext: ConditionEvalContext | undefined
): ParsedFile['sections'][number] | undefined {
  let fallback: ParsedFile['sections'][number] | undefined;

  for (const section of file.sections) {
    if (section.header !== header) {
      continue;
    }

    if (!section.condition) {
      fallback ??= section;
      continue;
    }

    if (conditionContext && conditionMatches(section.condition, conditionContext)) {
      return section;
    }
  }

  return fallback;
}

function stripsPsalmPayloads(
  content: readonly TextContent[],
  conditionContext: ConditionEvalContext | undefined
): boolean {
  for (const node of content) {
    if (node.type === 'conditional') {
      if (conditionContext && !conditionMatches(node.condition, conditionContext)) {
        continue;
      }
      if (stripsPsalmPayloads(node.content, conditionContext)) {
        return true;
      }
      continue;
    }

    if (
      node.type === 'reference' &&
      node.ref.substitutions.some(
        (substitution) =>
          substitution.pattern === ';;.*' && substitution.replacement.length === 0
      )
    ) {
      return true;
    }
  }

  return false;
}

function isGenericMajorHourPsalmRef(ref: TextReference): boolean {
  return ref.path === PSALMI_MAJOR;
}

function splitPsalmTaggedTextRow(
  value: string
): readonly [string | undefined, string | undefined] {
  const [textRaw, psalmSpecRaw] = value.split(';;', 2);
  const text = textRaw?.trim();
  const psalmSpec = psalmSpecRaw?.trim();
  return [text && text !== '_' ? text : undefined, psalmSpec];
}

function psalmTokenReference(token: string): TextReference {
  const match = token.match(/^\[?(\d+)\]?(?:\(([^)]+)\))?$/u);
  const psalmNumber = match?.[1];
  if (!psalmNumber) {
    return {
      path: PSALMI_MAJOR,
      section: token
    };
  }

  return {
    path: `${PSALMORUM_ROOT}/Psalm${psalmNumber}`,
    section: '__preamble',
    selector: token
  };
}

function resolveCommuneAntiphonRefs(
  input: ApplyRuleSetInput,
  header: 'Ant Laudes' | 'Ant Vespera'
): readonly TextReference[] {
  const communeFile = resolveCommuneFile(input);
  if (!communeFile || !communeFile.sections.some((section) => section.header === header)) {
    return [];
  }

  return Array.from({ length: 5 }, (_, index) => ({
    path: communeFile.path.replace(/\.txt$/u, ''),
    section: header,
    selector: String(index + 1)
  }));
}

function resolveMinorHourAntiphonRef(
  files: readonly ParsedFile[],
  input: ApplyRuleSetInput
): TextReference | undefined {
  const explicitHeader = explicitMinorHourAntiphonHeader(input.hour);
  if (explicitHeader) {
    const explicitMatch = files.find((file) =>
      file.sections.some(
        (section) => section.header === explicitHeader && section.condition === undefined
      )
    );
    if (explicitMatch) {
      return {
        path: explicitMatch.path.replace(/\.txt$/u, ''),
        section: explicitHeader
      };
    }
  }

  if (input.celebrationRules.antiphonScheme !== 'proper-minor-hours') {
    return undefined;
  }

  const match = files.find((file) => file.sections.some((section) => section.header === 'Ant Laudes'));
  const selector =
    input.hour === 'prime' ||
    input.hour === 'terce' ||
    input.hour === 'sext' ||
    input.hour === 'none'
      ? minorHourAntiphonSelector(input.hour)
      : undefined;
  if (!selector) {
    return undefined;
  }
  if (match) {
    return {
      path: match.path.replace(/\.txt$/u, ''),
      section: 'Ant Laudes',
      selector
    };
  }

  const communeFile = resolveCommuneFile(input);
  if (!communeFile || !communeFile.sections.some((section) => section.header === 'Ant Laudes')) {
    return undefined;
  }

  return {
    path: communeFile.path.replace(/\.txt$/u, ''),
    section: 'Ant Laudes',
    selector
  };
}

function explicitMinorHourAntiphonHeader(
  hour: ApplyRuleSetInput['hour']
): 'Ant Prima' | 'Ant Tertia' | 'Ant Sexta' | 'Ant Nona' | undefined {
  return (
    hour === 'prime' ? 'Ant Prima'
    : hour === 'terce' ? 'Ant Tertia'
    : hour === 'sext' ? 'Ant Sexta'
    : hour === 'none' ? 'Ant Nona'
    : undefined
  );
}

function minorHourAntiphonSelector(
  hour: 'prime' | 'terce' | 'sext' | 'none'
): '1' | '2' | '3' | '5' {
  return (
    hour === 'prime' ? '1'
    : hour === 'terce' ? '2'
    : hour === 'sext' ? '3'
    : '5'
  );
}

function resolveCommuneFile(input: ApplyRuleSetInput): ParsedFile | undefined {
  const comkey = input.celebrationRules.comkey;
  if (!comkey) {
    return undefined;
  }
  return input.corpus.getFile(`horas/Latin/Commune/${comkey}.txt`);
}

function attachDoxologyVariantSlot(
  slots: Partial<Record<SlotName, SlotContent>>,
  properFiles: readonly ParsedFile[],
  input: ApplyRuleSetInput
): void {
  const hymn = slots.hymn;
  if (!hymn || hymn.kind !== 'single-ref' || !isFallbackMinorHourHymn(hymn.ref)) {
    return;
  }

  const doxologyRef =
    findProperDoxologyReference(properFiles) ??
    findVariantDoxologyReference(
      input.celebrationRules.doxologyVariant ?? seasonalFallbackDoxologyVariant(input.temporal)
    );
  if (!doxologyRef) {
    return;
  }

  slots['doxology-variant'] = {
    kind: 'single-ref',
    ref: doxologyRef
  };
}

function isFallbackMinorHourHymn(ref: TextReference): boolean {
  return (
    ref.path === 'horas/Latin/Psalterium/Special/Prima Special' ||
    ref.path === 'horas/Latin/Psalterium/Special/Minor Special'
  );
}

function findProperDoxologyReference(
  files: readonly ParsedFile[]
): TextReference | undefined {
  const match = files.find((file) => file.sections.some((section) => section.header === 'Doxology'));
  if (!match) {
    return undefined;
  }

  return {
    path: match.path.replace(/\.txt$/u, ''),
    section: 'Doxology'
  };
}

function findVariantDoxologyReference(
  variant: string | undefined
): TextReference | undefined {
  if (!variant) {
    return undefined;
  }

  return {
    path: 'horas/Latin/Psalterium/Doxologies',
    section: variant
  };
}

function seasonalFallbackDoxologyVariant(
  temporal: TemporalContext
): string | undefined {
  const dayName = temporal.dayName;

  if (/^Nat/iu.test(dayName)) {
    const dayOfMonth = Number.parseInt(temporal.date.slice(-2), 10);
    return dayOfMonth >= 6 && dayOfMonth < 13 ? 'Epi' : 'Nat';
  }

  if (/^Epi[01]/iu.test(dayName)) {
    const dayOfMonth = Number.parseInt(temporal.date.slice(-2), 10);
    if (dayOfMonth < 14) {
      return 'Epi';
    }
  }

  if (
    /^Pasc6/iu.test(dayName) ||
    (/^Pasc5/iu.test(dayName) && temporal.dayOfWeek > 3)
  ) {
    return 'Asc';
  }

  if (/^Pasc[0-5]/iu.test(dayName)) {
    return 'Pasch';
  }

  if (/^Pasc7/iu.test(dayName)) {
    return 'Pent';
  }

  return undefined;
}

function ordinariumFallbackReference(
  skeleton: OrdinariumSkeleton,
  slot: SkeletonSlot
): TextReference {
  const minorHourSpecial = minorHourSpecialFallbackReference(skeleton.hour, slot.name);
  if (minorHourSpecial) {
    return minorHourSpecial;
  }

  const complineSpecial = complineSpecialFallbackReference(skeleton.hour, slot.name);
  if (complineSpecial) {
    return complineSpecial;
  }

  return ordinariumSkeletonReference(skeleton, slot);
}

function ordinariumSkeletonReference(
  skeleton: OrdinariumSkeleton,
  slot: SkeletonSlot
): TextReference {
  return {
    path: skeleton.sourcePath.replace(/\.txt$/u, ''),
    section: slot.header
  };
}

function complineSpecialFallbackReference(
  hour: HourName,
  slot: SlotName
): TextReference | undefined {
  if (hour !== 'compline') {
    return undefined;
  }

  const section = COMPLINE_SPECIAL_FALLBACKS[slot];
  if (!section) {
    return undefined;
  }

  return {
    path: 'horas/Latin/Psalterium/Special/Minor Special',
    section
  };
}

function minorHourSpecialFallbackReference(
  hour: HourName,
  slot: SlotName
): TextReference | undefined {
  if (slot !== 'hymn') {
    return undefined;
  }

  switch (hour) {
    case 'prime':
      return {
        path: 'horas/Latin/Psalterium/Special/Prima Special',
        section: 'Hymnus Prima'
      };
    case 'terce':
      return {
        path: 'horas/Latin/Psalterium/Special/Minor Special',
        section: 'Hymnus Tertia'
      };
    case 'sext':
      return {
        path: 'horas/Latin/Psalterium/Special/Minor Special',
        section: 'Hymnus Sexta'
      };
    case 'none':
      return {
        path: 'horas/Latin/Psalterium/Special/Minor Special',
        section: 'Hymnus Nona'
      };
    default:
      return undefined;
  }
}

function minorHourLaterBlockFallbackReference(
  input: ApplyRuleSetInput,
  slot: SlotName
): TextReference | undefined {
  // Jan 14 1960 / Jan 28 1955 checkpoint: Sunday ordinary post-psalmody minor-hour text
  // does not live on `Ordinarium/Minor#Capitulum Responsorium Versus`; that
  // heading is only the empty wrapper. When no office file supplies these
  // slots, the simplified Roman policies fall back to the Sunday later-block sections in
  // `Psalterium/Special/Minor Special`.
  if (input.policy.name !== 'rubrics-1960' && input.policy.name !== 'reduced-1955') {
    return undefined;
  }

  const section =
    input.temporal.dayOfWeek === 0
      ? minorHourQuadragesimaLaterBlockSection(input, slot) ??
        minorHourSundayLaterBlockFallbackSection(input.hour, slot)
      : minorHourFerialLaterBlockFallbackSection(input, slot);
  if (!section) {
    return undefined;
  }

  return {
    path: minorHourLaterBlockFallbackPath(input.hour, input.temporal.dayOfWeek),
    section
  };
}

function minorHourLaterBlockFallbackPath(hour: HourName, dayOfWeek: number): string {
  return hour === 'prime' && dayOfWeek !== 0
    ? 'horas/Latin/Psalterium/Special/Prima Special'
    : 'horas/Latin/Psalterium/Special/Minor Special';
}

function minorHourSundayLaterBlockFallbackSection(
  hour: HourName,
  slot: SlotName
): string | undefined {
  switch (hour) {
    case 'terce':
      switch (slot) {
        case 'chapter':
          return 'Dominica Tertia';
        case 'responsory':
          return 'Responsory breve Dominica Tertia';
        case 'versicle':
          return 'Versum Dominica Tertia';
        default:
          return undefined;
      }
    case 'sext':
      switch (slot) {
        case 'chapter':
          return 'Dominica Sexta';
        case 'responsory':
          return 'Responsory breve Dominica Sexta';
        case 'versicle':
          return 'Versum Dominica Sexta';
        default:
          return undefined;
      }
    case 'none':
      switch (slot) {
        case 'chapter':
          return 'Dominica Nona';
        case 'responsory':
          return 'Responsory breve Dominica Nona';
        case 'versicle':
          return 'Versum Dominica Nona';
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

function minorHourFerialLaterBlockFallbackSection(
  input: ApplyRuleSetInput,
  slot: SlotName
): string | undefined {
  if (input.celebration.source !== 'temporal' || input.celebration.kind) {
    return undefined;
  }

  const holyWeekMonWedSection = minorHourHolyWeekMonWedLaterBlockSection(input.hour, slot);
  if (HOLY_WEEK_MON_WED_KEYS.has(input.temporal.dayName) && holyWeekMonWedSection) {
    return holyWeekMonWedSection;
  }

  const quadragesimaSection = minorHourQuadragesimaLaterBlockSection(input, slot);
  if (quadragesimaSection) {
    return quadragesimaSection;
  }

  switch (input.hour) {
    case 'prime':
      switch (slot) {
        case 'chapter':
          return 'Feria';
        case 'responsory':
          return 'Responsory';
        case 'versicle':
          return 'Versum';
        default:
          return undefined;
      }
    case 'terce':
      switch (slot) {
        case 'chapter':
          return 'Feria Tertia';
        case 'responsory':
          return 'Responsory breve Feria Tertia';
        case 'versicle':
          return 'Versum Feria Tertia';
        default:
          return undefined;
      }
    case 'sext':
      switch (slot) {
        case 'chapter':
          return 'Feria Sexta';
        case 'responsory':
          return 'Responsory breve Feria Sexta';
        case 'versicle':
          return 'Versum Feria Sexta';
        default:
          return undefined;
      }
    case 'none':
      switch (slot) {
        case 'chapter':
          return 'Feria Nona';
        case 'responsory':
          return 'Responsory breve Feria Nona';
        case 'versicle':
          return 'Versum Feria Nona';
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

function minorHourQuadragesimaLaterBlockSection(
  input: ApplyRuleSetInput,
  slot: SlotName
): string | undefined {
  if (
    input.celebration.source !== 'temporal' ||
    input.celebration.kind
  ) {
    return undefined;
  }

  if (
    /^Quad5-/u.test(input.temporal.dayName) ||
    input.temporal.dayName === 'Quad6-0' ||
    HOLY_WEEK_MON_WED_KEYS.has(input.temporal.dayName)
  ) {
    return minorHourHolyWeekMonWedLaterBlockSection(input.hour, slot);
  }

  if (!/^Quad[1-4]-/u.test(input.temporal.dayName)) {
    return undefined;
  }

  switch (input.hour) {
    case 'terce':
      switch (slot) {
        case 'chapter':
          return 'Quad Tertia';
        case 'responsory':
          return 'Responsory breve Quad Tertia';
        case 'versicle':
          return 'Versum Quad Tertia';
        default:
          return undefined;
      }
    case 'sext':
      switch (slot) {
        case 'chapter':
          return 'Quad Sexta';
        case 'responsory':
          return 'Responsory breve Quad Sexta';
        case 'versicle':
          return 'Versum Quad Sexta';
        default:
          return undefined;
      }
    case 'none':
      switch (slot) {
        case 'chapter':
          return 'Quad Nona';
        case 'responsory':
          return 'Responsory breve Quad Nona';
        case 'versicle':
          return 'Versum Quad Nona';
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

function minorHourHolyWeekMonWedLaterBlockSection(
  hour: HourName,
  slot: SlotName
): string | undefined {
  switch (hour) {
    case 'terce':
      switch (slot) {
        case 'chapter':
          return 'Quad5 Tertia';
        case 'responsory':
          return 'Responsory breve Quad5 Tertia';
        case 'versicle':
          return 'Versum Quad5 Tertia';
        default:
          return undefined;
      }
    case 'sext':
      switch (slot) {
        case 'chapter':
          return 'Quad5 Sexta';
        case 'responsory':
          return 'Responsory breve Quad5 Sexta';
        case 'versicle':
          return 'Versum Quad5 Sexta';
        default:
          return undefined;
      }
    case 'none':
      switch (slot) {
        case 'chapter':
          return 'Quad5 Nona';
        case 'responsory':
          return 'Responsory breve Quad5 Nona';
        case 'versicle':
          return 'Versum Quad5 Nona';
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

function majorHourLaterBlockFallbackReference(
  input: ApplyRuleSetInput,
  slot: SlotName
): TextReference | undefined {
  // Weekday 1960 Lauds/Vespers still say `#Capitulum Hymnus Versus` in the
  // Ordinarium, but Perl expands that wrapper from the ferial sections in
  // `Psalterium/Special/Major Special` when the proper supplies no later block.
  if (
    input.policy.name !== 'rubrics-1960' ||
    input.celebration.source !== 'temporal' ||
    input.celebration.kind ||
    input.temporal.dayOfWeek === 0
  ) {
    return undefined;
  }

  const section =
    (HOLY_WEEK_MON_WED_KEYS.has(input.temporal.dayName)
      ? majorHourHolyWeekMonWedLaterBlockSection(input.hour, slot)
      : undefined) ??
    majorHourLaterBlockFallbackSection(input.hour, slot, input.temporal.dayOfWeek);
  if (!section) {
    return undefined;
  }

  return {
    path: MAJOR_SPECIAL_PATH,
    section
  };
}

function majorHourLaterBlockFallbackSection(
  hour: HourName,
  slot: SlotName,
  dayOfWeek: number
): string | undefined {
  switch (hour) {
    case 'lauds':
      switch (slot) {
        case 'chapter':
          return 'Feria Laudes';
        case 'hymn':
          return `Hymnus Day${dayOfWeek} Laudes`;
        case 'versicle':
          return 'Feria Versum 2';
        default:
          return undefined;
      }
    case 'vespers':
      switch (slot) {
        case 'chapter':
          return 'Feria Vespera';
        case 'hymn':
          return `Hymnus Day${dayOfWeek} Vespera`;
        case 'versicle':
          return 'Feria Versum 3';
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

function majorHourHolyWeekMonWedLaterBlockSection(
  hour: HourName,
  slot: SlotName
): string | undefined {
  switch (hour) {
    case 'lauds':
      switch (slot) {
        case 'chapter':
          return 'Quad5 Laudes';
        case 'hymn':
          return 'Hymnus Quad5 Laudes';
        case 'versicle':
          return 'Quad5 Versum 2';
        default:
          return undefined;
      }
    case 'vespers':
      switch (slot) {
        case 'chapter':
          return 'Quad5 Vespera';
        case 'hymn':
          return 'Hymnus Quad5 Vespera';
        case 'versicle':
          return 'Quad5 Versum 3';
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

function usesVersum2InPlaceOfLaterBlock(input: ApplyRuleSetInput): boolean {
  return input.hour !== 'compline' && input.hourRules.capitulumVariant?.scheme === 2;
}

export function officeVisitKey(path: string, header: string): string {
  return `${canonicalOfficeVisitPath(path)}:${header}`;
}

function canonicalOfficeVisitPath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .trim()
    .replace(/^\.\/+/u, '')
    .replace(/^horas\/Latin\//u, '')
    .replace(/\.txt$/u, '');
}

function findCapitulumVersum2Reference(
  properFiles: readonly ParsedFile[],
  input: ApplyRuleSetInput
): TextReference | undefined {
  return findReferenceInFiles(properFiles, ['Versum 2']) ?? findCommuneReferenceByHeaders(input, ['Versum 2']);
}

function findCommuneReferenceByHeaders(
  input: ApplyRuleSetInput,
  headers: readonly string[]
): TextReference | undefined {
  const comkey = input.celebrationRules.comkey;
  if (!comkey) {
    return undefined;
  }

  const path = `horas/Latin/Commune/${comkey}.txt`;
  const file = input.corpus.getFile(path);
  if (!file) {
    return undefined;
  }

  return findReferenceInFile(file, `horas/Latin/Commune/${comkey}`, headers);
}

function findReferenceInFiles(
  files: readonly ParsedFile[],
  headers: readonly string[]
): TextReference | undefined {
  for (const header of headers) {
    for (const file of files) {
      if (file.sections.some((section) => section.header === header)) {
        return {
          path: file.path.replace(/\.txt$/u, ''),
          section: header
        };
      }
    }
  }

  return undefined;
}

function findReferenceInFile(
  file: ParsedFile,
  path: string,
  headers: readonly string[]
): TextReference | undefined {
  for (const header of headers) {
    if (file.sections.some((section) => section.header === header)) {
      return {
        path,
        section: header
      };
    }
  }

  return undefined;
}

function sameReference(left: TextReference, right: TextReference): boolean {
  return left.path === right.path && left.section === right.section && left.selector === right.selector;
}

function resolveSpecialMinorHourOration(
  slotName: SlotName,
  input: ApplyRuleSetInput
): SlotContent | undefined {
  if (slotName !== 'oration' || input.hour !== 'prime' || !usesVersum2InPlaceOfLaterBlock(input)) {
    return undefined;
  }

  return {
    kind: 'ordered-refs',
    refs: [commonPrayerRef('oratio_Domine'), commonPrayerRef('Per Dominum')]
  };
}

function commonPrayerRef(section: string): TextReference {
  return {
    path: COMMON_PRAYERS_PATH,
    section
  };
}

function properHeadersForSlot(
  slot: SlotName,
  hour: HourName,
  input?: ApplyRuleSetInput
): readonly string[] {
  const hourSuffix = HOUR_SECTION_SUFFIX[hour];
  switch (slot) {
    case 'hymn':
      return [`Hymnus ${hourSuffix}`, 'Hymnus'];
    case 'chapter':
      if (hour === 'prime') {
        return ['Lectio Prima', `Capitulum ${hourSuffix}`, 'Capitulum'];
      }
      if (hour === 'vespers') {
        const side = (input as InternalVespersAwareInput | undefined)?.__vespersSide;
        return side === 'first'
          ? ['Capitulum Vespera 1', `Capitulum ${hourSuffix}`, 'Capitulum Laudes', 'Capitulum']
          : side === 'second'
            ? ['Capitulum Vespera 3', `Capitulum ${hourSuffix}`, 'Capitulum Laudes', 'Capitulum']
            : [`Capitulum ${hourSuffix}`, 'Capitulum Laudes', 'Capitulum'];
      }
      if (hour === 'terce') {
        return [`Capitulum ${hourSuffix}`, 'Capitulum Laudes', 'Capitulum'];
      }
      return [`Capitulum ${hourSuffix}`, 'Capitulum'];
    case 'responsory':
      return [
        `Responsory Breve ${hourSuffix}`,
        `Responsory breve ${hourSuffix}`,
        `Responsory ${hourSuffix}`,
        'Responsorium'
      ];
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
      if (hour === 'lauds') {
        return ['Oratio 2', 'Oratio'];
      }
      if (hour === 'vespers') {
        return ['Oratio 3', 'Oratio'];
      }
      if (
        hour === 'prime' ||
        hour === 'terce' ||
        hour === 'sext' ||
        hour === 'none'
      ) {
        return input?.temporal.dayName === 'Quad6-6' ? ['Oratio 2', 'Oratio'] : ['Oratio'];
      }
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
  // Phase 3 §3e: replace the old `hour !== 'lauds' && hour !== 'vespers'`
  // guard with a policy hook. 1960 returns false for non-Lauds/Vespers
  // (preserving current behaviour); 1911 and 1955 return true for Matins
  // commemorations per Rubricae Generales §IX.
  if (
    !input.policy.commemoratesAtHour({
      hour: input.hour,
      celebration: input.celebration,
      celebrationRules: input.celebrationRules,
      temporal: input.temporal
    })
  ) {
    return;
  }

  if (input.policy.name === 'rubrics-1960' && input.celebrationRules.omitCommemoration) {
    return;
  }

  const applicable = input.policy.limitCommemorations(
    input.commemorations.filter((c) => c.hours.includes(input.hour)),
    {
      hour: input.hour,
      celebration: input.celebration,
      celebrationRules: input.celebrationRules,
      temporal: input.temporal
    }
  );
  if (applicable.length === 0) {
    return;
  }

  // Commemoration antiphon headers mirror the canticle antiphon lookup
  // order used elsewhere — temporal feasts emit `Ant 2`/`Ant 3`, sanctoral
  // feasts emit `Ant Laudes`/`Ant Vespera 3` etc. The Phase 3 resolver
  // should fall back through candidates; here we pick the most common
  // temporal form first so that temporal commemorations (the majority)
  // dereference without an extra lookup. Matins commemorations (1911/1955
  // per §3e) reuse the first-nocturn antiphon conventionally.
  const { antiphonHeader, versicleHeader } = commemorationHeaders(input.hour);
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
}

function commemorationHeaders(hour: HourName): {
  readonly antiphonHeader: string;
  readonly versicleHeader: string;
} {
  switch (hour) {
    case 'matins':
      // Matins commemorations (pre-1960) use the first-nocturn antiphon /
      // versicle as their default commemoration header per Rubricae
      // Generales §IX. More specific per-lesson substitutions are 3h
      // adjudication territory.
      return { antiphonHeader: 'Ant 1', versicleHeader: 'Versum 1' };
    case 'lauds':
      return { antiphonHeader: 'Ant 2', versicleHeader: 'Versum 2' };
    case 'vespers':
      return { antiphonHeader: 'Ant 3', versicleHeader: 'Versum 3' };
    default:
      // Minor hours and Compline are not commemoration-bearing in any of
      // the Roman policies; `commemoratesAtHour` should have short-
      // circuited before we get here.
      return { antiphonHeader: 'Ant 1', versicleHeader: 'Versum 1' };
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

const COMPLINE_SPECIAL_FALLBACKS: Readonly<Partial<Record<SlotName, string>>> = {
  hymn: 'Hymnus Completorium',
  chapter: 'Completorium',
  responsory: 'Responsory Completorium',
  versicle: 'Versum 4',
  'lectio-brevis': 'Lectio Completorium'
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
    celebration: input.celebration,
    celebrationRules: input.celebrationRules,
    hourRules: input.hourRules,
    temporal: input.temporal,
    ...(input.overlay ? { overlay: input.overlay } : {})
  });
  return Object.freeze([...set]);
}
