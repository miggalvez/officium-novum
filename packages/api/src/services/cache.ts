import { createHash } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { HourName, VersionHandle } from '@officium-novum/rubrical-engine';

import type { OfficeDayResponse, OfficeHourResponse } from './dto.js';
import type { PublicLanguageTag } from './language-map.js';
import type { TextOrthographyProfile } from './orthography-profile.js';

export const DETERMINISTIC_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

export interface CanonicalOfficeKey {
  readonly route: 'office';
  readonly apiVersion: 'v1';
  readonly date: string;
  readonly hour: HourName;
  readonly version: VersionHandle;
  readonly languages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography: TextOrthographyProfile;
  readonly joinLaudsToMatins: boolean;
  readonly strict: boolean;
  readonly contentVersion: string;
}

export interface CanonicalDayKey {
  readonly route: 'day';
  readonly apiVersion: 'v1';
  readonly date: string;
  readonly version: VersionHandle;
  readonly languages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography: TextOrthographyProfile;
  readonly hours: readonly HourName[];
  readonly strict: boolean;
  readonly contentVersion: string;
}

export type CanonicalCacheKey = CanonicalOfficeKey | CanonicalDayKey;

export function buildCanonicalOfficeKey(input: {
  readonly date: string;
  readonly hour: HourName;
  readonly version: VersionHandle;
  readonly languages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography: TextOrthographyProfile;
  readonly joinLaudsToMatins: boolean;
  readonly strict: boolean;
  readonly contentVersion: string;
}): CanonicalOfficeKey {
  return {
    route: 'office',
    apiVersion: 'v1',
    date: input.date,
    hour: input.hour,
    version: input.version,
    languages: input.languages,
    ...(input.langfb ? { langfb: input.langfb } : {}),
    orthography: input.orthography,
    joinLaudsToMatins: input.joinLaudsToMatins,
    strict: input.strict,
    contentVersion: input.contentVersion
  };
}

export function officeResponseCacheKey(response: OfficeHourResponse): CanonicalOfficeKey {
  return buildCanonicalOfficeKey({
    date: response.request.date,
    hour: response.request.hour,
    version: response.request.version,
    languages: response.request.languages,
    langfb: response.request.langfb,
    orthography: response.request.orthography,
    joinLaudsToMatins: response.request.joinLaudsToMatins,
    strict: response.request.strict,
    contentVersion: response.meta.contentVersion
  });
}

export function buildCanonicalDayKey(input: {
  readonly date: string;
  readonly version: VersionHandle;
  readonly languages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography: TextOrthographyProfile;
  readonly hours: readonly HourName[];
  readonly strict: boolean;
  readonly contentVersion: string;
}): CanonicalDayKey {
  return {
    route: 'day',
    apiVersion: 'v1',
    date: input.date,
    version: input.version,
    languages: input.languages,
    ...(input.langfb ? { langfb: input.langfb } : {}),
    orthography: input.orthography,
    hours: input.hours,
    strict: input.strict,
    contentVersion: input.contentVersion
  };
}

export function dayResponseCacheKey(response: OfficeDayResponse): CanonicalDayKey {
  return buildCanonicalDayKey({
    date: response.request.date,
    version: response.request.version,
    languages: response.request.languages,
    langfb: response.request.langfb,
    orthography: response.request.orthography,
    hours: response.request.hours,
    strict: response.request.strict,
    contentVersion: response.meta.contentVersion
  });
}

export function canonicalOfficePath(key: CanonicalOfficeKey): string {
  const params = new URLSearchParams();
  params.set('version', key.version);
  params.set('lang', key.languages.join(','));
  if (key.langfb) {
    params.set('langfb', key.langfb);
  }
  params.set('orthography', key.orthography);
  params.set('joinLaudsToMatins', String(key.joinLaudsToMatins));
  params.set('strict', String(key.strict));
  return `/api/v1/office/${key.date}/${key.hour}?${params.toString()}`;
}

export function canonicalDayPath(key: CanonicalDayKey): string {
  const params = new URLSearchParams();
  params.set('version', key.version);
  params.set('lang', key.languages.join(','));
  if (key.langfb) {
    params.set('langfb', key.langfb);
  }
  params.set('orthography', key.orthography);
  params.set('hours', key.hours.join(','));
  params.set('strict', String(key.strict));
  return `/api/v1/days/${key.date}?${params.toString()}`;
}

export function stableJsonHash(value: unknown): string {
  return hashString(stableJsonStringify(value));
}

export function buildDeterministicEtag(input: {
  readonly key: CanonicalCacheKey;
  readonly body: unknown;
}): string {
  const requestHash = stableJsonHash(input.key);
  const bodyHash = stableJsonHash(input.body);
  return `"v1:${etagSegment(input.key.contentVersion)}:${requestHash}:${bodyHash}"`;
}

export function applyCacheHeaders(reply: FastifyReply, etag: string): void {
  reply.header('Cache-Control', DETERMINISTIC_CACHE_CONTROL);
  reply.header('ETag', etag);
}

export class EtagMemoryCache {
  private readonly maxEntries: number;
  private readonly etags = new Map<string, string>();

  constructor(maxEntries = 1_024) {
    this.maxEntries = maxEntries;
  }

  get(key: CanonicalCacheKey): string | undefined {
    const cacheKey = stableJsonStringify(key);
    const etag = this.etags.get(cacheKey);
    if (etag) {
      this.etags.delete(cacheKey);
      this.etags.set(cacheKey, etag);
    }
    return etag;
  }

  set(key: CanonicalCacheKey, etag: string): void {
    const cacheKey = stableJsonStringify(key);
    this.etags.delete(cacheKey);
    this.etags.set(cacheKey, etag);
    while (this.etags.size > this.maxEntries) {
      const oldestKey = this.etags.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.etags.delete(oldestKey);
    }
  }
}

export function createEtagMemoryCache(maxEntries?: number): EtagMemoryCache {
  return new EtagMemoryCache(maxEntries);
}

export function requestMatchesEtag(request: FastifyRequest, etag: string): boolean {
  const header = request.headers['if-none-match'];
  if (!header) {
    return false;
  }

  const values: readonly string[] = Array.isArray(header) ? header : [header];
  return values.some((value: string) =>
    value
      .split(',')
      .map((candidate: string) => candidate.trim())
      .some((candidate: string) => candidate === '*' || weakEtagValue(candidate) === etag)
  );
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJson(value));
}

function toStableJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toStableJson);
  }

  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, toStableJson(child)])
  );
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 24);
}

function etagSegment(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '~');
}

function weakEtagValue(value: string): string {
  return value.startsWith('W/') ? value.slice(2) : value;
}
