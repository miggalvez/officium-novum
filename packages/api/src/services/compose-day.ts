import { composeHour } from '@officium-novum/compositor';
import type { ComposedHour } from '@officium-novum/compositor';
import type { HourName } from '@officium-novum/rubrical-engine';

import type { ApiContext } from '../context.js';
import {
  buildCanonicalDayKey,
  canonicalDayPath,
  type CanonicalDayKey
} from './cache.js';
import {
  toOfficeDayResponse,
  type OfficeDayResponse
} from './dto.js';
import { compositionError, invalidHour, invalidQueryValue } from './errors.js';
import { resolveLanguages, type LanguageSelection } from './language-map.js';
import {
  resolveOrthographyProfile,
  type TextOrthographyProfile
} from './orthography-profile.js';
import {
  assertVersionServable,
  resolveApiVersion,
  type ApiVersionEntry
} from './version-registry.js';
import { parseBooleanQuery, parseIsoDate } from './compose-office.js';

export interface DayQuery {
  readonly version?: string;
  readonly rubrics?: string;
  readonly lang?: string;
  readonly langfb?: string;
  readonly orthography?: string;
  readonly hours?: string;
  readonly strict?: string | boolean;
}

export interface ResolvedDayRequest {
  readonly date: string;
  readonly versionEntry: ApiVersionEntry & {
    readonly descriptor: NonNullable<ApiVersionEntry['descriptor']>;
    readonly engine: NonNullable<ApiVersionEntry['engine']>;
  };
  readonly languageSelection: LanguageSelection;
  readonly orthography: TextOrthographyProfile;
  readonly hours: readonly HourName[];
  readonly strict: boolean;
  readonly cacheKey: CanonicalDayKey;
}

export function composeOfficeDay(input: {
  readonly context: ApiContext;
  readonly dateParam: string;
  readonly query: DayQuery;
  readonly resolved?: ResolvedDayRequest;
}): OfficeDayResponse {
  const resolved = input.resolved ?? resolveDayRequest(input);

  if (!input.context.corpus) {
    throw new Error('API context has no resolved corpus loaded.');
  }

  const summary = resolved.versionEntry.engine.resolveDayOfficeSummary(resolved.date);
  const composedHours: Partial<Record<HourName, ComposedHour>> = {};
  for (const hour of resolved.hours) {
    composedHours[hour] = composeHour({
      corpus: input.context.corpus,
      summary,
      version: resolved.versionEntry.engine.version,
      hour,
      options: {
        languages: resolved.languageSelection.corpusNames,
        ...(resolved.languageSelection.corpusFallback
          ? { langfb: resolved.languageSelection.corpusFallback }
          : {})
      }
    });
  }

  if (resolved.strict && hasErrorCompositionWarning(composedHours, resolved.hours)) {
    throw compositionError('Composition produced error-level warnings under strict mode.');
  }

  return toOfficeDayResponse({
    date: resolved.date,
    version: resolved.versionEntry.descriptor,
    summary,
    composedHours,
    selectedHours: resolved.hours,
    languageSelection: resolved.languageSelection,
    orthography: resolved.orthography,
    strict: resolved.strict,
    contentVersion: input.context.contentVersion,
    canonicalPath: canonicalDayPath(resolved.cacheKey)
  });
}

export function resolveDayRequest(input: {
  readonly context: ApiContext;
  readonly dateParam: string;
  readonly query: DayQuery;
}): ResolvedDayRequest {
  const date = parseIsoDate(input.dateParam);
  const versionEntry = resolveApiVersion({
    version: input.query.version,
    rubrics: input.query.rubrics,
    versions: input.context.versions
  });
  assertVersionServable(versionEntry);

  const languageSelection = resolveLanguages({
    lang: input.query.lang ?? 'la',
    langfb: input.query.langfb,
    registry: input.context.languages
  });
  const orthography = resolveOrthographyProfile(input.query.orthography);
  const hours = parseHours(input.query.hours, input.context.supportedHours);
  const strict = parseBooleanQuery(input.query.strict, 'strict', false);
  const cacheKey = buildCanonicalDayKey({
    date,
    version: versionEntry.descriptor.handle,
    languages: languageSelection.publicTags,
    langfb: languageSelection.publicFallback,
    orthography,
    hours,
    strict,
    contentVersion: input.context.contentVersion
  });

  return {
    date,
    versionEntry,
    languageSelection,
    orthography,
    hours,
    strict,
    cacheKey
  };
}

function parseHours(
  value: string | undefined,
  supportedHours: readonly HourName[]
): readonly HourName[] {
  if (value === undefined || value === 'all') {
    return supportedHours;
  }

  const names = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (names.length === 0) {
    throw invalidQueryValue('hours', 'At least one hour is required.');
  }
  if (names.includes('all')) {
    throw invalidQueryValue('hours', 'Use either "all" or a comma-separated hour list.');
  }

  const unique = Array.from(new Set(names));
  const output: HourName[] = [];
  for (const name of unique) {
    if (!supportedHours.includes(name as HourName)) {
      throw invalidHour(name);
    }
    output.push(name as HourName);
  }
  return output.sort(
    (left, right) => supportedHours.indexOf(left) - supportedHours.indexOf(right)
  );
}

function hasErrorCompositionWarning(
  composedHours: Partial<Record<HourName, ComposedHour>>,
  hours: readonly HourName[]
): boolean {
  return hours.some((hour) =>
    composedHours[hour]?.warnings.some((warning) => warning.severity === 'error') ?? false
  );
}
