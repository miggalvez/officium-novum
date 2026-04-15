import { addDays, dayOfWeek, type CalendarDate, dateToYearDay, normalizeDateInput } from '../internal/date.js';
import type { DateInput } from '../types/model.js';

import { gregorianEaster } from './easter.js';

export interface DayNameOptions {
  readonly missa?: boolean;
  readonly tomorrow?: boolean;
}

export function weekStemForDate(
  input: DateInput | CalendarDate,
  options: DayNameOptions = {}
): string {
  const date = normalizeDateInput(input);
  const target = options.tomorrow ? addDays(date, 1) : date;
  const t = dateToYearDay(target);

  const advent1 = firstSundayOfAdvent(target.year);
  const christmas = dateToYearDay({ year: target.year, month: 12, day: 25 });

  if (t >= advent1) {
    if (t < christmas) {
      const week = 1 + Math.floor((t - advent1) / 7);
      if (target.month === 11 || target.day < 25) {
        return `Adv${week}`;
      }
    }

    return `Nat${pad2(target.day)}`;
  }

  const ordTime = 6 + 7 - dayOfWeek({ year: target.year, month: 1, day: 6 });

  if (target.month === 1 && t < ordTime) {
    return `Nat${pad2(target.day)}`;
  }

  const easter = dateToYearDay(gregorianEaster(target.year));

  if (t < easter - 63) {
    const week = Math.floor((t - ordTime) / 7) + 1;
    return `Epi${week}`;
  }
  if (t < easter - 56) {
    return 'Quadp1';
  }
  if (t < easter - 49) {
    return 'Quadp2';
  }
  if (t < easter - 42) {
    return 'Quadp3';
  }

  if (t < easter) {
    const week = 1 + Math.floor((t - (easter - 42)) / 7);
    return `Quad${week}`;
  }

  if (t < easter + 56) {
    const week = Math.floor((t - easter) / 7);
    return `Pasc${week}`;
  }

  const pentWeek = Math.floor((t - (easter + 49)) / 7);
  if (pentWeek < 23) {
    return `Pent${pad2(pentWeek)}`;
  }

  const weeksBeforeAdvent = Math.floor((advent1 - t + 6) / 7);
  if (weeksBeforeAdvent < 2) {
    return 'Pent24';
  }
  if (pentWeek === 23) {
    return 'Pent23';
  }

  return `${options.missa ? 'PentEpi' : 'Epi'}${8 - weeksBeforeAdvent}`;
}

export function dayNameForDate(
  input: DateInput | CalendarDate,
  options: DayNameOptions = {}
): string {
  const date = normalizeDateInput(input);
  const target = options.tomorrow ? addDays(date, 1) : date;
  const stem = weekStemForDate(target, { missa: options.missa });

  if (/^Nat\d{2}$/u.test(stem)) {
    return stem;
  }

  return `${stem}-${dayOfWeek(target)}`;
}

function firstSundayOfAdvent(year: number): number {
  const christmasDayOfWeek = dayOfWeek({ year, month: 12, day: 25 }) || 7;
  return dateToYearDay({ year, month: 12, day: 25 }) - christmasDayOfWeek - 21;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}
