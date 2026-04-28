import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadApiConfig } from '../src/config.js';
import { buildApiContext } from '../src/context.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

const CONTRACT_DATES = [
  '2024-01-01',
  '2024-01-06',
  '2024-02-02',
  '2024-02-14',
  '2024-03-19',
  '2024-03-25',
  '2024-03-31',
  '2024-05-30',
  '2024-06-29',
  '2024-08-15',
  '2024-11-02',
  '2024-12-08',
  '2024-12-25'
] as const;

const CONTRACT_HANDLES = [
  'Divino Afflatu - 1954',
  'Reduced - 1955',
  'Rubrics 1960 - 1960'
] as const;

const CONTRACT_HOURS = [
  'matins',
  'lauds',
  'prime',
  'terce',
  'sext',
  'none',
  'vespers',
  'compline'
] as const;

let fullAppPromise: ReturnType<typeof createFullApp> | undefined;

async function fullApp() {
  fullAppPromise ??= createFullApp();
  return fullAppPromise;
}

async function createFullApp() {
  const context = await buildApiContext(
    loadApiConfig({
      OFFICIUM_CONTENT_VERSION: 'test-content',
      OFFICIUM_API_LOGGER: 'false'
    })
  );
  return createApp({ context, config: { logger: false } });
}

afterAll(async () => {
  if (fullAppPromise) {
    const app = await fullAppPromise;
    await app.close();
  }
});

describeIfUpstream('Phase 4 API contract gate', () => {
  it('serves the Roman Office matrix without leaking raw internal contract fields', async () => {
    const app = await fullApp();

    for (const version of CONTRACT_HANDLES) {
      for (const date of CONTRACT_DATES) {
        for (const hour of CONTRACT_HOURS) {
          const response = await app.inject(
            `/api/v1/office/${date}/${hour}?version=${encodeURIComponent(version)}&lang=la&orthography=source`
          );

          expect(response.statusCode, `${version} ${date} ${hour}`).toBe(200);
          expect(response.headers['cache-control']).toBe(
            'public, max-age=86400, stale-while-revalidate=604800'
          );
          expect(response.headers.etag).toMatch(/^"v1:test-content:[^:]+:[^:]+"$/u);

          const body = response.json();
          expect(body.kind).toBe('office-hour');
          expect(body.request.version).toBe(version);
          expect(body.request.languages).toEqual(['la']);
          expect(body.version).not.toHaveProperty('policy');
          expect(hasObjectKey(body, 'Latin')).toBe(false);
          expect(hasObjectKey(body, 'English')).toBe(false);
        }
      }
    }
  }, 180_000);

  it('keeps public DTO boundaries on day and calendar payloads', async () => {
    const app = await fullApp();
    const day = await app.inject(
      '/api/v1/days/2024-08-15?version=Rubrics%201960%20-%201960&lang=la&hours=lauds,vespers'
    );
    const calendar = await app.inject(
      '/api/v1/calendar/2024/08?version=Rubrics%201960%20-%201960'
    );

    expect(day.statusCode).toBe(200);
    expect(calendar.statusCode).toBe(200);

    for (const response of [day, calendar]) {
      expect(response.headers['cache-control']).toBe(
        'public, max-age=86400, stale-while-revalidate=604800'
      );
      expect(response.headers.etag).toMatch(/^"v1:test-content:[^:]+:[^:]+"$/u);
      const body = response.json();
      expect(JSON.stringify(body)).not.toContain('"policy"');
      expect(hasObjectKey(body, 'Latin')).toBe(false);
      expect(hasObjectKey(body, 'English')).toBe(false);
    }

    const calendarBody = calendar.json();
    for (const dayEntry of calendarBody.days as Array<{ celebration: unknown }>) {
      expect(dayEntry.celebration).not.toHaveProperty('color');
    }
  }, 120_000);

  it('exposes valid OpenAPI JSON for the shipped v1 routes', async () => {
    const app = await fullApp();
    const response = await app.inject('/api/v1/openapi.json');

    expect(response.statusCode).toBe(200);
    const spec = response.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Officium Novum API');
    expect(spec.paths).toHaveProperty('/api/v1/status');
    expect(spec.paths).toHaveProperty('/api/v1/versions');
    expect(spec.paths).toHaveProperty('/api/v1/languages');
    expect(spec.paths).toHaveProperty('/api/v1/office/{date}/{hour}');
    expect(spec.paths).toHaveProperty('/api/v1/days/{date}');
    expect(spec.paths).toHaveProperty('/api/v1/calendar/{year}/{month}');
    expect(JSON.parse(JSON.stringify(spec))).toMatchObject({
      openapi: '3.1.0'
    });
  }, 120_000);
});

function hasObjectKey(value: unknown, key: string): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') {
      continue;
    }
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    for (const [entryKey, child] of Object.entries(current as Record<string, unknown>)) {
      if (entryKey === key) {
        return true;
      }
      stack.push(child);
    }
  }
  return false;
}
