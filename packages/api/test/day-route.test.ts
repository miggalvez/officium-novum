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

  it('returns the clean 1960 office for St Paul of the Cross on 2026-04-28', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/days/2026-04-28?rubrics=1960&hours=lauds&lang=la,en'
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary.celebration).toMatchObject({
      feast: {
        path: 'Sancti/04-28',
        title: 'S. Pauli a Cruce Confessoris'
      },
      rank: {
        name: 'III. classis',
        classSymbol: 'III'
      }
    });
    expect(body.summary.temporal.feast).toMatchObject({
      path: 'Tempora/Pasc3-2Feria',
      title: 'Feria Tertia infra Hebdomadam III post Octavam Paschæ'
    });
    expect(body.summary.warnings).toEqual([]);
    expect(body.warnings.rubrical).toEqual([]);
    expect(body.warnings.composition.lauds).toEqual([]);
    expect(body.hours.lauds.warnings).toEqual([]);

    const psalmody = body.hours.lauds.sections
      .find((section: { slot: string }) => section.slot === 'psalmody');
    const firstAntiphon = psalmody?.lines.find(
      (line: { marker?: string; texts: { la?: Array<{ type: string; value: string }> } }) =>
        line.marker === 'Ant.'
    );
    const antiphons = psalmody?.lines.filter((line: { marker?: string }) => line.marker === 'Ant.');
    const firstPsalmHeading = psalmody?.lines.find(
      (line: { texts: { la?: Array<{ type: string; value: string }> } }) =>
        line.texts.la?.some((node) => node.type === 'text' && /^Psalmus \d+/u.test(node.value))
    );
    expect(firstAntiphon?.texts.la?.[0]?.value).toMatch(
      /^Allelú[ij]a, \* allelú[ij]a, allelú[ij]a\.$/u
    );
    expect(antiphons).toHaveLength(2);
    expect(firstPsalmHeading?.texts.la?.[0]?.value).toBe('Psalmus 95 [1]');
  }, 120_000);

  it('uses ferial psalmody with Paschal Alleluia for St Peter Martyr on 2026-04-29', async () => {
    const app = await fullApp();
    const response = await app.inject(
      '/api/v1/days/2026-04-29?rubrics=1960&hours=all&lang=la,en'
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary.celebration).toMatchObject({
      feast: {
        path: 'Sancti/04-29',
        title: 'S. Petri Martyris'
      },
      rank: {
        classSymbol: 'III'
      }
    });
    expect(body.summary.temporal.feast).toMatchObject({
      path: 'Tempora/Pasc3-3Feria',
      title: 'Feria Quarta infra Hebdomadam III post Octavam Paschæ'
    });
    expect(body.summary.warnings).toEqual([]);
    expect(body.warnings.rubrical).toEqual([]);

    for (const hour of ['lauds', 'prime', 'terce', 'sext', 'none', 'vespers'] as const) {
      expect(firstAntiphonText(body, hour)).toMatch(
        /^Allelú[ij]a, \* allelú[ij]a, allelú[ij]a\.$/u
      );
      expect(body.warnings.composition[hour]).toEqual([]);
      expect(body.hours[hour].warnings).toEqual([]);
    }

    expect(firstAntiphonText(body, 'matins')).toMatch(
      /^Allelú[ij]a, \* allelú[ij]a, allelú[ij]a\.$/u
    );
    expect(firstInvitatoryAntiphonText(body, 'matins')).toMatch(
      /^Exsúltent in Dómino sancti, \* Allelú[ij]a\.$/u
    );
    expect(firstPsalmHeading(body, 'matins')).toMatch(/^Psalmus 44/u);
    expect(firstPsalmHeading(body, 'lauds')).toBe('Psalmus 96 [1]');
    expect(firstPsalmHeading(body, 'prime')).toBe('Psalmus 25 [1]');
    expect(firstPsalmHeading(body, 'terce')).toBe('Psalmus 53 [1]');
    expect(firstPsalmHeading(body, 'sext')).toBe('Psalmus 55 [1]');
    expect(firstPsalmHeading(body, 'none')).toBe('Psalmus 58(2-11) [1]');
    expect(firstPsalmHeading(body, 'vespers')).toBe('Psalmus 127 [1]');
    expect(firstAntiphonText(body, 'compline')).not.toMatch(/^Allelú[ij]a,/u);

    expect(firstLineText(body, 'matins', 'hymn', 'en')).toBe(
      'O God, of those that fought thy fight,'
    );
    expect(firstLineText(body, 'matins', 'hymn', 'en')).not.toBe(
      firstLineText(body, 'matins', 'hymn', 'la')
    );
    expect(firstLineText(body, 'matins', 'responsory', 'en')).toBe(
      'Thy streets, O Jerusalem, shall bel paved with pure gold, Alleluia, and the song of joy shall be sung in thee. Alleluia.'
    );
    expect(slotLineTexts(body, 'matins', 'responsory', 'la', 1).slice(-3)).toEqual([
      'Glória Patri, et Fílio, * et Spirítui Sancto.',
      'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
      'Et David cum cantóribus cítharam percutiébat in domo Dómini, et laudes Deo canébat, allelúia, allelúia.'
    ]);
    expect(slotLineTexts(body, 'matins', 'responsory', 'en', 1).slice(-3)).toEqual([
      'Glory be to the Father, and to the Son, * and to the Holy Ghost.',
      'As it was in the beginning, is now, * and ever shall be, world without end. Amen.',
      'And David was with the singers, (and) played upon an harp in the house of the Lord, and sung praises unto God. Alleluia, Alleluia.'
    ]);
    expect(firstLineText(body, 'matins', 'lectio-brevis', 'en')).toContain(
      'Lesson from the book of Revelation'
    );
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

function firstAntiphonText(
  body: {
    readonly hours: Record<string, { readonly sections: readonly ApiSection[] }>;
  },
  hour: string
): string | undefined {
  const psalmody = psalmodySection(body, hour);
  return psalmody?.lines.find((line) => line.marker === 'Ant.')?.texts.la?.[0]?.value;
}

function firstPsalmHeading(
  body: {
    readonly hours: Record<string, { readonly sections: readonly ApiSection[] }>;
  },
  hour: string
): string | undefined {
  const psalmody = psalmodySection(body, hour);
  return psalmody?.lines
    .flatMap((line) => line.texts.la ?? [])
    .find((node) => node.type === 'text' && /^Psalmus \d+/u.test(node.value))
    ?.value;
}

function firstInvitatoryAntiphonText(
  body: {
    readonly hours: Record<string, { readonly sections: readonly ApiSection[] }>;
  },
  hour: string
): string | undefined {
  const invitatory = body.hours[hour]?.sections.find((section) => section.slot === 'invitatory');
  return invitatory?.lines.find((line) => line.marker === 'Ant.')?.texts.la?.[0]?.value;
}

function psalmodySection(
  body: {
    readonly hours: Record<string, { readonly sections: readonly ApiSection[] }>;
  },
  hour: string
): ApiSection | undefined {
  return body.hours[hour]?.sections.find((section) => section.slot === 'psalmody');
}

function firstLineText(
  body: {
    readonly hours: Record<string, { readonly sections: readonly ApiSection[] }>;
  },
  hour: string,
  slot: string,
  language: 'la' | 'en'
): string | undefined {
  const section = body.hours[hour]?.sections.find((candidate) => candidate.slot === slot);
  const line = section?.lines.find((candidate) => candidate.texts[language]?.length);
  return line?.texts[language]?.map((run) => run.value).join('');
}

function slotLineTexts(
  body: {
    readonly hours: Record<string, { readonly sections: readonly ApiSection[] }>;
  },
  hour: string,
  slot: string,
  language: 'la' | 'en',
  sectionIndex = 0
): readonly string[] {
  const section = body.hours[hour]?.sections.filter((candidate) => candidate.slot === slot)[
    sectionIndex
  ];
  return (
    section?.lines
      .map((line) => line.texts[language]?.map((run) => run.value).join('') ?? '')
      .filter(Boolean) ?? []
  );
}

interface ApiSection {
  readonly slot: string;
  readonly lines: readonly Array<{
    readonly marker?: string;
    readonly texts: {
      readonly la?: readonly Array<{
        readonly type: string;
        readonly value: string;
      }>;
      readonly en?: readonly Array<{
        readonly type: string;
        readonly value: string;
      }>;
    };
  }>;
}
