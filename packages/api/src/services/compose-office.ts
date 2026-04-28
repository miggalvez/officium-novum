import { composeHour } from '@officium-novum/compositor';
import type { HourName } from '@officium-novum/rubrical-engine';

import type { ApiContext } from '../context.js';
import { compositionError, invalidDate, invalidHour, invalidQueryValue } from './errors.js';
import { resolveLanguages, type LanguageSelection } from './language-map.js';
import {
  resolveOrthographyProfile,
  type TextOrthographyProfile
} from './orthography-profile.js';
import { toOfficeHourResponse, type OfficeHourResponse } from './dto.js';
import {
  buildCanonicalOfficeKey,
  canonicalOfficePath,
  type CanonicalOfficeKey
} from './cache.js';
import {
  assertVersionServable,
  resolveApiVersion,
  type ApiVersionEntry
} from './version-registry.js';

export interface OfficeQuery {
  readonly version?: string;
  readonly rubrics?: string;
  readonly lang?: string;
  readonly langfb?: string;
  readonly orthography?: string;
  readonly joinLaudsToMatins?: string | boolean;
  readonly strict?: string | boolean;
}

export interface ResolvedOfficeRequest {
  readonly date: string;
  readonly hour: HourName;
  readonly versionEntry: ApiVersionEntry & {
    readonly descriptor: NonNullable<ApiVersionEntry['descriptor']>;
    readonly engine: NonNullable<ApiVersionEntry['engine']>;
  };
  readonly languageSelection: LanguageSelection;
  readonly orthography: TextOrthographyProfile;
  readonly joinLaudsToMatins: boolean;
  readonly strict: boolean;
  readonly cacheKey: CanonicalOfficeKey;
}

export function composeOfficeHour(input: {
  readonly context: ApiContext;
  readonly dateParam: string;
  readonly hourParam: string;
  readonly query: OfficeQuery;
  readonly resolved?: ResolvedOfficeRequest;
}): OfficeHourResponse {
  const resolved = input.resolved ?? resolveOfficeRequest(input);

  if (!input.context.corpus) {
    throw new Error('API context has no resolved corpus loaded.');
  }

  const summary = resolved.versionEntry.engine.resolveDayOfficeSummary(resolved.date);
  const composed = composeHour({
    corpus: input.context.corpus,
    summary,
    version: resolved.versionEntry.engine.version,
    hour: resolved.hour,
    options: {
      languages: resolved.languageSelection.corpusNames,
      ...(resolved.languageSelection.corpusFallback
        ? { langfb: resolved.languageSelection.corpusFallback }
        : {}),
      joinLaudsToMatins: resolved.joinLaudsToMatins
    }
  });

  if (resolved.strict && composed.warnings.some((warning) => warning.severity === 'error')) {
    throw compositionError('Composition produced error-level warnings under strict mode.');
  }

  return toOfficeHourResponse({
    date: resolved.date,
    hour: resolved.hour,
    version: resolved.versionEntry.descriptor,
    summary,
    composed,
    languageSelection: resolved.languageSelection,
    orthography: resolved.orthography,
    joinLaudsToMatins: resolved.joinLaudsToMatins,
    strict: resolved.strict,
    contentVersion: input.context.contentVersion,
    canonicalPath: canonicalOfficePath(resolved.cacheKey)
  });
}

export function resolveOfficeRequest(input: {
  readonly context: ApiContext;
  readonly dateParam: string;
  readonly hourParam: string;
  readonly query: OfficeQuery;
}): ResolvedOfficeRequest {
  const date = parseIsoDate(input.dateParam);
  const hour = parseHourName(input.hourParam, input.context.supportedHours);
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
  const joinLaudsToMatins = parseBooleanQuery(
    input.query.joinLaudsToMatins,
    'joinLaudsToMatins',
    false
  );
  const strict = parseBooleanQuery(input.query.strict, 'strict', false);

  const cacheKey = buildCanonicalOfficeKey({
    date,
    hour,
    version: versionEntry.descriptor.handle,
    languages: languageSelection.publicTags,
    langfb: languageSelection.publicFallback,
    orthography,
    joinLaudsToMatins,
    strict,
    contentVersion: input.context.contentVersion
  });

  return {
    date,
    hour,
    versionEntry,
    languageSelection,
    orthography,
    joinLaudsToMatins,
    strict,
    cacheKey
  };
}

export function parseIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw invalidDate(value);
  }

  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw invalidDate(value);
  }

  return value;
}

function parseHourName(value: string, supportedHours: readonly HourName[]): HourName {
  if (supportedHours.includes(value as HourName)) {
    return value as HourName;
  }
  throw invalidHour(value);
}

export function parseBooleanQuery(
  value: string | boolean | undefined,
  field: string,
  defaultValue: boolean
): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  throw invalidQueryValue(field, 'Expected "true" or "false".');
}
