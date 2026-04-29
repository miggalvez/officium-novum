import type { HourName, PublicLanguageTag, TextOrthographyProfile } from './types';

export interface OfficeHourRequest {
  readonly date: string;
  readonly hour: HourName;
  readonly version: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography?: TextOrthographyProfile;
  readonly joinLaudsToMatins?: boolean;
  readonly strict?: boolean;
}

export interface OfficeDayRequest {
  readonly date: string;
  readonly version: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography?: TextOrthographyProfile;
  readonly hours?: readonly HourName[] | 'all';
  readonly strict?: boolean;
}

export interface CalendarMonthRequest {
  readonly year: number;
  readonly month: number;
  readonly version: string;
}

export function joinUrl(base: string, path: string): string {
  if (!base) {
    return path;
  }
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

export function buildOfficeHourPath(request: OfficeHourRequest): string {
  const params = new URLSearchParams();
  params.set('version', request.version);
  params.set('lang', request.languages.join(','));
  if (request.langfb) {
    params.set('langfb', request.langfb);
  }
  params.set('orthography', request.orthography ?? 'version');
  if (request.joinLaudsToMatins !== undefined) {
    params.set('joinLaudsToMatins', String(request.joinLaudsToMatins));
  }
  params.set('strict', String(request.strict ?? true));
  return `/api/v1/office/${request.date}/${request.hour}?${params.toString()}`;
}

export function buildOfficeDayPath(request: OfficeDayRequest): string {
  const params = new URLSearchParams();
  params.set('version', request.version);
  params.set('lang', request.languages.join(','));
  if (request.langfb) {
    params.set('langfb', request.langfb);
  }
  params.set('orthography', request.orthography ?? 'version');
  const hoursValue = request.hours;
  if (hoursValue === 'all') {
    params.set('hours', 'all');
  } else if (hoursValue && hoursValue.length > 0) {
    params.set('hours', hoursValue.join(','));
  }
  params.set('strict', String(request.strict ?? true));
  return `/api/v1/days/${request.date}?${params.toString()}`;
}

export function buildCalendarMonthPath(request: CalendarMonthRequest): string {
  const params = new URLSearchParams();
  params.set('version', request.version);
  return `/api/v1/calendar/${request.year}/${padMonth(request.month)}?${params.toString()}`;
}

export function buildOfficeHourUrl(base: string, request: OfficeHourRequest): string {
  return joinUrl(base, buildOfficeHourPath(request));
}

export function buildOfficeDayUrl(base: string, request: OfficeDayRequest): string {
  return joinUrl(base, buildOfficeDayPath(request));
}

export function buildCalendarMonthUrl(base: string, request: CalendarMonthRequest): string {
  return joinUrl(base, buildCalendarMonthPath(request));
}

export function statusUrl(base: string): string {
  return joinUrl(base, '/api/v1/status');
}

export function versionsUrl(base: string): string {
  return joinUrl(base, '/api/v1/versions');
}

export function languagesUrl(base: string): string {
  return joinUrl(base, '/api/v1/languages');
}

export function padMonth(month: number): string {
  return String(month).padStart(2, '0');
}
