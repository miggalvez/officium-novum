import { conditionMatches } from '../internal/conditions.js';
import { resolveOfficeFile } from '../internal/content.js';
import { dateToYearDay, dayOfWeek, normalizeDateInput } from '../internal/date.js';
import type { ParsedFile, TextContent } from '@officium-novum/parser';
import type { ScriptureTransferEntry } from '@officium-novum/parser';

import { routeLesson } from './matins-lessons.js';
import { applyScriptureTransfer } from './matins-scripture.js';
import { selectLessonAlternate } from './matins-alternates.js';
import { resolveRuleReferenceFiles } from '../rules/resolve-vide-ex.js';

import type {
  AntiphonReference,
  HymnSource,
  InvitatoriumSource,
  LessonIndex,
  LessonPlan,
  MatinsPlan,
  NocturnPlan,
  ResponsorySource,
  VersicleSource
} from '../types/matins.js';
import type { RubricalWarning } from '../types/directorium.js';
import type { PsalmAssignment, TextReference } from '../types/hour-structure.js';
import type { OfficeTextIndex, TemporalContext } from '../types/model.js';
import type { Celebration, Commemoration } from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';
import type { CelebrationRuleSet, HourRuleSet } from '../types/rule-set.js';
import type { ResolvedVersion } from '../types/version.js';

export interface BuildMatinsPlanInput {
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly commemorations: readonly Commemoration[];
  readonly hourRules: HourRuleSet;
  readonly temporal: TemporalContext;
  readonly policy: RubricalPolicy;
  readonly corpus: OfficeTextIndex;
  readonly version?: ResolvedVersion;
  readonly overlayScriptureTransfer?: ScriptureTransferEntry;
}

export interface BuildMatinsPlanResult {
  readonly plan: MatinsPlan;
  readonly warnings: readonly RubricalWarning[];
}

const PSALTERIUM_INVITATORIUM_PATH = 'horas/Latin/Psalterium/Invitatorium';
const PSALTERIUM_MATINS_PATH = 'Psalterium/Psalmi/Psalmi matutinum';
const PSALTERIUM_MATINS_CONTENT_PATH = 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum';
const PSALTERIUM_MATINS_SPECIAL_PATH = 'horas/Latin/Psalterium/Special/Matutinum Special';

export function buildMatinsPlan(input: BuildMatinsPlanInput): MatinsPlan {
  return buildMatinsPlanWithWarnings(input).plan;
}

