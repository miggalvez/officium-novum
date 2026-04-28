import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { buildApiContext } from '../src/context.js';
import { testVersionRegistry } from './helpers.js';

async function testApp() {
  const context = await buildApiContext({
    host: '127.0.0.1',
    port: 0,
    corpusPath: '.',
    contentVersion: 'test-content',
    logger: false,
    versionRegistry: testVersionRegistry()
  });
  return createApp({ context });
}

describe('metadata routes', () => {
  it('returns deterministic status metadata', async () => {
    const app = await testApp();
    const response = await app.inject('/api/v1/status');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: 'status',
      apiVersion: 'v1',
      status: 'ok',
      content: {
        contentVersion: 'test-content'
      },
      support: {
        supportedHours: [
          'matins',
          'lauds',
          'prime',
          'terce',
          'sext',
          'none',
          'vespers',
          'compline'
        ],
        supportedVersionCount: 5,
        deferredVersionCount: 10,
        missaOnlyVersionCount: 16
      }
    });
    await app.close();
  });

  it('separates supported, deferred, and missa-only versions', async () => {
    const app = await testApp();
    const response = await app.inject('/api/v1/versions');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.defaultVersion).toBe('Rubrics 1960 - 1960');
    expect(body.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handle: 'Rubrics 1960 - 1960',
          status: 'supported',
          policyName: 'rubrics-1960',
          aliases: ['1960']
        }),
        expect.objectContaining({
          handle: 'Monastic - 1963',
          status: 'deferred',
          policyName: 'monastic-1963'
        }),
        expect.objectContaining({
          handle: 'Rubrics 1960',
          status: 'missa-only',
          hint: 'Rubrics 1960 - 1960'
        }),
        expect.objectContaining({
          handle: 'New Mass',
          status: 'missa-only'
        })
      ])
    );
    await app.close();
  });

  it('returns public language tags with corpus-name mappings', async () => {
    const app = await testApp();
    const response = await app.inject('/api/v1/languages');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: 'languages',
      apiVersion: 'v1',
      languages: [
        {
          tag: 'la',
          corpusName: 'Latin',
          label: 'Latin'
        },
        {
          tag: 'en',
          corpusName: 'English',
          label: 'English',
          defaultFallback: 'la'
        }
      ]
    });
    await app.close();
  });
});
