export type PublicLanguageTag = 'la' | 'en';
export type TextOrthographyProfile = 'source' | 'version';

export type HourName =
  | 'matins'
  | 'lauds'
  | 'prime'
  | 'terce'
  | 'sext'
  | 'none'
  | 'vespers'
  | 'compline';

export const ALL_HOURS: readonly HourName[] = [
  'matins',
  'lauds',
  'prime',
  'terce',
  'sext',
  'none',
  'vespers',
  'compline'
];

export type VersionStatus = 'supported' | 'deferred' | 'missa-only';

export type ConnectivityStatus = 'ok' | 'degraded';

export interface VersionDescriptor {
  readonly handle: string;
  readonly status?: VersionStatus;
  readonly policyName?: string;
  readonly aliases?: readonly string[];
  readonly hint?: string;
}

export interface VersionInfo {
  readonly handle: string;
  readonly status: VersionStatus;
  readonly policyName?: string;
  readonly kalendar?: string;
  readonly transfer?: string;
  readonly stransfer?: string;
  readonly base?: string;
  readonly transferBase?: string;
  readonly aliases: readonly string[];
  readonly hint?: string;
}

export interface LanguageInfo {
  readonly tag: PublicLanguageTag;
  readonly corpusName: string;
  readonly label: string;
  readonly defaultFallback?: PublicLanguageTag;
}

export interface StatusResponse {
  readonly kind: 'status';
  readonly apiVersion: 'v1';
  readonly status: ConnectivityStatus;
  readonly content: {
    readonly contentVersion: string;
    readonly upstreamSha?: string;
    readonly corpusFileCount?: number;
  };
  readonly support: {
    readonly supportedHours: readonly string[];
    readonly supportedVersionCount: number;
    readonly deferredVersionCount: number;
    readonly missaOnlyVersionCount: number;
  };
}

export interface VersionsResponse {
  readonly kind: 'versions';
  readonly apiVersion: 'v1';
  readonly defaultVersion: string;
  readonly versions: readonly VersionInfo[];
}

export interface LanguagesResponse {
  readonly kind: 'languages';
  readonly apiVersion: 'v1';
  readonly languages: readonly LanguageInfo[];
}

export type ApiWarningSeverity = 'info' | 'warning' | 'error';

export interface ApiWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: ApiWarningSeverity;
  readonly [extra: string]: unknown;
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
  readonly octaveDay?: number;
  readonly transferredFrom?: string;
}

export interface CommemorationDto {
  readonly feast: FeastRefDto;
  readonly rank: RankDto;
  readonly reason: string;
  readonly hours: readonly HourName[];
  readonly kind?: 'vigil' | 'octave';
  readonly octaveDay?: number;
  readonly color?: string;
}

export interface DaySummaryDto {
  readonly date: string;
  readonly version: VersionDescriptor;
  readonly temporal: {
    readonly date: string;
    readonly dayOfWeek: number;
    readonly dayName: string;
    readonly weekStem: string;
    readonly season: string;
    readonly feast: FeastRefDto;
    readonly rank: RankDto;
  };
  readonly celebration: CelebrationDto;
  readonly commemorations: readonly CommemorationDto[];
  readonly concurrence: {
    readonly winner: 'today' | 'tomorrow';
  };
  readonly candidates: readonly unknown[];
  readonly warnings: readonly ApiWarning[];
}

export type ComposedRunDto =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'rubric'; readonly value: string }
  | { readonly type: 'citation'; readonly value: string }
  | { readonly type: 'unresolved-macro'; readonly name: string }
  | { readonly type: 'unresolved-formula'; readonly name: string }
  | { readonly type: 'unresolved-reference'; readonly ref: unknown };

export interface PublicComposedLineDto {
  readonly marker?: string;
  readonly texts: Partial<Record<PublicLanguageTag, readonly ComposedRunDto[]>>;
}

export interface PublicSectionDto {
  readonly type: string;
  readonly slot: string;
  readonly reference?: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly heading?: {
    readonly kind: 'nocturn' | 'lesson';
    readonly ordinal: number;
  };
  readonly lines: readonly PublicComposedLineDto[];
}

export interface PublicComposedHourDto {
  readonly date: string;
  readonly hour: HourName;
  readonly celebration: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly orthography: TextOrthographyProfile;
  readonly sections: readonly PublicSectionDto[];
  readonly warnings: readonly ApiWarning[];
}

export interface ResponseMeta {
  readonly contentVersion: string;
  readonly canonicalPath: string;
  readonly quality?: 'complete' | 'partial';
}

export interface OfficeHourResponse {
  readonly kind: 'office-hour';
  readonly apiVersion: 'v1';
  readonly request: {
    readonly date: string;
    readonly hour: HourName;
    readonly version: string;
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
    readonly rubrical: readonly ApiWarning[];
    readonly composition: readonly ApiWarning[];
  };
  readonly meta: ResponseMeta;
}

export interface OfficeDayResponse {
  readonly kind: 'office-day';
  readonly apiVersion: 'v1';
  readonly request: {
    readonly date: string;
    readonly version: string;
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
    readonly rubrical: readonly ApiWarning[];
    readonly composition: Partial<Record<HourName, readonly ApiWarning[]>>;
  };
  readonly meta: ResponseMeta;
}

export interface CalendarDayDto {
  readonly date: string;
  readonly dayOfWeek: number;
  readonly season: string;
  readonly celebration: CelebrationDto;
  readonly commemorations: readonly CommemorationDto[];
  readonly warnings: readonly ApiWarning[];
}

export interface CalendarMonthResponse {
  readonly kind: 'calendar-month';
  readonly apiVersion: 'v1';
  readonly request: {
    readonly year: string;
    readonly version: string;
  };
  readonly year: number;
  readonly month: number;
  readonly version: VersionDescriptor;
  readonly days: readonly CalendarDayDto[];
  readonly meta: ResponseMeta;
}

export interface ApiErrorBody {
  readonly kind: 'error';
  readonly apiVersion: 'v1';
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly hints?: readonly string[];
}