export function buildMatinsPlanWithWarnings(
  input: BuildMatinsPlanInput
): BuildMatinsPlanResult {
  const warnings: RubricalWarning[] = [];
  const feastFile = resolveFeastFile(input.corpus, input.celebration);
  const feastFiles = resolveProperMatinsFiles(feastFile, input);
  const psalteriumDaySection = resolvePsalteriumMatinsDaySection(input);

  const shape = input.policy.resolveMatinsShape({
    celebration: input.celebration,
    celebrationRules: input.celebrationRules,
    temporal: input.temporal,
    commemorations: input.commemorations
  });

  const invitatorium = buildInvitatoriumSource(input, feastFiles);
  const hymn = buildHymnSource(input, feastFiles);
  const defaultCourse = input.policy.defaultScriptureCourse(input.temporal);

  const antiphonEntries = collectMatinsAntiphons(input, feastFiles, psalteriumDaySection);
  const antiphonPartitions = partitionAntiphons(
    antiphonEntries,
    shape.lessonsPerNocturn
  );

  const nocturnPlan: NocturnPlan[] = [];
  let globalLessonIndex = 1;

  for (let nocturnIndex = 1 as const; nocturnIndex <= shape.nocturns; nocturnIndex++) {
    const lessonsInNocturn = shape.lessonsPerNocturn[nocturnIndex - 1] ?? 3;
    const selectedAlternate = selectLessonAlternate({
      nocturn: nocturnIndex,
      alternates: input.celebrationRules.lessonSetAlternates,
      temporal: input.temporal,
      ...(input.version ? { version: input.version } : {})
    });

    const lessons: LessonPlan[] = [];
    const responsories: ResponsorySource[] = [];

    for (let offset = 0; offset < lessonsInNocturn; offset++) {
      const index = toLessonIndex(globalLessonIndex);
      const source = routeLesson(index, {
        celebration: input.celebration,
        celebrationRules: input.celebrationRules,
        commemorations: input.commemorations,
        temporal: input.temporal,
        policy: input.policy,
        defaultCourse,
        nocturnIndex,
        shape,
        selectedAlternate,
        feastFile,
        warnings,
        ...(input.version ? { version: input.version } : {})
      });

      lessons.push({
        index,
        source,
        ...(selectedAlternate.location !== 1 && selectedAlternate.gate
          ? { gateCondition: selectedAlternate.gate }
          : {})
      });

      if (globalLessonIndex <= 9) {
        responsories.push(
          buildResponsory(
            toResponsoryIndex(globalLessonIndex),
            input,
            feastFiles,
            warnings
          )
        );
      }

      globalLessonIndex += 1;
    }

    const antiphons = antiphonPartitions[nocturnIndex - 1] ?? [];
    const psalmody = antiphons
      .map((entry) => entry.psalmRef)
      .filter((entry): entry is PsalmAssignment => Boolean(entry));

    // Per Phase 3 plan §3d: benedictions are required on every NocturnPlan
    // so the type checker enumerates every consumer. The policy selects the
    // actual TextReference for each lesson's benediction.
    const lessonIntroduction = input.hourRules.matinsLessonIntroduction;
    const benedictions =
      lessonIntroduction === 'ordinary'
        ? input.policy.selectBenedictions({
            nocturnIndex,
            lessons,
            celebration: input.celebration,
            celebrationRules: input.celebrationRules,
            temporal: input.temporal,
            totalLessons: shape.totalLessons
          })
        : [];

    nocturnPlan.push({
      index: nocturnIndex,
      psalmody,
      antiphons,
      versicle: buildNocturnVersicle(
        nocturnIndex,
        input,
        feastFiles,
        psalteriumDaySection,
        warnings,
        shape.nocturns,
        antiphons.length
      ),
      lessonIntroduction,
      lessons,
      responsories,
      benedictions
    });
  }

  let plan: MatinsPlan = {
    hour: 'matins',
    nocturns: shape.nocturns,
    totalLessons: shape.totalLessons,
    lessonsPerNocturn: [...shape.lessonsPerNocturn],
    invitatorium,
    hymn,
    nocturnPlan,
    teDeum: 'say'
  };

  const teDeum = input.policy.resolveTeDeum({
    plan: {
      nocturns: shape.nocturns,
      totalLessons: shape.totalLessons
    },
    celebrationRules: input.celebrationRules,
    temporal: input.temporal
  });

  plan = applyScriptureTransfer(plan, input.overlayScriptureTransfer, warnings);
  plan = {
    ...plan,
    teDeum
  };

  if (teDeum === 'replace-with-responsory') {
    plan = markTeDeumReplacement(plan);
  }

  return {
    plan,
    warnings
  };
}

function buildInvitatoriumSource(
  input: BuildMatinsPlanInput,
  feastFiles: readonly ParsedFile[]
): InvitatoriumSource {
  if (input.hourRules.omit.includes('invitatorium')) {
    return { kind: 'suppressed' };
  }

  const match = findSection(feastFiles, 'Invit', input);
  if (match) {
    return {
      kind: 'feast',
      reference: officeReference(match.file.path, match.section.header)
    };
  }

  return {
    kind: 'season',
    reference: {
      path: PSALTERIUM_INVITATORIUM_PATH,
      section: '__preamble',
      selector: invitatoriumSeasonSection(input.temporal)
    }
  };
}

