import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadApiConfig } from '../src/config.js';
import { buildApiContext } from '../src/context.js';
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

describe('office route errors', () => {
  it('rejects malformed dates and unsupported hours', async () => {
    const app = await lightweightApp();

    expect((await app.inject('/api/v1/office/2024-02-31/lauds?version=Rubrics%201960%20-%201960')).statusCode)
      .toBe(400);
    expect((await app.inject('/api/v1/office/2024-02-01/office?version=Rubrics%201960%20-%201960')).json())
      .toMatchObject({ code: 'invalid-hour' });

    await app.close();
  });

  it('rejects missing, unknown, deferred, and missa-only versions', async () => {
    const app = await lightweightApp();

    expect((await app.inject('/api/v1/office/2024-01-01/lauds')).json()).toMatchObject({
      code: 'missing-version'
    });
    expect((await app.inject('/api/v1/office/2024-01-01/lauds?version=Nope')).json()).toMatchObject({
      code: 'unknown-version'
    });
    expect((await app.inject('/api/v1/office/2024-01-01/lauds?version=Monastic%20-%201963')).json())
      .toMatchObject({ code: 'unsupported-version' });
    expect((await app.inject('/api/v1/office/2024-01-01/lauds?version=Rubrics%201960')).json())
      .toMatchObject({
        code: 'missa-only-version',
        hints: ['Use "Rubrics 1960 - 1960" for the Breviary.']
      });

    await app.close();
  });
});

describeIfUpstream('office route integration', () => {
  it('composes a bilingual office hour with public language keys', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/office/2024-01-01/lauds?version=Rubrics%201960%20-%201960&lang=la,en&langfb=en&orthography=source'
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      kind: 'office-hour',
      apiVersion: 'v1',
      request: {
        date: '2024-01-01',
        hour: 'lauds',
        version: 'Rubrics 1960 - 1960',
        languages: ['la', 'en'],
        langfb: 'en',
        orthography: 'source'
      },
      office: {
        date: '2024-01-01',
        hour: 'lauds',
        languages: ['la', 'en']
      },
      meta: {
        contentVersion: 'test-content',
        quality: 'complete'
      }
    });

    const firstTextLine = body.office.sections
      .flatMap((section: { lines: Array<{ texts: Record<string, unknown> }> }) => section.lines)
      .find((line: { texts: Record<string, unknown> }) => line.texts.la || line.texts.en);
    expect(firstTextLine?.texts).not.toHaveProperty('Latin');
    expect(firstTextLine?.texts).not.toHaveProperty('English');
  }, 120_000);

  it('emits stable cache headers and honors If-None-Match', async () => {
    const app = await fullApp();
    const first = await app.inject(
      '/api/v1/office/2024-01-01/lauds?orthography=source&lang=la,en&version=Rubrics%201960%20-%201960'
    );
    const equivalent = await app.inject(
      '/api/v1/office/2024-01-01/lauds?version=Rubrics%201960%20-%201960&lang=la,en&orthography=source'
    );

    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(first.headers.etag).toMatch(/^"v1:test-content:[^:]+:[^:]+"$/u);
    expect(equivalent.headers.etag).toBe(first.headers.etag);
    expect(first.json().meta.canonicalPath).toBe(
      '/api/v1/office/2024-01-01/lauds?version=Rubrics+1960+-+1960&lang=la%2Cen&orthography=source&joinLaudsToMatins=false&strict=false'
    );

    const cached = await app.inject({
      method: 'GET',
      url: '/api/v1/office/2024-01-01/lauds?version=Rubrics%201960%20-%201960&lang=la,en&orthography=source',
      headers: {
        'if-none-match': String(first.headers.etag)
      }
    });

    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe('');
    expect(cached.headers.etag).toBe(first.headers.etag);
  }, 120_000);

  it('varies office ETags for display-distinct request options', async () => {
    const app = await fullApp();
    const latinThenEnglish = await app.inject(
      '/api/v1/office/2024-04-01/lauds?version=Rubrics%201960%20-%201960&lang=la,en&orthography=source'
    );
    const englishThenLatin = await app.inject(
      '/api/v1/office/2024-04-01/lauds?version=Rubrics%201960%20-%201960&lang=en,la&orthography=source'
    );
    const versionOrthography = await app.inject(
      '/api/v1/office/2024-04-01/lauds?version=Rubrics%201960%20-%201960&lang=la,en&orthography=version'
    );

    expect(latinThenEnglish.statusCode).toBe(200);
    expect(englishThenLatin.statusCode).toBe(200);
    expect(versionOrthography.statusCode).toBe(200);
    expect(englishThenLatin.headers.etag).not.toBe(latinThenEnglish.headers.etag);
    expect(versionOrthography.headers.etag).not.toBe(latinThenEnglish.headers.etag);
  }, 120_000);

  it('normalizes rubrics aliases to canonical version handles', async () => {
    const app = await fullApp();
    const response = await app.inject('/api/v1/office/2024-01-01/lauds?rubrics=1960&lang=la');

    expect(response.statusCode).toBe(200);
    expect(response.json().request.version).toBe('Rubrics 1960 - 1960');
  }, 120_000);

  it('initializes office engines when a custom version registry is provided', async () => {
    const context = await buildApiContext({
      ...loadApiConfig({
        OFFICIUM_CONTENT_VERSION: 'test-content',
        OFFICIUM_API_LOGGER: 'false'
      }),
      versionRegistry: testVersionRegistry()
    });
    const app = await createApp({ context, config: { logger: false } });

    const response = await app.inject(
      '/api/v1/office/2024-01-01/lauds?version=Rubrics%201960%20-%201960&lang=la'
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: 'office-hour',
      request: {
        version: 'Rubrics 1960 - 1960'
      }
    });

    await app.close();
  }, 120_000);

  it('applies the version orthography profile only to text and rubric runs', async () => {
    const app = await fullApp();
    const source = await app.inject(
      '/api/v1/office/2024-04-01/lauds?version=Rubrics%201960%20-%201960&lang=la&orthography=source'
    );
    const version = await app.inject(
      '/api/v1/office/2024-04-01/lauds?version=Rubrics%201960%20-%201960&lang=la&orthography=version'
    );

    expect(source.statusCode).toBe(200);
    expect(version.statusCode).toBe(200);
    expect(JSON.stringify(source.json().office)).toMatch(/allelúja/iu);
    expect(JSON.stringify(version.json().office)).toMatch(/allelúia/iu);
    expect(JSON.stringify(version.json().office)).not.toMatch(/allelúja/iu);
  }, 120_000);

  it('rejects unsupported public language tags', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/office/2024-01-01/lauds?version=Rubrics%201960%20-%201960&lang=es'
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid-language' });
  }, 120_000);
});
