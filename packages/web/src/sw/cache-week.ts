import { buildOfficeHourUrl } from '../api/url';
import type { HourName, PublicLanguageTag, TextOrthographyProfile } from '../api/types';
import { getEnvironment } from '../app/env';

export interface CacheWeekInput {
  readonly start: string;
  readonly version: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly orthography: TextOrthographyProfile;
  readonly hours?: readonly HourName[];
}

const DEFAULT_HOURS: readonly HourName[] = ['lauds', 'vespers', 'compline'];

export async function cacheWeek(input: CacheWeekInput): Promise<{ urls: readonly string[] }> {
  const env = getEnvironment();
  const hours = input.hours ?? DEFAULT_HOURS;
  const urls: string[] = [];
  for (let day = 0; day < 7; day += 1) {
    const date = addDays(input.start, day);
    for (const hour of hours) {
      urls.push(
        buildOfficeHourUrl(env.apiBaseUrl, {
          date,
          hour,
          version: input.version,
          languages: input.languages,
          orthography: input.orthography
        })
      );
    }
  }

  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'cache-week', urls });
  } else if (typeof caches !== 'undefined') {
    // Fallback: prefetch in main thread; browser HTTP cache + ETag will still help.
    await Promise.all(
      urls.map((url) => fetch(url).catch(() => undefined))
    );
  }
  return { urls };
}

function addDays(start: string, days: number): string {
  const [yearRaw, monthRaw, dayRaw] = start.split('-');
  const date = new Date(
    Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw) + days)
  );
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