function buildHymnSource(
  input: BuildMatinsPlanInput,
  feastFiles: readonly ParsedFile[]
): HymnSource {
  if (input.hourRules.omit.includes('hymnus')) {
    return { kind: 'suppressed' };
  }

  const match = findSection(feastFiles, 'Hymnus Matutinum', input);
  if (match) {
    return {
      kind: 'feast',
      reference: officeReference(match.file.path, match.section.header),
      ...(input.celebrationRules.doxologyVariant
        ? { doxologyVariant: input.celebrationRules.doxologyVariant }
        : {}),
      ...(input.celebrationRules.papalNames
        ? { papalNameBinding: input.celebrationRules.papalNames }
        : {})
    };
  }

  return {
    kind: 'ordinary',
    reference: ordinaryMatinsHymnReference(input)
  };
}

function buildNocturnVersicle(
  nocturnIndex: 1 | 2 | 3,
  input: BuildMatinsPlanInput,
  feastFiles: readonly ParsedFile[],
  psalteriumDaySection: ParsedFile['sections'][number] | undefined,
  warnings: RubricalWarning[],
  totalNocturns: number,
  antiphonCount: number
): VersicleSource {
  const sectionName = `Nocturn ${nocturnIndex} Versum`;
  const match = findSection(feastFiles, sectionName, input);
  if (match) {
    return {
      reference: officeReference(match.file.path, match.section.header)
    };
  }

  const versicleSelector = versicleSelectorForNocturn(
    psalteriumDaySection,
    nocturnIndex,
    totalNocturns,
    antiphonCount
  );
  if (psalteriumDaySection && versicleSelector) {
    return {
      reference: {
        path: PSALTERIUM_MATINS_CONTENT_PATH,
        section: psalteriumDaySection.header,
        selector: versicleSelector
      }
    };
  }

  warnings.push({
    code: 'matins-skeleton-missing-section',
    message: 'Matins nocturn versicle section is missing; using Ordinarium fallback.',
    severity: 'warn',
    context: {
      feast: input.celebration.feastRef.path,
      section: sectionName
    }
  });

  return {
    reference: {
      path: 'horas/Ordinarium/Matutinum',
      section: 'Psalmi cum lectionibus'
    }
  };
}

function buildResponsory(
  index: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  input: BuildMatinsPlanInput,
  feastFiles: readonly ParsedFile[],
  warnings: RubricalWarning[]
): ResponsorySource {
  const sectionName = `Responsory${index}`;
  const match = findSection(feastFiles, sectionName, input);
  if (match) {
    return {
      index,
      reference: officeReference(match.file.path, match.section.header)
    };
  }

  warnings.push({
    code: 'matins-skeleton-missing-section',
    message: 'Matins responsory section is missing; emitted placeholder reference.',
    severity: 'warn',
    context: {
      feast: input.celebration.feastRef.path,
      section: sectionName
    }
  });

  return {
    index,
    reference: {
      path: `horas/Latin/${input.celebration.feastRef.path}`,
      section: sectionName,
      selector: 'missing'
    }
  };
}

function collectMatinsAntiphons(
  input: BuildMatinsPlanInput,
  feastFiles: readonly ParsedFile[],
  psalteriumDaySection: ParsedFile['sections'][number] | undefined
): readonly {
  readonly reference: TextReference;
  readonly psalmRef?: PsalmAssignment;
}[] {
  const feastMatch = findSection(feastFiles, 'Ant Matutinum', input);
  const section = feastMatch?.section ?? psalteriumDaySection;
  if (!section) {
    return [];
  }

  const sourcePath = feastMatch
    ? feastMatch.file.path.replace(/\.txt$/u, '')
    : PSALTERIUM_MATINS_CONTENT_PATH;
  const entries: Array<{ readonly reference: TextReference; readonly psalmRef?: PsalmAssignment }> = [];
  const visibleContent = input.version
    ? flattenVisibleMatinsAntiphonContent(section.content, input)
    : section.content;

  for (const [contentIndex, content] of visibleContent.entries()) {
    const antiphon = antiphonLineValue(content);
    if (!antiphon) {
      continue;
    }

    const ref: TextReference = {
      path: sourcePath,
      section: section.header,
      selector: String(contentIndex + 1)
    };

    const psalmNumber = extractPsalmNumber(content) ?? extractPsalmNumberFromLine(antiphon);
    const psalmRef = psalmNumber
      ? {
          psalmRef: {
            path: `horas/Latin/Psalterium/Psalmorum/Psalm${psalmNumber}`,
            section: '__preamble'
          },
          antiphonRef: ref
        }
      : undefined;

    entries.push({
      reference: ref,
      ...(psalmRef ? { psalmRef } : {})
    });
  }

  return entries;
}

