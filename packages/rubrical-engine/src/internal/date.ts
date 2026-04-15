import type { DateInput } from '../types/model.js';

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const MONTH_OFFSETS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

export function normalizeDateInput(input: DateInput | CalendarDate): CalendarDate {
  if (isCalendarDate(input)) {
    return input;
  }

  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input.trim());
    if (!match) {
      throw new Error(`Invalid date string: ${input}`);
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    assertValidCalendarDate({ year, month, day }, input);
    return { year, month, day };
  }

  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    throw new Error('Invalid Date input.');
  }

  return {
    year: input.getUTCFullYear(),
    month: input.getUTCMonth() + 1,
    day: input.getUTCDate()
  };
}

export function formatIsoDate(date: CalendarDate): string {
  return `${date.year.toString().padStart(4, '0')}-${pad2(date.month)}-${pad2(date.day)}`;
}

export function monthDayKey(date: CalendarDate): string {
  return `${pad2(date.month)}-${pad2(date.day)}`;
}

export function sanctoralDateKey(date: CalendarDate): string {
  if (!isLeapYear(date.year) || date.month !== 2) {
    return monthDayKey(date);
  }

  if (date.day === 24) {
    return '02-29';
  }

  if (date.day > 24) {
    return `02-${pad2(date.day - 1)}`;
  }

  return monthDayKey(date);
}

export function isLeapYear(year: number): boolean {
  return !((year % 4) !== 0 || ((year % 100) === 0 && (year % 400) !== 0));
}

export function dateToYearDay(date: CalendarDate): number {
  return (
    MONTH_OFFSETS[date.month - 1]! +
    date.day +
    (date.month > 2 && isLeapYear(date.year) ? 1 : 0)
  );
}

export function dayOfWeek(date: CalendarDate): number {
  return (
    date.year * 365 +
    Math.floor((date.year - 1) / 4) -
    Math.floor((date.year - 1) / 100) +
    Math.floor((date.year - 1) / 400) -
    1 +
    dateToYearDay(date)
  ) % 7;
}

export function addDays(date: CalendarDate, offset: number): CalendarDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + offset));
  return normalizeDateInput(utc);
}

function assertValidCalendarDate(date: CalendarDate, raw: string): void {
  if (date.month < 1 || date.month > 12) {
    throw new Error(`Invalid date string: ${raw}`);
  }

  const maxDay = daysInMonth(date.year, date.month);
  if (date.day < 1 || date.day > maxDay) {
    throw new Error(`Invalid date string: ${raw}`);
  }
}

function isCalendarDate(input: DateInput | CalendarDate): input is CalendarDate {
  return (
    typeof input === 'object' &&
    input !== null &&
    !(input instanceof Date) &&
    'year' in input &&
    'month' in input &&
    'day' in input
  );
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}
