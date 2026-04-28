import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

import { toVersionInfoDto } from '../services/version-registry.js';

const ApiErrorSchema = Type.Object({
  kind: Type.Literal('error'),
  apiVersion: Type.Literal('v1'),
  code: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Record(Type.String(), Type.Union([
    Type.String(),
    Type.Number(),
    Type.Boolean(),
    Type.Null()
  ]))),
  hints: Type.Optional(Type.Array(Type.String()))
});

export async function registerMetadataRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/status', {
    schema: {
      response: {
        200: Type.Object({
          kind: Type.Literal('status'),
          apiVersion: Type.Literal('v1'),
          status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
          content: Type.Object({
            contentVersion: Type.String(),
            corpusFileCount: Type.Optional(Type.Number())
          }),
          support: Type.Object({
            supportedHours: Type.Array(Type.String()),
            supportedVersionCount: Type.Number(),
            deferredVersionCount: Type.Number(),
            missaOnlyVersionCount: Type.Number()
          })
        }),
        500: ApiErrorSchema
      }
    }
  }, async function statusHandler() {
    const versionCounts = countVersionsByStatus(app.apiContext.versions.values());
    return {
      kind: 'status',
      apiVersion: 'v1',
      status: 'ok',
      content: {
        contentVersion: app.apiContext.contentVersion,
        ...(app.apiContext.corpusFileCount === undefined
          ? {}
          : { corpusFileCount: app.apiContext.corpusFileCount })
      },
      support: {
        supportedHours: [...app.apiContext.supportedHours],
        supportedVersionCount: versionCounts.supported,
        deferredVersionCount: versionCounts.deferred,
        missaOnlyVersionCount: versionCounts['missa-only']
      }
    };
  });

  app.get('/api/v1/versions', {
    schema: {
      response: {
        200: Type.Object({
          kind: Type.Literal('versions'),
          apiVersion: Type.Literal('v1'),
          defaultVersion: Type.String(),
          versions: Type.Array(Type.Object({
            handle: Type.String(),
            status: Type.Union([
              Type.Literal('supported'),
              Type.Literal('deferred'),
              Type.Literal('missa-only')
            ]),
            policyName: Type.Optional(Type.String()),
            kalendar: Type.Optional(Type.String()),
            transfer: Type.Optional(Type.String()),
            stransfer: Type.Optional(Type.String()),
            base: Type.Optional(Type.String()),
            transferBase: Type.Optional(Type.String()),
            aliases: Type.Array(Type.String()),
            hint: Type.Optional(Type.String())
          }))
        }),
        500: ApiErrorSchema
      }
    }
  }, async function versionsHandler() {
    return {
      kind: 'versions',
      apiVersion: 'v1',
      defaultVersion: app.apiContext.defaultVersion.handle,
      versions: Array.from(app.apiContext.versions.values()).map(toVersionInfoDto)
    };
  });

  app.get('/api/v1/languages', {
    schema: {
      response: {
        200: Type.Object({
          kind: Type.Literal('languages'),
          apiVersion: Type.Literal('v1'),
          languages: Type.Array(Type.Object({
            tag: Type.String(),
            corpusName: Type.String(),
            label: Type.String(),
            defaultFallback: Type.Optional(Type.String())
          }))
        }),
        500: ApiErrorSchema
      }
    }
  }, async function languagesHandler() {
    return {
      kind: 'languages',
      apiVersion: 'v1',
      languages: Array.from(app.apiContext.languages.values())
    };
  });
}

function countVersionsByStatus(
  entries: Iterable<{ readonly status: 'supported' | 'deferred' | 'missa-only' }>
): Record<'supported' | 'deferred' | 'missa-only', number> {
  const counts = {
    supported: 0,
    deferred: 0,
    'missa-only': 0
  };
  for (const entry of entries) {
    counts[entry.status] += 1;
  }
  return counts;
}
