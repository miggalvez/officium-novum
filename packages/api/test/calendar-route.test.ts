import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { RubricalEngine } from '@officium-novum/rubrical-engine';

import { createApp } from '../src/app.js';
import { loadApiConfig } from '../src/config.js';
import { buildApiContext, type ApiContext } from '../src/context.js';
import type { ApiVersionEntry } from '../src/services/version-registry.js';
import { testVersionRegistry } from './helpers.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

async function lightweightApp() {
  const context = await buildApiContext({
    host: '127.0.0.1',
    port: 0,
    corpusPath: '.',
    contentVersion: 'test-content',
    logger: false,
    versionRegistry: testVersionRegistry(),
    loadRuntime: false
  });
  return createApp({ context, config: { logger: false } });
}

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

describe('calendar route errors', () => {
  it('rejects malformed months and unsupported versions', async () => {
    const app = await lightweightApp();

    expect((await app.inject('/api/v1/calendar/2024/13?version=Rubrics%201960%20-%201960')).json())
      .toMatchObject({ code: 'invalid-query-value', details: { field: 'month' } });
    expect((await app.inject('/api/v1/calendar/24/02?version=Rubrics%201960%20-%201960')).json())
      .toMatchObject({ code: 'invalid-query-value', details: { field: 'year' } });
    expect((await app.inject('/api/v1/calendar/2024/02')).json()).toMatchObject({
      code: 'missing-version'
    });
    expect((await app.inject('/api/v1/calendar/2024/02?version=Monastic%20-%201963')).json())
      .toMatchObject({ code: 'unsupported-version' });
    expect((await app.inject('/api/v1/calendar/2024/02?version=Rubrics%201960')).json())
      .toMatchObject({ code: 'missa-only-version' });

    await app.close();
  });
});

describeIfUpstream('calendar route integration', () => {
  it('returns month summaries without composed office text', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/calendar/2024/02?version=Rubrics%201960%20-%201960'
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      kind: 'calendar-month',
      apiVersion: 'v1',
      year: 2024,
      month: 2,
      version: {
        handle: 'Rubrics 1960 - 1960'
      },
      meta: {
        contentVersion: 'test-content',
        canonicalPath: '/api/v1/calendar/2024/02?version=Rubrics+1960+-+1960'
      }
    });
    expect(body.days).toHaveLength(29);
    expect(body.days[0]).toMatchObject({
      date: '2024-02-01',
      dayOfWeek: 4,
      celebration: {
        feast: expect.any(Object),
        rank: expect.any(Object)
      }
    });
    expect(body.days[28].date).toBe('2024-02-29');
    expect(body.days[0]).not.toHaveProperty('hours');
    expect(body.days[0].celebration).not.toHaveProperty('color');
  }, 120_000);

  it('uses correct common-year month length', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/calendar/2023/02?version=Rubrics%201960%20-%201960'
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().days.map((day: { date: string }) => day.date).at(-1))
      .toBe('2023-02-28');
  }, 120_000);

  it('resolves each day of the month through the engine exactly once', async () => {
    const context = await buildApiContext(
      loadApiConfig({
        OFFICIUM_CONTENT_VERSION: 'test-content',
        OFFICIUM_API_LOGGER: 'false'
      })
    );
    const versions = new Map(context.versions);
    const entry = versions.get('Rubrics 1960 - 1960');
    if (!entry?.engine) {
      throw new Error('Test fixture missing 1960 engine');
    }

    const dates: string[] = [];
    const engine: RubricalEngine = {
      version: entry.engine.version,
      resolveDayOfficeSummary(date) {
        dates.push(String(date));
        return entry.engine.resolveDayOfficeSummary(date);
      }
    };
    versions.set('Rubrics 1960 - 1960', {
      ...entry,
      engine
    } satisfies ApiVersionEntry);

    const app = await createApp({
      context: {
        ...context,
        versions
      } satisfies ApiContext,
      config: { logger: false }
    });

    const response = await app.inject(
      '/api/v1/calendar/2024/04?version=Rubrics%201960%20-%201960'
    );

    expect(response.statusCode).toBe(200);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2024-04-01');
    expect(dates.at(-1)).toBe('2024-04-30');

    await app.close();
  }, 120_000);

  it('emits stable cache headers and honors If-None-Match', async () => {
    const app = await fullApp();
    const first = await app.inject(
      '/api/v1/calendar/2024/2?version=Rubrics%201960%20-%201960'
    );
    const equivalent = await app.inject(
      '/api/v1/calendar/2024/02?version=Rubrics%201960%20-%201960'
    );

    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(first.headers.etag).toMatch(/^"v1:test-content:[^:]+:[^:]+"$/u);
    expect(equivalent.headers.etag).toBe(first.headers.etag);

    const cached = await app.inject({
      method: 'GET',
      url: '/api/v1/calendar/2024/02?version=Rubrics%201960%20-%201960',
      headers: {
        'if-none-match': String(first.headers.etag)
      }
    });

    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe('');
    expect(cached.headers.etag).toBe(first.headers.etag);
  }, 120_000);

  it('normalizes rubrics aliases to canonical version handles', async () => {
    const app = await fullApp();
    const response = await app.inject('/api/v1/calendar/2024/04?rubrics=1960');

    expect(response.statusCode).toBe(200);
    expect(response.json().version.handle).toBe('Rubrics 1960 - 1960');
  }, 120_000);
});
