import { composeHour } from '@officium-novum/compositor';
import type { HourName } from '@officium-novum/rubrical-engine';

import type { ApiContext } from '../context.js';
import { compositionError, invalidDate, invalidHour, invalidQueryValue } from './errors.js';
import { resolveLanguages } from './language-map.js';
import { resolveOrthographyProfile } from './orthography-profile.js';
import { toOfficeHourResponse, type OfficeHourResponse } from './dto.js';
import {
  assertVersionServable,
  resolveApiVersion
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

export function composeOfficeHour(input: {
  readonly context: ApiContext;
  readonly dateParam: string;
  readonly hourParam: string;
  readonly query: OfficeQuery;
}): OfficeHourResponse {
  const date = parseIsoDate(input.dateParam);
  const hour = parseHourName(input.hourParam, input.context.supportedHours);
  const versionEntry = resolveApiVersion({
    version: input.query.version,
    rubrics: input.query.rubrics,
    versions: input.context.versions
  });
  assertVersionServable(versionEntry);

  if (!input.context.corpus) {
    throw new Error('API context has no resolved corpus loaded.');
  }

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

  const summary = versionEntry.engine.resolveDayOfficeSummary(date);
  const composed = composeHour({
    corpus: input.context.corpus,
    summary,
    version: versionEntry.engine.version,
    hour,
    options: {
      languages: languageSelection.corpusNames,
      ...(languageSelection.corpusFallback
        ? { langfb: languageSelection.corpusFallback }
        : {}),
      joinLaudsToMatins
    }
  });

  if (strict && composed.warnings.some((warning) => warning.severity === 'error')) {
    throw compositionError('Composition produced error-level warnings under strict mode.');
  }

  return toOfficeHourResponse({
    date,
    hour,
    version: versionEntry.descriptor,
    summary,
    composed,
    languageSelection,
    orthography,
    joinLaudsToMatins,
    strict,
    contentVersion: input.context.contentVersion,
    canonicalPath: canonicalOfficePath({
      date,
      hour,
      version: versionEntry.descriptor.handle,
      lang: languageSelection.publicTags.join(','),
      langfb: languageSelection.publicFallback,
      orthography,
      joinLaudsToMatins,
      strict
    })
  });
}

function parseIsoDate(value: string): string {
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

function parseBooleanQuery(
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

function canonicalOfficePath(input: {
  readonly date: string;
  readonly hour: HourName;
  readonly version: string;
  readonly lang: string;
  readonly langfb?: string;
  readonly orthography: string;
  readonly joinLaudsToMatins: boolean;
  readonly strict: boolean;
}): string {
  const params = new URLSearchParams();
  params.set('version', input.version);
  params.set('lang', input.lang);
  if (input.langfb) {
    params.set('langfb', input.langfb);
  }
  params.set('orthography', input.orthography);
  params.set('joinLaudsToMatins', String(input.joinLaudsToMatins));
  params.set('strict', String(input.strict));
  return `/api/v1/office/${input.date}/${input.hour}?${params.toString()}`;
}