function flattenVisibleMatinsAntiphonContent(
  content: readonly TextContent[],
  input: Pick<BuildMatinsPlanInput, 'temporal' | 'version'>
): readonly TextContent[] {
  if (!input.version) {
    return content;
  }

  const date = normalizeDateInput(input.temporal.date);
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type !== 'conditional') {
      out.push(node);
      continue;
    }

    if (
      !conditionMatches(node.condition, {
        date,
        dayOfWeek: input.temporal.dayOfWeek,
        season: input.temporal.season,
        version: input.version
      })
    ) {
      continue;
    }

    out.push(...flattenVisibleMatinsAntiphonContent(node.content, input));
  }

  return Object.freeze(out);
}

function partitionAntiphons(
  entries: readonly {
    readonly reference: TextReference;
    readonly psalmRef?: PsalmAssignment;
  }[],
  lessonsPerNocturn: readonly number[]
): readonly (readonly AntiphonReference[])[] {
  if (lessonsPerNocturn.length === 1) {
    return [
      entries.map((entry, index) => ({
        index: index + 1,
        reference: entry.reference,
        ...(entry.psalmRef ? { psalmRef: entry.psalmRef } : {})
      }))
    ];
  }

  const partitions: AntiphonReference[][] = [];
  let cursor = 0;

  for (let i = 0; i < lessonsPerNocturn.length; i++) {
    const span = lessonsPerNocturn[i] ?? 3;
    const antiphons: AntiphonReference[] = [];
    for (let j = 0; j < span; j++) {
      const entry = entries[cursor + j];
      if (!entry) {
        continue;
      }

      antiphons.push({
        index: j + 1,
        reference: entry.reference,
        ...(entry.psalmRef ? { psalmRef: entry.psalmRef } : {})
      });
    }

    partitions.push(antiphons);
    cursor += span;
  }

  return partitions;
}

