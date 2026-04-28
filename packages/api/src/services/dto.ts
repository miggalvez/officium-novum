import type {
  ComposedHour,
  ComposedRun,
  ComposeWarning,
  SectionType
} from '@officium-novum/compositor';
import type {
  Candidate,
  Celebration,
  Commemoration,
  DayOfficeSummary,
  FeastReference,
  HourName,
  ResolvedRank,
  RubricalWarning,
  VersionDescriptor,
  VersionHandle
} from '@officium-novum/rubrical-engine';

import type {
  CorpusLanguageName,
  LanguageSelection,
  PublicLanguageTag
} from './language-map.js';
import type { TextOrthographyProfile } from './orthography-profile.js';

export interface OfficeHourResponse {
  readonly kind: 'office-hour';
  readonly apiVersion: 'v1';
  readonly request: {
    readonly date: string;
    readonly hour: HourName;
    readonly version: VersionHandle;
    readonly languages: readonly PublicLanguageTag[];
    readonly langfb?: PublicLanguageTag;
    readonly orthography: TextOrthographyProfile;
    readonly joinLaudsToMatins: boolean;
    readonly strict: boolean;
  };
  readonly version: VersionDescriptor;
  readonly summary: DaySummaryDto;
  readonly office: PublicComposedHourDto;
  readonly warnings: {
    readonly rubrical: readonly RubricalWarning[];
    readonly composition: readonly ComposeWarning[];
  };
  readonly meta: {
    readonly contentVersion: string;
    readonly canonicalPath: string;
    readonly quality: 'complete' | 'partial';
  };
}

export interface OfficeDayResponse {
  readonly kind: 'office-day';
  readonly apiVersion: 'v1';
  readonly request: {
    readonly date: string;
    readonly version: VersionHandle;
    readonly languages: readonly PublicLanguageTag[];
    readonly langfb?: PublicLanguageTag;
    readonly orthography: TextOrthographyProfile;
    readonly hours: readonly HourName[];
    readonly strict: boolean;
  };
  readonly version: VersionDescriptor;
  readonly summary: DaySummaryDto;
  readonly hours: Partial<Record<HourName, PublicComposedHourDto>>;
  readonly warnings: {
    readonly rubrical: readonly RubricalWarning[];
    readonly composition: Partial<Record<HourName, readonly ComposeWarning[]>>;
  };
  readonly meta: {
    readonly contentVersion: string;
    readonly canonicalPath: string;
    readonly quality: 'complete' | 'partial';
  };
}

export interface DaySummaryDto {
  readonly date: string;
  readonly version: VersionDescriptor;
  readonly temporal: {
    readonly date: string;
    readonly dayOfWeek: number;
    readonly dayName: string;
    readonly weekStem: string;
    readonly season: DayOfficeSummary['temporal']['season'];
    readonly feast: FeastRefDto;
    readonly rank: RankDto;
  };
  readonly celebration: CelebrationDto;
  readonly commemorations: readonly CommemorationDto[];
  readonly concurrence: {
    readonly winner: 'today' | 'tomorrow';
  };
  readonly candidates: readonly CandidateDto[];
  readonly warnings: readonly RubricalWarning[];
}

export interface FeastRefDto {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

export interface RankDto {
  readonly name: string;
  readonly classSymbol: string;
  readonly weight: number;
}

export interface CelebrationDto {
  readonly feast: FeastRefDto;
  readonly rank: RankDto;
  readonly source: 'temporal' | 'sanctoral';
  readonly kind?: 'vigil' | 'octave';
  readonly octaveDay?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly transferredFrom?: string;
}

export interface CommemorationDto {
  readonly feast: FeastRefDto;
  readonly rank: RankDto;
  readonly reason: Commemoration['reason'];
  readonly hours: readonly HourName[];
  readonly kind?: 'vigil' | 'octave';
  readonly octaveDay?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly color?: Commemoration['color'];
}

export interface CandidateDto {
  readonly feast: FeastRefDto;
  readonly rank: RankDto;
  readonly source: Candidate['source'];
  readonly kind?: 'vigil' | 'octave';
  readonly octaveDay?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly transferredFrom?: string;
}

export interface PublicComposedHourDto {
  readonly date: string;
  readonly hour: HourName;
  readonly celebration: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly orthography: TextOrthographyProfile;
  readonly sections: readonly PublicSectionDto[];
  readonly warnings: readonly ComposeWarning[];
}

export interface PublicSectionDto {
  readonly type: SectionType;
  readonly slot: string;
  readonly reference?: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly heading?: {
    readonly kind: 'nocturn' | 'lesson';
    readonly ordinal: number;
  };
  readonly lines: readonly PublicComposedLineDto[];
}

export interface PublicComposedLineDto {
  readonly marker?: string;
  readonly texts: Partial<Record<PublicLanguageTag, readonly ComposedRunDto[]>>;
}

export type ComposedRunDto =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'rubric'; readonly value: string }
  | { readonly type: 'citation'; readonly value: string }
  | { readonly type: 'unresolved-macro'; readonly name: string }
  | { readonly type: 'unresolved-formula'; readonly name: string }
  | { readonly type: 'unresolved-reference'; readonly ref: unknown };

