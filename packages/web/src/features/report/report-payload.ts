import type { DemoEnvironment } from '../../app/env';
import type {
  ApiWarning,
  HourName,
  PublicLanguageTag,
  TextOrthographyProfile
} from '../../api/types';

export const REPORT_SCHEMA_VERSION = 1;

export type ReportResponseKind =
  | 'office-hour'
  | 'office-day'
  | 'calendar-month'
  | 'error'
  | 'unknown';

export type ReportQuality = 'complete' | 'partial' | 'unknown';

export type ReportScope =
  | 'feast'
  | 'commemoration'
  | 'psalter'
  | 'lesson'
  | 'antiphon'
  | 'hymn'
  | 'versicle'
  | 'oration'
  | 'rubric'
  | 'translation'
  | 'rendering'
  | 'api'
  | 'other';

export type ReportSourceType =
  | 'ordo'
  | 'rubrical-book'
  | 'breviary'
  | 'corpus'
  | 'adr'
  | 'consultation'
  | 'none';

export type ReportAttribution = 'anonymous' | 'name-ok';

export interface ReportContextInput {
  readonly env: DemoEnvironment;
  readonly route: string;
  readonly request: {
    readonly date?: string;
    readonly hour?: HourName;
    readonly version: string;
    readonly languages: readonly PublicLanguageTag[];
    readonly langfb?: PublicLanguageTag;
    readonly orthography: TextOrthographyProfile;
    readonly strict: boolean;
    readonly apiUrl: string;
  };
  readonly response: {
    readonly kind: ReportResponseKind;
    readonly contentVersion?: string;
    readonly upstreamSha?: string;
    readonly canonicalPath?: string;
    readonly warnings?: readonly ApiWarning[];
    readonly quality?: ReportQuality;
  };
}

export interface ReportDisagreementInput {
  readonly scope: ReportScope;
  readonly expected: string;
  readonly actual: string;
  readonly selectedText?: string;
}

export interface ReportCitationInput {
  readonly sourceType: ReportSourceType;
  readonly sourceId?: string;
  readonly reference?: string;
  readonly excerpt?: string;
}

export interface ReportReviewerInput {
  readonly publicAttribution: ReportAttribution;
  readonly name?: string;
  readonly contact?: string;
  readonly affiliation?: string;
  readonly qualification?: string;
}

export interface ReportPayloadInput {
  readonly context: ReportContextInput;
  readonly disagreement: ReportDisagreementInput;
  readonly citation: ReportCitationInput;
  readonly reviewer: ReportReviewerInput;
  readonly notes?: string;
  readonly now?: Date;
}

export interface ReportPayload {
  readonly reportSchemaVersion: number;
  readonly generatedAt: string;
  readonly frontend: {
    readonly buildSha: string;
    readonly buildDate: string;
    readonly publicBaseUrl: string;
    readonly route: string;
    readonly env: string;
  };
  readonly api: {
    readonly baseUrl: string;
    readonly apiVersion: 'v1';
    readonly contentVersion?: string;
    readonly upstreamSha?: string;
    readonly canonicalPath?: string;
  };
  readonly request: {
    readonly date?: string;
    readonly hour?: HourName;
    readonly version: string;
    readonly languages: readonly PublicLanguageTag[];
    readonly langfb?: PublicLanguageTag;
    readonly orthography: TextOrthographyProfile;
    readonly strict: boolean;
    readonly apiUrl: string;
  };
  readonly response: {
    readonly kind: ReportResponseKind;
    readonly warningCodes: readonly string[];
    readonly quality: ReportQuality;
  };
  readonly disagreement: ReportDisagreementInput;
  readonly citation: ReportCitationInput;
  readonly reviewer: ReportReviewerInput;
  readonly notes?: string;
}

export interface ReportValidationIssue {
  readonly field: string;
  readonly message: string;
}

export function validateReport(input: ReportPayloadInput): readonly ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!input.disagreement.expected.trim()) {
    issues.push({ field: 'disagreement.expected', message: 'Expected behavior is required.' });
  }
  if (!input.disagreement.actual.trim()) {
    issues.push({ field: 'disagreement.actual', message: 'Actual behavior is required.' });
  }
  if (!input.context.request.version) {
    issues.push({ field: 'context.request.version', message: 'Version is required.' });
  }
  if (!input.context.request.apiUrl) {
    issues.push({ field: 'context.request.apiUrl', message: 'API URL is required.' });
  }
  if (
    input.reviewer.publicAttribution === 'name-ok' &&
    !input.reviewer.name?.trim()
  ) {
    issues.push({
      field: 'reviewer.name',
      message: 'Name is required when public attribution is enabled.'
    });
  }
  return issues;
}

export function buildReportPayload(input: ReportPayloadInput): ReportPayload {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const warningCodes = (input.context.response.warnings ?? []).map((w) => w.code);

  return {
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    frontend: {
      buildSha: input.context.env.buildSha,
      buildDate: input.context.env.buildDate,
      publicBaseUrl: input.context.env.publicBaseUrl,
      route: input.context.route,
      env: input.context.env.env
    },
    api: {
      baseUrl: input.context.env.apiBaseUrl,
      apiVersion: 'v1',
      ...optional('contentVersion', input.context.response.contentVersion),
      ...optional('upstreamSha', input.context.response.upstreamSha),
      ...optional('canonicalPath', input.context.response.canonicalPath)
    },
    request: {
      ...optional('date', input.context.request.date),
      ...optional('hour', input.context.request.hour),
      version: input.context.request.version,
      languages: input.context.request.languages,
      ...optional('langfb', input.context.request.langfb),
      orthography: input.context.request.orthography,
      strict: input.context.request.strict,
      apiUrl: input.context.request.apiUrl
    },
    response: {
      kind: input.context.response.kind,
      warningCodes,
      quality: input.context.response.quality ?? 'unknown'
    },
    disagreement: input.disagreement,
    citation: input.citation,
    reviewer: redactReviewer(input.reviewer),
    ...optional('notes', input.notes)
  };
}

export function redactReviewer(reviewer: ReportReviewerInput): ReportReviewerInput {
  if (reviewer.publicAttribution === 'name-ok') {
    return {
      publicAttribution: 'name-ok',
      ...(reviewer.name ? { name: reviewer.name } : {}),
      ...(reviewer.affiliation ? { affiliation: reviewer.affiliation } : {}),
      ...(reviewer.qualification ? { qualification: reviewer.qualification } : {})
    };
  }
  // Public report payloads never carry private contact details.
  // Affiliation and qualification are kept as anonymized reviewer context.
  const out: ReportReviewerInput = { publicAttribution: 'anonymous' };
  return reviewer.affiliation || reviewer.qualification
    ? {
        ...out,
        ...(reviewer.affiliation ? { affiliation: reviewer.affiliation } : {}),
        ...(reviewer.qualification ? { qualification: reviewer.qualification } : {})
      }
    : out;
}

function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}