function antiphonLineValue(content: TextContent): string | undefined {
  if (content.type === 'psalmRef') {
    const value = content.antiphon?.trim();
    if (value && value !== '_') {
      return value;
    }
  }

  if (content.type === 'text') {
    const value = content.value.trim();
    if (value && value !== '_') {
      return value;
    }
  }

  if (content.type === 'verseMarker' && content.marker === 'Ant.') {
    const value = content.text.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function extractPsalmNumber(content: TextContent): string | undefined {
  if (content.type === 'psalmRef') {
    return String(content.psalmNumber);
  }

  if (content.type === 'text') {
    return extractPsalmNumberFromLine(content.value);
  }

  return undefined;
}

function extractPsalmNumberFromLine(line: string): string | undefined {
  const match = /;;\s*([0-9]+)/u.exec(line);
  return match?.[1];
}

function versicleSelectorForNocturn(
  section: ParsedFile['sections'][number] | undefined,
  nocturnIndex: 1 | 2 | 3,
  totalNocturns: number,
  antiphonCount: number
): string | undefined {
  if (!section) {
    return undefined;
  }

  const versicleLines: number[] = [];

  for (const [lineIndex, content] of section.content.entries()) {
    if (content.type !== 'verseMarker') {
      continue;
    }

    if (content.marker === 'V.' || content.marker === 'v.') {
      versicleLines.push(lineIndex + 1);
    }
  }

  const startLine =
    totalNocturns === 1 && antiphonCount > 3
      ? versicleLines.at(-1)
      : versicleLines[nocturnIndex - 1];
  return startLine ? String(startLine) : undefined;
}

function markTeDeumReplacement(plan: MatinsPlan): MatinsPlan {
  const lastNocturn = plan.nocturnPlan.at(-1);
  if (!lastNocturn) {
    return plan;
  }

  const lastResponsory = lastNocturn.responsories.at(-1);
  if (!lastResponsory) {
    return plan;
  }

  const updatedLastNocturn: NocturnPlan = {
    ...lastNocturn,
    responsories: lastNocturn.responsories.map((responsory) =>
      responsory.index === lastResponsory.index
        ? {
            ...responsory,
            replacesTeDeum: true
          }
        : responsory
    )
  };

  const nocturnPlan = [...plan.nocturnPlan];
  nocturnPlan[nocturnPlan.length - 1] = updatedLastNocturn;

  return {
    ...plan,
    nocturnPlan
  };
}

interface SectionMatch {
  readonly file: ParsedFile;
  readonly section: ParsedFile['sections'][number];
}

function findSection(
  files: readonly ParsedFile[],
  header: string,
  input: Pick<BuildMatinsPlanInput, 'temporal' | 'version'>
): SectionMatch | undefined {
  if (files.length === 0) {
    return undefined;
  }

  const date = normalizeDateInput(input.temporal.date);
  let fallback: SectionMatch | undefined;

  for (const file of files) {
    for (const section of file.sections) {
      if (section.header !== header) {
        continue;
      }

      if (!section.condition) {
        fallback ??= { file, section };
        continue;
      }

      if (!input.version) {
        continue;
      }

      const matches = conditionMatches(section.condition, {
        date,
        dayOfWeek: input.temporal.dayOfWeek,
        season: input.temporal.season,
        version: input.version
      });
      if (matches) {
        return { file, section };
      }
    }
  }

  return fallback;
}

function resolveProperMatinsFiles(
  feastFile: ParsedFile | undefined,
  input: BuildMatinsPlanInput
): readonly ParsedFile[] {
  if (!feastFile) {
    return [];
  }

  if (!input.version) {
    return [feastFile];
  }

  const inherited = resolveRuleReferenceFiles(feastFile, {
    date: normalizeDateInput(input.temporal.date),
    dayOfWeek: input.temporal.dayOfWeek,
    season: input.temporal.season,
    version: input.version,
    corpus: input.corpus
  });

  return [feastFile, ...inherited.files];
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

function resolvePsalteriumMatinsDaySection(
  input: Pick<BuildMatinsPlanInput, 'corpus' | 'temporal' | 'version'>
): ParsedFile['sections'][number] | undefined {
  try {
    const file = resolveOfficeFile(input.corpus, PSALTERIUM_MATINS_PATH);
    return findSection([file], `Day${input.temporal.dayOfWeek}`, input)?.section;
  } catch {
    return undefined;
  }
}

function feastReference(path: string, section: string): TextReference {
  return {
    path: `horas/Latin/${path}`,
    section
  };
}

function officeReference(path: string, section: string): TextReference {
  return {
    path: path.replace(/\.txt$/u, ''),
    section
  };
}

function toLessonIndex(value: number): LessonIndex {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) {
    return value;
  }
  if (value === 7 || value === 8 || value === 9 || value === 10 || value === 11 || value === 12) {
    return value;
  }
  return 12;
}

function toResponsoryIndex(
  value: number
): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  if (value === 6 || value === 7 || value === 8 || value === 9) {
    return value;
  }
  return 9;
}

function invitatoriumSeasonSection(temporal: TemporalContext): string {
  switch (temporal.season) {
    case 'advent':
      return 'Adventus';
    case 'christmastide':
      return 'Nativitatis';
    case 'epiphanytide':
    case 'time-after-epiphany':
      return 'Epiphania';
    case 'septuagesima':
      return 'Septuagesima';
    case 'lent':
      return 'Quadragesima';
    case 'passiontide':
      return 'Passio';
    case 'eastertide':
      return 'Pascha';
    case 'ascensiontide':
      return 'Ascensio';
    case 'pentecost-octave':
      return 'Pentecostes';
    case 'time-after-pentecost':
    default:
      return 'PostPentecosten';
  }
}

function ordinaryMatinsHymnReference(input: Pick<BuildMatinsPlanInput, 'temporal' | 'version'>): TextReference {
  const seasonal = ordinaryMatinsSeasonalHymnSection(input.temporal.season);
  if (seasonal) {
    return {
      path: PSALTERIUM_MATINS_SPECIAL_PATH,
      section: `Hymnus ${seasonal}`
    };
  }

  const ordinaryDay = ordinaryMatinsHymnDaySection(input);
  return {
    path: PSALTERIUM_MATINS_SPECIAL_PATH,
    section: ordinaryDay
  };
}

function ordinaryMatinsSeasonalHymnSection(
  season: TemporalContext['season']
): 'Adv' | 'Quad' | 'Quad5' | 'Pasch' | undefined {
  switch (season) {
    case 'advent':
      return 'Adv';
    case 'lent':
      return 'Quad';
    case 'passiontide':
      return 'Quad5';
    case 'eastertide':
    case 'ascensiontide':
    case 'pentecost-octave':
      return 'Pasch';
    default:
      return undefined;
  }
}

function ordinaryMatinsHymnDaySection(
  input: Pick<BuildMatinsPlanInput, 'temporal' | 'version'>
): string {
  const date = normalizeDateInput(input.temporal.date);
  if (
    input.temporal.dayOfWeek === 0 &&
    shouldUseFirstOrdinarySundayMatinsHymn(
      date,
      input.version?.handle.includes('1960') ?? false
    )
  ) {
    return 'Day0 Hymnus1';
  }

  return `Day${input.temporal.dayOfWeek} Hymnus`;
}

function shouldUseFirstOrdinarySundayMatinsHymn(
  date: ReturnType<typeof normalizeDateInput>,
  modernStyleMonthday: boolean
): boolean {
  if (date.month < 4) {
    return true;
  }
  const monthdayKey = computeMonthdayKey(date, modernStyleMonthday);
  return monthdayKey ? /^1\d\d-/u.test(monthdayKey) : false;
}

function computeMonthdayKey(
  date: ReturnType<typeof normalizeDateInput>,
  modernStyle: boolean
): string | undefined {
  if (date.month < 7) {
    return undefined;
  }

  const currentDayOfYear = dateToYearDay(date);
  let liturgicalMonth = 0;
  const firstSundays: number[] = [];

  for (let month = 8; month <= 12; month += 1) {
    const firstOfMonth = dateToYearDay({ year: date.year, month, day: 1 });
    const weekday = dayOfWeek({ year: date.year, month, day: 1 });
    let firstSunday = firstOfMonth - weekday;
    if (weekday >= 4 || (weekday > 0 && modernStyle)) {
      firstSunday += 7;
    }
    firstSundays[month - 8] = firstSunday;

    if (currentDayOfYear >= firstSunday) {
      liturgicalMonth = month;
    } else {
      break;
    }
  }

  if (liturgicalMonth === 0) {
    return undefined;
  }

  const adventStart = firstSundayOfAdventDayOfYear(date.year);
  if (liturgicalMonth > 10 && currentDayOfYear >= adventStart) {
    return undefined;
  }

  let week = Math.floor((currentDayOfYear - firstSundays[liturgicalMonth - 8]!) / 7);

  if (
    liturgicalMonth === 10 &&
    modernStyle &&
    week >= 2 &&
    dayOfMonthFromDayOfYear(firstSundays[10 - 8]!, date.year) >= 4
  ) {
    week += 1;
  }

  if (liturgicalMonth === 11 && (week > 0 || modernStyle)) {
    week = 4 - Math.floor((adventStart - currentDayOfYear - 1) / 7);
    if (modernStyle && week === 1) {
      week = 0;
    }
  }

  return `${String(liturgicalMonth).padStart(2, '0')}${week + 1}-${dayOfWeek(date)}`;
}

function firstSundayOfAdventDayOfYear(year: number): number {
  const christmas = { year, month: 12, day: 25 } as const;
  const christmasWeekday = dayOfWeek(christmas) || 7;
  return dateToYearDay(christmas) - christmasWeekday - 21;
}

function dayOfMonthFromDayOfYear(dayOfYear: number, year: number): number {
  const monthLengths = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];
  let remaining = dayOfYear;
  for (const length of monthLengths) {
    if (remaining <= length) {
      return remaining;
    }
    remaining -= length;
  }
  return remaining;
}
