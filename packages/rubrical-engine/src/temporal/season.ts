import { dayOfWeek, normalizeDateInput, dateToYearDay, type CalendarDate } from '../internal/date.js';
import type { DateInput, LiturgicalSeason } from '../types/model.js';

import { weekStemForDate } from './day-name.js';
import { gregorianEaster } from './easter.js';

export function liturgicalSeasonForDate(
  input: DateInput | CalendarDate
): LiturgicalSeason {
  const date = normalizeDateInput(input);
  const stem = weekStemForDate(date);

  if (stem.startsWith('Adv')) {
    return 'advent';
  }

  if (stem.startsWith('Nat')) {
    return 'christmastide';
  }

  if (stem.startsWith('Quadp')) {
    return 'septuagesima';
  }

  if (stem.startsWith('Quad5') || stem.startsWith('Quad6')) {
    return 'passiontide';
  }

  if (stem.startsWith('Quad')) {
    return 'lent';
  }

  if (stem.startsWith('Pasc7')) {
    return 'pentecost-octave';
  }

  if (
    stem.startsWith('Pasc6') ||
    (stem.startsWith('Pasc5') && dayOfWeek(date) >= 4)
  ) {
    return 'ascensiontide';
  }

  if (stem.startsWith('Pasc')) {
    return 'eastertide';
  }

  if (stem.startsWith('Pent')) {
    return 'time-after-pentecost';
  }

  if (stem.startsWith('Epi')) {
    const easter = dateToYearDay(gregorianEaster(date.year));
    return dateToYearDay(date) < easter - 63
      ? 'time-after-epiphany'
      : 'time-after-pentecost';
  }

  throw new Error(`Unrecognized temporal week stem: ${stem}`);
}
