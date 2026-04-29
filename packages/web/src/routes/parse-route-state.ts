import {
  ALL_HOURS,
  type HourName,
  type PublicLanguageTag,
  type TextOrthographyProfile
} from '../api/types';
import {
  DEFAULT_LANGUAGES,
  DEFAULT_ORTHOGRAPHY,
  DEFAULT_VERSION,
  type CommonState,
  type Route
} from './paths';

const HOUR_SET = new Set<HourName>(ALL_HOURS);
const LANG_SET = new Set<PublicLanguageTag>(['la', 'en']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParseInput {
  readonly pathname: string;
  readonly search: string;
}

export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseRoute(input: ParseInput): Route {
  const params = new URLSearchParams(input.search ?? '');
  const segments = stripTrailingSlash(input.pathname).split('/').filter(Boolean);

  if (segments.length === 0) {
    return { name: 'home' };
  }

  const head = segments[0];

  if (head === 'office' && segments.length === 3) {
    const [, dateRaw, hourRaw] = segments;
    if (dateRaw && hourRaw && DATE_RE.test(dateRaw) && HOUR_SET.has(hourRaw as HourName)) {
      return {
        name: 'office',
        date: dateRaw,
        hour: hourRaw as HourName,
        ...parseCommonState(params)
      };
    }
    return { name: 'unknown' };
  }

  if (head === 'day' && segments.length === 2) {
    const dateRaw = segments[1];
    if (dateRaw && DATE_RE.test(dateRaw)) {
      return {
        name: 'day',
        date: dateRaw,
        ...parseCommonState(params)
      };
    }
    return { name: 'unknown' };
  }

  if (head === 'calendar' && segments.length === 3) {
    const [, yearRaw, monthRaw] = segments;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (
      Number.isInteger(year) &&
      year >= 1900 &&
      year <= 2200 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    ) {
      return {
        name: 'calendar',
        year,
        month,
        version: parseVersion(params)
      };
    }
    return { name: 'unknown' };
  }

  if (head === 'settings' && segments.length === 1) {
    return { name: 'settings' };
  }
  if (head === 'status' && segments.length === 1) {
    return { name: 'status' };
  }
  if (head === 'about' && segments.length === 1) {
    return { name: 'about' };
  }
  if (head === 'api' && segments.length === 1) {
    return { name: 'api' };
  }

  return { name: 'unknown' };
}

export function parseCommonState(params: URLSearchParams): CommonState {
  return {
    version: parseVersion(params),
    languages: parseLanguages(params),
    ...parseLangFallback(params),
    orthography: parseOrthography(params),
    strict: parseBool(params.get('strict'), true),
    displayMode: parseDisplayMode(params),
    fontSize: parseFontSize(params)
  };
}

function parseLangFallback(
  params: URLSearchParams
): { langfb?: PublicLanguageTag } {
  const raw = params.get('langfb');
  if (raw && LANG_SET.has(raw as PublicLanguageTag)) {
    return { langfb: raw as PublicLanguageTag };
  }
  return {};
}

function parseVersion(params: URLSearchParams): string {
  const explicit = params.get('version');
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const rubrics = params.get('rubrics');
  if (rubrics && rubrics.trim().length > 0) {
    return normalizeRubricsAlias(rubrics);
  }
  return DEFAULT_VERSION;
}

export function normalizeRubricsAlias(value: string): string {
  switch (value.trim()) {
    case '1960':
      return 'Rubrics 1960 - 1960';
    case '1955':
      return 'Reduced - 1955';
    case 'da':
    case 'divino-afflatu':
    case '1911':
      return 'Divino Afflatu - 1911';
    default:
      return value;
  }
}

function parseLanguages(params: URLSearchParams): readonly PublicLanguageTag[] {
  const raw = params.get('lang');
  if (!raw) {
    return DEFAULT_LANGUAGES;
  }
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is PublicLanguageTag => LANG_SET.has(part as PublicLanguageTag));
  return parts.length > 0 ? parts : DEFAULT_LANGUAGES;
}

function parseOrthography(params: URLSearchParams): TextOrthographyProfile {
  const raw = params.get('orthography');
  return raw === 'source' ? 'source' : DEFAULT_ORTHOGRAPHY;
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === null) {
    return fallback;
  }
  if (raw === 'true' || raw === '1') {
    return true;
  }
  if (raw === 'false' || raw === '0') {
    return false;
  }
  return fallback;
}

function parseDisplayMode(params: URLSearchParams): 'parallel' | 'sequential' {
  return params.get('mode') === 'sequential' ? 'sequential' : 'parallel';
}

function parseFontSize(params: URLSearchParams): 'normal' | 'large' | 'larger' {
  const raw = params.get('fontSize');
  if (raw === 'large' || raw === 'larger') {
    return raw;
  }
  return 'normal';
}

function stripTrailingSlash(value: string): string {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }
  return value;
}
