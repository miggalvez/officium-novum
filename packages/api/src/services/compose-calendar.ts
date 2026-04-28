import type { DayOfficeSummary } from '@officium-novum/rubrical-engine';

import type { ApiContext } from '../context.js';
import {
  buildCanonicalCalendarKey,
  canonicalCalendarPath,
  type CanonicalCalendarKey
} from './cache.js';
import {
  toCalendarMonthResponse,
  type CalendarMonthResponse
} from './dto.js';
import { invalidQueryValue } from './errors.js';
import {
  assertVersionServable,
  resolveApiVersion,
  type ApiVersionEntry
} from './version-registry.js';

export interface CalendarQuery {
  readonly version?: string;
  readonly rubrics?: string;
}

export interface ResolvedCalendarMonthRequest {
  readonly yearText: string;
  readonly year: number;
  readonly month: number;
  readonly versionEntry: ApiVersionEntry & {
    readonly descriptor: NonNullable<ApiVersionEntry['descriptor']>;
    readonly engine: NonNullable<ApiVersionEntry['engine']>;
  };
  readonly cacheKey: CanonicalCalendarKey;
}

export function composeCalendarMonth(input: {
  readonly context: ApiContext;
  readonly yearParam: string;
  readonly monthParam: string;
  readonly query: CalendarQuery;
  readonly resolved?: ResolvedCalendarMonthRequest;
}): CalendarMonthResponse {
  const resolved = input.resolved ?? resolveCalendarMonthRequest(input);
  const summaries: DayOfficeSummary[] = [];
  for (const date of datesInMonth(resolved.yearText, resolved.month)) {
    summaries.push(resolved.versionEntry.engine.resolveDayOfficeSummary(date));
  }

  return toCalendarMonthResponse({
    yearText: resolved.yearText,
    year: resolved.year,
    month: resolved.month,
    version: resolved.versionEntry.descriptor,
    summaries,
    contentVersion: input.context.contentVersion,
    canonicalPath: canonicalCalendarPath(resolved.cacheKey)
  });
}

export function resolveCalendarMonthRequest(input: {
  readonly context: ApiContext;
  readonly yearParam: string;
  readonly monthParam: string;
  readonly query: CalendarQuery;
}): ResolvedCalendarMonthRequest {
  const year = parseCalendarYear(input.yearParam);
  const yearText = input.yearParam;
  const month = parseCalendarMonth(input.monthParam);
  const versionEntry = resolveApiVersion({
    version: input.query.version,
    rubrics: input.query.rubrics,
    versions: input.context.versions
  });
  assertVersionServable(versionEntry);

  const cacheKey = buildCanonicalCalendarKey({
    year: yearText,
    month,
    version: versionEntry.descriptor.handle,
    contentVersion: input.context.contentVersion
  });

  return {
    yearText,
    year,
    month,
    versionEntry,
    cacheKey
  };
}

function parseCalendarYear(value: string): number {
  if (!/^\d{4}$/u.test(value)) {
    throw invalidQueryValue('year', 'Expected a four-digit year.');
  }
  return Number(value);
}

function parseCalendarMonth(value: string): number {
  if (!/^\d{1,2}$/u.test(value)) {
    throw invalidQueryValue('month', 'Expected a month number from 1 to 12.');
  }
  const month = Number(value);
  if (month < 1 || month > 12) {
    throw invalidQueryValue('month', 'Expected a month number from 1 to 12.');
  }
  return month;
}

function datesInMonth(year: string, month: number): readonly string[] {
  const days = daysInCalendarMonth(Number(year), month);
  const monthText = padMonth(month);
  return Array.from({ length: days }, (_, index) =>
    `${year}-${monthText}-${String(index + 1).padStart(2, '0')}`
  );
}

function daysInCalendarMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function padMonth(month: number): string {
  return String(month).padStart(2, '0');
}
