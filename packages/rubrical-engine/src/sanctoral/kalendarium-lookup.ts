import { canonicalContentDir, resolveOfficeDefinition } from '../internal/content.js';
import { dayOfWeek, formatIsoDate, normalizeDateInput, sanctoralDateKey } from '../internal/date.js';
import { liturgicalSeasonForDate } from '../temporal/season.js';
import { normalizeRank } from './rank-normalizer.js';
import type {
  DateInput,
  KalendariumTable,
  OfficeTextIndex,
  SanctoralCandidate
} from '../types/model.js';
import type {
  ResolvedVersion,
  VersionRegistry,
  VersionRegistryRow
} from '../types/version.js';

export function sanctoralCandidates(
  input: DateInput,
  version: ResolvedVersion,
  registry: VersionRegistry,
  kalendarium: KalendariumTable,
  corpus: OfficeTextIndex
): readonly SanctoralCandidate[] {
  const date = normalizeDateInput(input);
  const key = sanctoralDateKey(date);
  const season = liturgicalSeasonForDate(date);
  const weekday = dayOfWeek(date);
  const isoDate = formatIsoDate(date);
  const entries = lookupEntriesForDate(key, version, registry, kalendarium);
  const contentDir = canonicalContentDir('Sancti', version);

  return entries
    .filter((entry) => !entry.suppressed)
    .flatMap((entry) => {
      const refs = [entry.fileRef, ...(entry.alternates ?? [])];

      return refs.map<SanctoralCandidate>((ref) => {
        const canonicalPath = `${contentDir}/${ref}`;
        const definition = resolveOfficeDefinition(corpus, canonicalPath, {
          date,
          dayOfWeek: weekday,
          season,
          version
        });

        return {
          dateKey: key,
          feastRef: definition.feastRef,
          rank: normalizeRank(definition.rawRank, version.policy, {
            date: isoDate,
            feastPath: definition.feastRef.path,
            source: 'sanctoral',
            version: version.handle,
            season
          })
        };
      });
    });
}

function lookupEntriesForDate(
  dateKey: string,
  version: ResolvedVersion,
  registry: VersionRegistry,
  kalendarium: KalendariumTable
) {
  let current: Pick<ResolvedVersion, 'kalendar' | 'base'> | VersionRegistryRow | undefined = version;

  while (current) {
    const table = kalendarium.get(current.kalendar);
    const entries = table?.get(dateKey);
    if (entries) {
      return entries;
    }

    if (!current.base) {
      return [];
    }

    const baseHandle = current.base;
    current = registry.get(baseHandle);
    if (!current) {
      throw new Error(`Unknown base version in registry: ${baseHandle}`);
    }
  }

  return [];
}
