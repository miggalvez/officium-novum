import { getEnvironment } from '../app/env';
import type {
  ApiErrorBody,
  CalendarMonthResponse,
  LanguagesResponse,
  OfficeDayResponse,
  OfficeHourResponse,
  StatusResponse,
  VersionsResponse
} from './types';
import {
  buildCalendarMonthUrl,
  buildOfficeDayUrl,
  buildOfficeHourUrl,
  joinUrl,
  languagesUrl,
  statusUrl,
  versionsUrl,
  type CalendarMonthRequest,
  type OfficeDayRequest,
  type OfficeHourRequest
} from './url';

export class ApiError extends Error {
  readonly status: number;
  readonly body?: ApiErrorBody;
  readonly url: string;

  constructor(input: { status: number; url: string; message: string; body?: ApiErrorBody }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.body = input.body;
    this.url = input.url;
  }
}

export class NetworkError extends Error {
  readonly url: string;
  readonly cause: unknown;

  constructor(url: string, cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.url = url;
    this.cause = cause;
  }
}

export interface FetchOptions {
  readonly signal?: AbortSignal;
  readonly base?: string;
  readonly fetchImpl?: typeof fetch;
}

async function getJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch (cause) {
    throw new NetworkError(url, cause);
  }

  if (!response.ok) {
    const body = await safeJson<ApiErrorBody>(response);
    throw new ApiError({
      status: response.status,
      url,
      message: body?.message ?? `HTTP ${response.status}`,
      ...(body ? { body } : {})
    });
  }

  return (await response.json()) as T;
}

async function safeJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function defaultBase(options?: FetchOptions): string {
  return options?.base ?? getEnvironment().apiBaseUrl;
}

export function getStatus(options?: FetchOptions): Promise<StatusResponse> {
  return getJson<StatusResponse>(statusUrl(defaultBase(options)), options ?? {});
}

export function getVersions(options?: FetchOptions): Promise<VersionsResponse> {
  return getJson<VersionsResponse>(versionsUrl(defaultBase(options)), options ?? {});
}

export function getLanguages(options?: FetchOptions): Promise<LanguagesResponse> {
  return getJson<LanguagesResponse>(languagesUrl(defaultBase(options)), options ?? {});
}

export function getOfficeHour(
  request: OfficeHourRequest,
  options?: FetchOptions
): Promise<OfficeHourResponse> {
  return getJson<OfficeHourResponse>(
    buildOfficeHourUrl(defaultBase(options), request),
    options ?? {}
  );
}

export function getOfficeDay(
  request: OfficeDayRequest,
  options?: FetchOptions
): Promise<OfficeDayResponse> {
  return getJson<OfficeDayResponse>(
    buildOfficeDayUrl(defaultBase(options), request),
    options ?? {}
  );
}

export function getCalendarMonth(
  request: CalendarMonthRequest,
  options?: FetchOptions
): Promise<CalendarMonthResponse> {
  return getJson<CalendarMonthResponse>(
    buildCalendarMonthUrl(defaultBase(options), request),
    options ?? {}
  );
}

export function rawJsonUrlForOffice(request: OfficeHourRequest, base?: string): string {
  return buildOfficeHourUrl(base ?? defaultBase(), request);
}

export function rawJsonUrlForDay(request: OfficeDayRequest, base?: string): string {
  return buildOfficeDayUrl(base ?? defaultBase(), request);
}

export function rawJsonUrlForCalendar(request: CalendarMonthRequest, base?: string): string {
  return buildCalendarMonthUrl(base ?? defaultBase(), request);
}

export function apiDocsUrl(base?: string): string {
  return joinUrl(base ?? defaultBase(), '/api/v1/docs');
}

export function openApiUrl(base?: string): string {
  return joinUrl(base ?? defaultBase(), '/api/v1/openapi.json');
}
