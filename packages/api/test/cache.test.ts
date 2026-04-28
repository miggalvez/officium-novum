import { describe, expect, it } from 'vitest';

import {
  buildCanonicalOfficeKey,
  buildCanonicalDayKey,
  buildDeterministicEtag,
  canonicalDayPath,
  canonicalOfficePath,
  createEtagMemoryCache,
  DETERMINISTIC_CACHE_CONTROL,
  requestMatchesEtag,
  stableJsonHash,
  stableJsonStringify
} from '../src/services/cache.js';

const BASE_KEY = buildCanonicalOfficeKey({
  date: '2024-01-01',
  hour: 'lauds',
  version: 'Rubrics 1960 - 1960',
  languages: ['la', 'en'],
  langfb: 'en',
  orthography: 'version',
  joinLaudsToMatins: false,
  strict: false,
  contentVersion: 'test-content'
});

describe('cache service', () => {
  it('uses stable JSON hashing regardless of object insertion order', () => {
    expect(stableJsonStringify({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(stableJsonStringify({ a: { c: 3, d: 4 }, b: 2 }));
    expect(stableJsonHash({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(stableJsonHash({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it('builds a deterministic canonical office path', () => {
    expect(canonicalOfficePath(BASE_KEY)).toBe(
      '/api/v1/office/2024-01-01/lauds?version=Rubrics+1960+-+1960&lang=la%2Cen&langfb=en&orthography=version&joinLaudsToMatins=false&strict=false'
    );
  });

  it('builds a deterministic canonical day path', () => {
    const key = buildCanonicalDayKey({
      date: '2024-01-01',
      version: 'Rubrics 1960 - 1960',
      languages: ['la', 'en'],
      orthography: 'source',
      hours: ['lauds', 'vespers'],
      strict: false,
      contentVersion: 'test-content'
    });

    expect(canonicalDayPath(key)).toBe(
      '/api/v1/days/2024-01-01?version=Rubrics+1960+-+1960&lang=la%2Cen&orthography=source&hours=lauds%2Cvespers&strict=false'
    );
  });

  it('keeps display-distinct language order in the cache key', () => {
    const reversed = buildCanonicalOfficeKey({
      ...BASE_KEY,
      languages: ['en', 'la']
    });

    expect(stableJsonHash(BASE_KEY)).not.toBe(stableJsonHash(reversed));
    expect(canonicalOfficePath(reversed)).toContain('lang=en%2Cla');
  });

  it('stores ETags by canonical key without recomputing the body', () => {
    const cache = createEtagMemoryCache();
    const etag = '"v1:test-content:request:body"';

    cache.set(BASE_KEY, etag);

    expect(cache.get({ ...BASE_KEY })).toBe(etag);
  });

  it('bounds ETag memory cache size with least-recently-used eviction', () => {
    const cache = createEtagMemoryCache(2);
    const first = BASE_KEY;
    const second = { ...BASE_KEY, date: '2024-01-02' };
    const third = { ...BASE_KEY, date: '2024-01-03' };

    cache.set(first, '"first"');
    cache.set(second, '"second"');
    expect(cache.get(first)).toBe('"first"');
    cache.set(third, '"third"');

    expect(cache.get(first)).toBe('"first"');
    expect(cache.get(second)).toBeUndefined();
    expect(cache.get(third)).toBe('"third"');
  });

  it('varies ETags by orthography and content version', () => {
    const body = { kind: 'office-hour', content: ['sample'] };
    const base = buildDeterministicEtag({ key: BASE_KEY, body });
    const source = buildDeterministicEtag({
      key: { ...BASE_KEY, orthography: 'source' },
      body
    });
    const differentContentVersion = buildDeterministicEtag({
      key: { ...BASE_KEY, contentVersion: 'next-content' },
      body
    });

    expect(base).toMatch(/^"v1:test-content:[^:]+:[^:]+"$/u);
    expect(source).not.toBe(base);
    expect(differentContentVersion).not.toBe(base);
  });

  it('matches weak If-None-Match validators for GET semantics', () => {
    expect(requestMatchesEtag(
      {
        headers: {
          'if-none-match': 'W/"v1:test-content:request:body"'
        }
      } as never,
      '"v1:test-content:request:body"'
    )).toBe(true);
  });

  it('documents the deterministic cache-control policy', () => {
    expect(DETERMINISTIC_CACHE_CONTROL).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
  });
});