export function toOfficeHourResponse(input: {
  readonly date: string;
  readonly hour: HourName;
  readonly version: VersionDescriptor;
  readonly summary: DayOfficeSummary;
  readonly composed: ComposedHour;
  readonly languageSelection: LanguageSelection;
  readonly orthography: TextOrthographyProfile;
  readonly joinLaudsToMatins: boolean;
  readonly strict: boolean;
  readonly contentVersion: string;
  readonly canonicalPath: string;
}): OfficeHourResponse {
  return {
    kind: 'office-hour',
    apiVersion: 'v1',
    request: {
      date: input.date,
      hour: input.hour,
      version: input.version.handle,
      languages: input.languageSelection.publicTags,
      ...(input.languageSelection.publicFallback
        ? { langfb: input.languageSelection.publicFallback }
        : {}),
      orthography: input.orthography,
      joinLaudsToMatins: input.joinLaudsToMatins,
      strict: input.strict
    },
    version: input.version,
    summary: toDaySummaryDto(input.summary),
    office: toPublicComposedHour({
      composed: input.composed,
      selection: input.languageSelection,
      orthography: input.orthography,
      version: input.version.handle
    }),
    warnings: {
      rubrical: input.summary.warnings,
      composition: input.composed.warnings
    },
    meta: {
      contentVersion: input.contentVersion,
      canonicalPath: input.canonicalPath,
      quality: hasErrorWarnings(input.summary.warnings, input.composed.warnings)
        ? 'partial'
        : 'complete'
    }
  };
}

export function toDaySummaryDto(summary: DayOfficeSummary): DaySummaryDto {
  return {
    date: summary.date,
    version: summary.version,
    temporal: {
      date: summary.temporal.date,
      dayOfWeek: summary.temporal.dayOfWeek,
      dayName: summary.temporal.dayName,
      weekStem: summary.temporal.weekStem,
      season: summary.temporal.season,
      feast: toFeastRefDto(summary.temporal.feastRef),
      rank: toRankDto(summary.temporal.rank)
    },
    celebration: toCelebrationDto(summary.celebration),
    commemorations: summary.commemorations.map(toCommemorationDto),
    concurrence: {
      winner: summary.concurrence.winner
    },
    candidates: summary.candidates.map(toCandidateDto),
    warnings: summary.warnings
  };
}

export function toOfficeDayResponse(input: {
  readonly date: string;
  readonly version: VersionDescriptor;
  readonly summary: DayOfficeSummary;
  readonly composedHours: Readonly<Partial<Record<HourName, ComposedHour>>>;
  readonly selectedHours: readonly HourName[];
  readonly languageSelection: LanguageSelection;
  readonly orthography: TextOrthographyProfile;
  readonly strict: boolean;
  readonly contentVersion: string;
  readonly canonicalPath: string;
}): OfficeDayResponse {
  const hours: Partial<Record<HourName, PublicComposedHourDto>> = {};
  const composition: Partial<Record<HourName, readonly ComposeWarning[]>> = {};

  for (const hour of input.selectedHours) {
    const composed = input.composedHours[hour];
    if (!composed) {
      continue;
    }
    hours[hour] = toPublicComposedHour({
      composed,
      selection: input.languageSelection,
      orthography: input.orthography,
      version: input.version.handle
    });
    composition[hour] = composed.warnings;
  }

  return {
    kind: 'office-day',
    apiVersion: 'v1',
    request: {
      date: input.date,
      version: input.version.handle,
      languages: input.languageSelection.publicTags,
      ...(input.languageSelection.publicFallback
        ? { langfb: input.languageSelection.publicFallback }
        : {}),
      orthography: input.orthography,
      hours: input.selectedHours,
      strict: input.strict
    },
    version: input.version,
    summary: toDaySummaryDto(input.summary),
    hours,
    warnings: {
      rubrical: input.summary.warnings,
      composition
    },
    meta: {
      contentVersion: input.contentVersion,
      canonicalPath: input.canonicalPath,
      quality: hasErrorWarnings(
        input.summary.warnings,
        input.selectedHours.flatMap((hour) => input.composedHours[hour]?.warnings ?? [])
      )
        ? 'partial'
        : 'complete'
    }
  };
}

