import {
  dayOfWeek,
  formatIsoDate,
  normalizeDateInput,
  type CalendarDate
} from '../internal/date.js';
import { canonicalContentDir, resolveOfficeDefinition } from '../internal/content.js';
import { normalizeRank } from '../sanctoral/rank-normalizer.js';
import type {
  DateInput,
  OfficeTextIndex,
  TemporalContext,
  TemporalSubstitutionTable
} from '../types/model.js';
import type { ResolvedVersion, VersionRegistry } from '../types/version.js';

import { dayNameForDate, weekStemForDate } from './day-name.js';
import { liturgicalSeasonForDate } from './season.js';

export function buildTemporalContext(
  input: DateInput | CalendarDate,
  version: ResolvedVersion,
  corpus: OfficeTextIndex,
  options: {
    readonly registry?: VersionRegistry;
    readonly temporalSubstitutions?: TemporalSubstitutionTable;
  } = {}
): TemporalContext {
  const date = normalizeDateInput(input);
  const weekday = dayOfWeek(date);
  const weekStem = weekStemForDate(date);
  const dayName = dayNameForDate(date);
  const season = liturgicalSeasonForDate(date);
  const naturalPath = `${canonicalContentDir('Tempora', version)}/${dayName}`;
  const substitutedPath = resolveTemporalSubstitution(
    naturalPath,
    version,
    options.temporalSubstitutions
  );
  const canonicalPath = resolveComputedTemporalProperPath(
    substitutedPath,
    date,
    weekday,
    version
  );
  const definition = resolveOfficeDefinition(corpus, canonicalPath, {
    date,
    dayOfWeek: weekday,
    season,
    version
  });

  return {
    date: formatIsoDate(date),
    dayOfWeek: weekday,
    weekStem,
    dayName,
    season,
    feastRef: definition.feastRef,
    rank: normalizeRank(definition.rawRank, version.policy, {
      date: formatIsoDate(date),
      feastPath: definition.feastRef.path,
      source: 'temporal',
      version: version.handle,
      season
    })
  };
}

function resolveTemporalSubstitution(
  naturalPath: string,
  version: ResolvedVersion,
  temporalSubstitutions: TemporalSubstitutionTable | undefined
): string {
  if (!temporalSubstitutions) {
    return naturalPath;
  }

  const entry = temporalSubstitutions.get(version.transfer)?.get(naturalPath);
  if (!entry || entry.target === 'XXXXX' || entry.target.endsWith('r')) {
    return naturalPath;
  }

  return entry.target;
}

function resolveComputedTemporalProperPath(
  path: string,
  date: CalendarDate,
  weekday: number,
  version: ResolvedVersion
): string {
  if (version.policy.name !== 'rubrics-1960' || !isSeptemberEmberDay(date)) {
    return path;
  }

  const temporalDir = `${canonicalContentDir('Tempora', version)}/`;
  const temporalKey = path.startsWith(temporalDir) ? path.slice(temporalDir.length) : path;
  if (!/^Pent\d{2}-[356]$/u.test(temporalKey)) {
    return path;
  }

  return `${temporalDir}093-${weekday}`;
}

function isSeptemberEmberDay(date: CalendarDate): boolean {
  if (date.month !== 9) {
    return false;
  }

  const thirdSunday = thirdSundayOfSeptember(date.year);
  return (
    date.day === thirdSunday + 3 ||
    date.day === thirdSunday + 5 ||
    date.day === thirdSunday + 6
  );
}

function thirdSundayOfSeptember(year: number): number {
  for (let day = 15; day <= 21; day += 1) {
    if (dayOfWeek({ year, month: 9, day }) === 0) {
      return day;
    }
  }

  throw new Error(`Unable to determine the third Sunday of September for year ${year}.`);
}
