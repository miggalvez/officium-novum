import type { TemporalContext } from '../types/model.js';

export function seasonalFallbackDoxologyVariant(
  temporal: TemporalContext
): string | undefined {
  const dayName = temporal.dayName;

  if (/^Nat/iu.test(dayName)) {
    const dayOfMonth = Number.parseInt(temporal.date.slice(-2), 10);
    return dayOfMonth >= 6 && dayOfMonth < 13 ? 'Epi' : 'Nat';
  }

  if (/^Epi[01]/iu.test(dayName)) {
    const dayOfMonth = Number.parseInt(temporal.date.slice(-2), 10);
    if (dayOfMonth < 14) {
      return 'Epi';
    }
  }

  if (
    /^Pasc6/iu.test(dayName) ||
    (/^Pasc5/iu.test(dayName) && temporal.dayOfWeek > 3)
  ) {
    return 'Asc';
  }

  if (/^Pasc[0-5]/iu.test(dayName)) {
    return 'Pasch';
  }

  if (/^Pasc7/iu.test(dayName)) {
    return 'Pent';
  }

  return undefined;
}