export function toPublicComposedHour(input: {
  readonly composed: ComposedHour;
  readonly selection: LanguageSelection;
  readonly orthography: TextOrthographyProfile;
  readonly version: VersionHandle;
}): PublicComposedHourDto {
  return {
    date: input.composed.date,
    hour: input.composed.hour,
    celebration: input.composed.celebration,
    languages: input.selection.publicTags,
    orthography: input.orthography,
    warnings: input.composed.warnings,
    sections: input.composed.sections.map((section) => ({
      type: section.type,
      slot: section.slot,
      ...(section.reference ? { reference: section.reference } : {}),
      languages: section.languages.flatMap((language) => {
        const publicTag = input.selection.toPublic.get(language as CorpusLanguageName);
        return publicTag ? [publicTag] : [];
      }),
      ...(section.heading ? { heading: section.heading } : {}),
      lines: section.lines.map((line) => ({
        ...(line.marker ? { marker: line.marker } : {}),
        texts: remapLineTexts({
          texts: line.texts,
          selection: input.selection,
          orthography: input.orthography,
          version: input.version
        })
      }))
    }))
  };
}

function remapLineTexts(input: {
  readonly texts: Readonly<Record<string, readonly ComposedRun[]>>;
  readonly selection: LanguageSelection;
  readonly orthography: TextOrthographyProfile;
  readonly version: VersionHandle;
}): Partial<Record<PublicLanguageTag, readonly ComposedRunDto[]>> {
  const output: Partial<Record<PublicLanguageTag, readonly ComposedRunDto[]>> = {};
  input.selection.publicTags.forEach((tag, index) => {
    const corpusName = input.selection.corpusNames[index];
    if (!corpusName) {
      return;
    }
    const runs = input.texts[corpusName];
    if (!runs) {
      return;
    }
    output[tag] = runs.map((run) =>
      adaptRunForPublicText({
        run,
        profile: input.orthography,
        version: input.version,
        language: corpusName
      })
    );
  });
  return output;
}

function adaptRunForPublicText(input: {
  readonly run: ComposedRun;
  readonly profile: TextOrthographyProfile;
  readonly version: VersionHandle;
  readonly language: CorpusLanguageName;
}): ComposedRunDto {
  if (input.run.type !== 'text' && input.run.type !== 'rubric') {
    return input.run.type === 'unresolved-reference'
      ? { type: input.run.type, ref: input.run.ref }
      : input.run;
  }

  return {
    type: input.run.type,
    value:
      input.profile === 'source'
        ? input.run.value
        : applyTextOrthographyProfile({
            value: input.run.value,
            version: input.version,
            language: input.language
          })
  };
}

function applyTextOrthographyProfile(input: {
  readonly value: string;
  readonly version: VersionHandle;
  readonly language: CorpusLanguageName;
}): string {
  if (input.language !== 'Latin' || !input.version.startsWith('Rubrics 1960 - ')) {
    return input.value;
  }

  return input.value
    .replaceAll('J', 'I')
    .replaceAll('j', 'i')
    .replaceAll('H-Iesu', 'H-Jesu')
    .replaceAll('eúmdem', 'eúndem');
}

function toCelebrationDto(celebration: Celebration): CelebrationDto {
  return {
    feast: toFeastRefDto(celebration.feastRef),
    rank: toRankDto(celebration.rank),
    source: celebration.source,
    ...(celebration.kind ? { kind: celebration.kind } : {}),
    ...(celebration.octaveDay ? { octaveDay: celebration.octaveDay } : {}),
    ...(celebration.transferredFrom ? { transferredFrom: celebration.transferredFrom } : {})
  };
}

function toCommemorationDto(commemoration: Commemoration): CommemorationDto {
  return {
    feast: toFeastRefDto(commemoration.feastRef),
    rank: toRankDto(commemoration.rank),
    reason: commemoration.reason,
    hours: commemoration.hours,
    ...(commemoration.kind ? { kind: commemoration.kind } : {}),
    ...(commemoration.octaveDay ? { octaveDay: commemoration.octaveDay } : {}),
    ...(commemoration.color ? { color: commemoration.color } : {})
  };
}

function toCandidateDto(candidate: Candidate): CandidateDto {
  return {
    feast: toFeastRefDto(candidate.feastRef),
    rank: toRankDto(candidate.rank),
    source: candidate.source,
    ...(candidate.kind ? { kind: candidate.kind } : {}),
    ...(candidate.octaveDay ? { octaveDay: candidate.octaveDay } : {}),
    ...(candidate.transferredFrom ? { transferredFrom: candidate.transferredFrom } : {})
  };
}

function toFeastRefDto(feast: FeastReference): FeastRefDto {
  return {
    id: feast.id,
    path: feast.path,
    title: feast.title
  };
}

function toRankDto(rank: ResolvedRank): RankDto {
  return {
    name: rank.name,
    classSymbol: rank.classSymbol,
    weight: rank.weight
  };
}

function hasErrorWarnings(
  rubrical: readonly RubricalWarning[],
  composition: readonly ComposeWarning[]
): boolean {
  return (
    rubrical.some((warning) => warning.severity === 'error') ||
    composition.some((warning) => warning.severity === 'error')
  );
}
