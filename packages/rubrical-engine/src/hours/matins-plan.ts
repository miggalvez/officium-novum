import { conditionMatches } from '../internal/conditions.js';
import { resolveOfficeFile } from '../internal/content.js';
import { normalizeDateInput } from '../internal/date.js';
import type { ParsedFile, TextContent } from '@officium-nova/parser';
import type { ScriptureTransferEntry } from '@officium-nova/parser';

import { routeLesson } from './matins-lessons.js';
import { applyScriptureTransfer } from './matins-scripture.js';
import { selectLessonAlternate } from './matins-alternates.js';

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

export function buildMatinsPlan(input: BuildMatinsPlanInput): MatinsPlan {
  return buildMatinsPlanWithWarnings(input).plan;
}

export function buildMatinsPlanWithWarnings(
  input: BuildMatinsPlanInput
): BuildMatinsPlanResult {
  const warnings: RubricalWarning[] = [];
  const feastFile = resolveFeastFile(input.corpus, input.celebration);
  const psalteriumDaySection = resolvePsalteriumMatinsDaySection(input);

  const shape = input.policy.resolveMatinsShape({
    celebration: input.celebration,
    celebrationRules: input.celebrationRules,
    temporal: input.temporal,
    commemorations: input.commemorations
  });

  const invitatorium = buildInvitatoriumSource(input, feastFile);
  const hymn = buildHymnSource(input, feastFile);
  const defaultCourse = input.policy.defaultScriptureCourse(input.temporal);

  const antiphonEntries = collectMatinsAntiphons(input, feastFile, psalteriumDaySection);
  const antiphonPartitions = partitionAntiphons(antiphonEntries, shape.lessonsPerNocturn);

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
            feastFile,
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

    nocturnPlan.push({
      index: nocturnIndex,
      psalmody,
      antiphons,
      versicle: buildNocturnVersicle(
        nocturnIndex,
        input,
        feastFile,
        psalteriumDaySection,
        warnings
      ),
      lessons,
      responsories
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
  feastFile: ParsedFile | undefined
): InvitatoriumSource {
  if (input.hourRules.omit.includes('invitatorium')) {
    return { kind: 'suppressed' };
  }

  const section = findSection(feastFile, 'Invit', input);
  if (section) {
    return {
      kind: 'feast',
      reference: feastReference(input.celebration.feastRef.path, section.header)
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
  feastFile: ParsedFile | undefined
): HymnSource {
  if (input.hourRules.omit.includes('hymnus')) {
    return { kind: 'suppressed' };
  }

  const section = findSection(feastFile, 'Hymnus Matutinum', input);
  if (section) {
    return {
      kind: 'feast',
      reference: feastReference(input.celebration.feastRef.path, section.header),
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
    reference: {
      path: 'horas/Ordinarium/Matutinum',
      section: 'Hymnus'
    }
  };
}

function buildNocturnVersicle(
  nocturnIndex: 1 | 2 | 3,
  input: BuildMatinsPlanInput,
  feastFile: ParsedFile | undefined,
  psalteriumDaySection: ParsedFile['sections'][number] | undefined,
  warnings: RubricalWarning[]
): VersicleSource {
  const sectionName = `Nocturn ${nocturnIndex} Versum`;
  const section = findSection(feastFile, sectionName, input);
  if (section) {
    return {
      reference: feastReference(input.celebration.feastRef.path, section.header)
    };
  }

  const versicleLine = versicleLineForNocturn(psalteriumDaySection, nocturnIndex);
  if (psalteriumDaySection && versicleLine) {
    return {
      reference: {
        path: PSALTERIUM_MATINS_CONTENT_PATH,
        section: psalteriumDaySection.header,
        selector: String(versicleLine)
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
  feastFile: ParsedFile | undefined,
  warnings: RubricalWarning[]
): ResponsorySource {
  const sectionName = `Responsory${index}`;
  const section = findSection(feastFile, sectionName, input);
  if (section) {
    return {
      index,
      reference: feastReference(input.celebration.feastRef.path, section.header)
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
  feastFile: ParsedFile | undefined,
  psalteriumDaySection: ParsedFile['sections'][number] | undefined
): readonly {
  readonly reference: TextReference;
  readonly psalmRef?: PsalmAssignment;
}[] {
  const feastSection = findSection(feastFile, 'Ant Matutinum', input);
  const section = feastSection ?? psalteriumDaySection;
  if (!section) {
    return [];
  }

  const sourcePath = feastSection
    ? `horas/Latin/${input.celebration.feastRef.path}`
    : PSALTERIUM_MATINS_CONTENT_PATH;
  const entries: Array<{ readonly reference: TextReference; readonly psalmRef?: PsalmAssignment }> = [];

  for (const [contentIndex, content] of section.content.entries()) {
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

function partitionAntiphons(
  entries: readonly {
    readonly reference: TextReference;
    readonly psalmRef?: PsalmAssignment;
  }[],
  lessonsPerNocturn: readonly number[]
): readonly (readonly AntiphonReference[])[] {
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

  if (content.type === 'reference') {
    return '@reference';
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

function versicleLineForNocturn(
  section: ParsedFile['sections'][number] | undefined,
  nocturnIndex: 1 | 2 | 3
): number | undefined {
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

  return versicleLines[nocturnIndex - 1];
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

function findSection(
  file: ParsedFile | undefined,
  header: string,
  input: Pick<BuildMatinsPlanInput, 'temporal' | 'version'>
): ParsedFile['sections'][number] | undefined {
  if (!file) {
    return undefined;
  }

  const date = normalizeDateInput(input.temporal.date);
  let fallback: ParsedFile['sections'][number] | undefined;

  for (const section of file.sections) {
    if (section.header !== header) {
      continue;
    }

    if (!section.condition) {
      fallback ??= section;
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
      return section;
    }
  }

  return fallback;
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
    return findSection(file, `Day${input.temporal.dayOfWeek}`, input);
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
