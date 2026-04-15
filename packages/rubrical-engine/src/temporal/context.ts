import { dayOfWeek, formatIsoDate, normalizeDateInput } from '../internal/date.js';
import { canonicalContentDir, resolveOfficeDefinition } from '../internal/content.js';
import { normalizeRank } from '../sanctoral/rank-normalizer.js';
import type { DateInput, OfficeTextIndex, TemporalContext } from '../types/model.js';
import type { ResolvedVersion } from '../types/version.js';

import { dayNameForDate, weekStemForDate } from './day-name.js';
import { liturgicalSeasonForDate } from './season.js';

export function buildTemporalContext(
  input: DateInput,
  version: ResolvedVersion,
  corpus: OfficeTextIndex
): TemporalContext {
  const date = normalizeDateInput(input);
  const weekday = dayOfWeek(date);
  const weekStem = weekStemForDate(date);
  const dayName = dayNameForDate(date);
  const season = liturgicalSeasonForDate(date);
  const canonicalPath = `${canonicalContentDir('Tempora', version)}/${dayName}`;
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
