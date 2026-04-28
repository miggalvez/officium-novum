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

describe('day route errors', () => {
  it('rejects malformed dates and unsupported versions', async () => {
    const app = await lightweightApp();

    expect((await app.inject('/api/v1/days/2024-02-31?version=Rubrics%201960%20-%201960')).statusCode)
      .toBe(400);
    expect((await app.inject('/api/v1/days/2024-01-01')).json()).toMatchObject({
      code: 'missing-version'
    });
    expect((await app.inject('/api/v1/days/2024-01-01?version=Monastic%20-%201963')).json())
      .toMatchObject({ code: 'unsupported-version' });
    expect((await app.inject('/api/v1/days/2024-01-01?version=Rubrics%201960')).json())
      .toMatchObject({ code: 'missa-only-version' });

    await app.close();
  });
});

describeIfUpstream('day route integration', () => {
  it('composes selected hours with public language keys', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&lang=la,en&hours=lauds,vespers&orthography=source'
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      kind: 'office-day',
      apiVersion: 'v1',
      request: {
        date: '2024-01-01',
        version: 'Rubrics 1960 - 1960',
        languages: ['la', 'en'],
        hours: ['lauds', 'vespers'],
        orthography: 'source'
      },
      meta: {
        contentVersion: 'test-content',
        quality: 'complete'
      }
    });
    expect(Object.keys(body.hours)).toEqual(['lauds', 'vespers']);

    const firstTextLine = body.hours.lauds.sections
      .flatMap((section: { lines: Array<{ texts: Record<string, unknown> }> }) => section.lines)
      .find((line: { texts: Record<string, unknown> }) => line.texts.la || line.texts.en);
    expect(firstTextLine?.texts).not.toHaveProperty('Latin');
    expect(firstTextLine?.texts).not.toHaveProperty('English');
  }, 120_000);

  it('supports hours=all and rubrics aliases', async () => {
    const app = await fullApp();
    const response = await app.inject('/api/v1/days/2024-01-01?rubrics=1960&hours=all&lang=la');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.request.version).toBe('Rubrics 1960 - 1960');
    expect(body.request.hours).toEqual([
      'matins',
      'lauds',
      'prime',
      'terce',
      'sext',
      'none',
      'vespers',
      'compline'
    ]);
    expect(Object.keys(body.hours)).toEqual(body.request.hours);
  }, 120_000);

  it('resolves the day summary once for multiple selected hours', async () => {
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

    let calls = 0;
    const engine: RubricalEngine = {
      version: entry.engine.version,
      resolveDayOfficeSummary(date) {
        calls += 1;
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
      '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&hours=lauds,vespers&lang=la'
    );

    expect(response.statusCode).toBe(200);
    expect(calls).toBe(1);

    await app.close();
  }, 120_000);

  it('emits stable cache headers and honors If-None-Match', async () => {
    const app = await fullApp();
    const first = await app.inject(
      '/api/v1/days/2024-01-01?hours=lauds,vespers&lang=la,en&version=Rubrics%201960%20-%201960&orthography=source'
    );
    const equivalent = await app.inject(
      '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&lang=la,en&orthography=source&hours=lauds,vespers'
    );

    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(first.headers.etag).toMatch(/^"v1:test-content:[^:]+:[^:]+"$/u);
    expect(equivalent.headers.etag).toBe(first.headers.etag);
    expect(first.json().meta.canonicalPath).toBe(
      '/api/v1/days/2024-01-01?version=Rubrics+1960+-+1960&lang=la%2Cen&orthography=source&hours=lauds%2Cvespers&strict=false'
    );

    const cached = await app.inject({
      method: 'GET',
      url: '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&lang=la,en&orthography=source&hours=lauds,vespers',
      headers: {
        'if-none-match': String(first.headers.etag)
      }
    });

    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe('');
    expect(cached.headers.etag).toBe(first.headers.etag);
  }, 120_000);

  it('canonicalizes selected hours by liturgical order and removes duplicates', async () => {
    const app = await fullApp();
    const canonical = await app.inject(
      '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&lang=la&hours=lauds,vespers'
    );
    const reordered = await app.inject(
      '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&lang=la&hours=vespers,lauds,lauds'
    );

    expect(canonical.statusCode).toBe(200);
    expect(reordered.statusCode).toBe(200);
    expect(reordered.json().request.hours).toEqual(['lauds', 'vespers']);
    expect(reordered.headers.etag).toBe(canonical.headers.etag);
    expect(reordered.json().meta.canonicalPath).toContain('hours=lauds%2Cvespers');
  }, 120_000);

  it('rejects unsupported hour names', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&hours=lauds,office'
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid-hour' });
  }, 120_000);

  it('rejects empty hours query values', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/days/2024-01-01?version=Rubrics%201960%20-%201960&hours='
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid-query-value' });
  }, 120_000);
});
