import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../../api/src/app.js';
import { loadApiConfig } from '../../api/src/config.js';
import { buildApiContext } from '../../api/src/context.js';

const baseConfig = loadApiConfig();
const HAS_UPSTREAM = existsSync(baseConfig.corpusPath);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

const E2E_CASES = [
  {
    version: 'Divino Afflatu - 1954',
    date: '2024-01-01',
    hour: 'lauds',
    celebration: 'In Circumcisione Domini',
    anchor: 'Deus + in adjutórium meum inténde.'
  },
  {
    version: 'Reduced - 1955',
    date: '2024-03-31',
    hour: 'lauds',
    celebration: 'Dominica Resurrectionis',
    anchor: 'Angelus autem Dómini'
  },
  {
    version: 'Rubrics 1960 - 1960',
    date: '2024-08-15',
    hour: 'vespers',
    celebration: 'In Assumptione Beatæ Mariæ Virginis',
    anchor: 'Assúmpta est María in cælum'
  }
] as const;

let fullAppPromise: ReturnType<typeof createFullApp> | undefined;

async function fullApp() {
  fullAppPromise ??= createFullApp();
  return fullAppPromise;
}

async function createFullApp() {
  const context = await buildApiContext(
    loadApiConfig({
      ...process.env,
      OFFICIUM_CONTENT_VERSION: 'phase-5e-test-content',
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

describeIfUpstream('Phase 5e API E2E harness', () => {
  it('exercises the parser, engine, compositor, and API with public DTO anchors', async () => {
    const app = await fullApp();
    const summary: unknown[] = [];

    for (const testCase of E2E_CASES) {
      const response = await app.inject(
        `/api/v1/office/${testCase.date}/${testCase.hour}?version=${encodeURIComponent(testCase.version)}&lang=la,en&orthography=source`
      );

      expect(response.statusCode, `${testCase.version} ${testCase.date}`).toBe(200);
      expect(response.headers['cache-control']).toBe(
        'public, max-age=86400, stale-while-revalidate=604800'
      );
      expect(response.headers.etag).toMatch(
        /^"v1:phase-5e-test-content:[^:]+:[^:]+"$/u
      );

      const body = response.json() as OfficeResponse;
      expect(body).toMatchObject({
        kind: 'office-hour',
        apiVersion: 'v1',
        request: {
          date: testCase.date,
          hour: testCase.hour,
          version: testCase.version,
          languages: ['la', 'en'],
          orthography: 'source'
        },
        office: {
          date: testCase.date,
          hour: testCase.hour,
          celebration: testCase.celebration,
          languages: ['la', 'en']
        },
        meta: {
          contentVersion: 'phase-5e-test-content',
          quality: 'complete'
        }
      });
      expect(body.version).not.toHaveProperty('policy');
      expect(hasObjectKey(body, 'Latin')).toBe(false);
      expect(hasObjectKey(body, 'English')).toBe(false);
      expect(renderedText(body.office)).toContain(testCase.anchor);

      summary.push({
        version: testCase.version,
        date: testCase.date,
        hour: testCase.hour,
        celebration: body.office.celebration,
        sectionCount: body.office.sections.length,
        anchor: testCase.anchor
      });
    }

    expect(summary).toMatchInlineSnapshot(`
      [
        {
          "anchor": "Deus + in adjutórium meum inténde.",
          "celebration": "In Circumcisione Domini",
          "date": "2024-01-01",
          "hour": "lauds",
          "sectionCount": 9,
          "version": "Divino Afflatu - 1954",
        },
        {
          "anchor": "Angelus autem Dómini",
          "celebration": "Dominica Resurrectionis",
          "date": "2024-03-31",
          "hour": "lauds",
          "sectionCount": 8,
          "version": "Reduced - 1955",
        },
        {
          "anchor": "Assúmpta est María in cælum",
          "celebration": "In Assumptione Beatæ Mariæ Virginis",
          "date": "2024-08-15",
          "hour": "vespers",
          "sectionCount": 9,
          "version": "Rubrics 1960 - 1960",
        },
      ]
    `);
  }, 120_000);
});

interface OfficeResponse {
  readonly kind: string;
  readonly apiVersion: string;
  readonly request: Record<string, unknown>;
  readonly version: Record<string, unknown>;
  readonly office: {
    readonly date: string;
    readonly hour: string;
    readonly celebration: string;
    readonly languages: readonly string[];
    readonly sections: readonly Array<{
      readonly lines: readonly Array<{
        readonly texts: Record<string, readonly Array<{ readonly value?: string }>>;
      }>;
    }>;
  };
  readonly meta: Record<string, unknown>;
}

function renderedText(office: OfficeResponse['office']): string {
  return office.sections
    .flatMap((section) => section.lines)
    .flatMap((line) => Object.values(line.texts))
    .flat()
    .flatMap((run) => (run.value ? [run.value] : []))
    .join('\n');
}

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
