import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

import {
  composeOfficeHour,
  resolveOfficeRequest,
  type OfficeQuery
} from '../services/compose-office.js';
import {
  applyCacheHeaders,
  buildDeterministicEtag,
  createEtagMemoryCache,
  officeResponseCacheKey,
  requestMatchesEtag
} from '../services/cache.js';
import {
  ApiErrorSchema,
  DaySummarySchema,
  PublicComposedHourSchema,
  VersionDescriptorSchema,
  WarningSchema
} from '../schemas/responses.js';

const officeEtags = createEtagMemoryCache();

const OfficeHourResponseSchema = Type.Object({
  kind: Type.Literal('office-hour'),
  apiVersion: Type.Literal('v1'),
  request: Type.Object({
    date: Type.String(),
    hour: Type.String(),
    version: Type.String(),
    languages: Type.Array(Type.String()),
    langfb: Type.Optional(Type.String()),
    orthography: Type.Union([Type.Literal('source'), Type.Literal('version')]),
    joinLaudsToMatins: Type.Boolean(),
    strict: Type.Boolean()
  }),
  version: VersionDescriptorSchema,
  summary: DaySummarySchema,
  office: PublicComposedHourSchema,
  warnings: Type.Object({
    rubrical: Type.Array(WarningSchema),
    composition: Type.Array(WarningSchema)
  }),
  meta: Type.Object({
    contentVersion: Type.String(),
    canonicalPath: Type.String(),
    quality: Type.Union([Type.Literal('complete'), Type.Literal('partial')])
  })
});

export async function registerOfficeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { date: string; hour: string };
    Querystring: OfficeQuery;
  }>('/api/v1/office/:date/:hour', {
    schema: {
      params: Type.Object({
        date: Type.String(),
        hour: Type.String()
      }),
      querystring: Type.Object({
        version: Type.Optional(Type.String()),
        rubrics: Type.Optional(Type.String()),
        lang: Type.Optional(Type.String()),
        langfb: Type.Optional(Type.String()),
        orthography: Type.Optional(Type.String()),
        joinLaudsToMatins: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
        strict: Type.Optional(Type.Union([Type.Boolean(), Type.String()]))
      }),
      response: {
        200: OfficeHourResponseSchema,
        304: Type.Null(),
        400: ApiErrorSchema,
        422: ApiErrorSchema,
        501: ApiErrorSchema,
        500: ApiErrorSchema
      }
    }
  }, async function officeHandler(request, reply) {
    const resolved = resolveOfficeRequest({
      context: app.apiContext,
      dateParam: request.params.date,
      hourParam: request.params.hour,
      query: request.query
    });
    const cachedEtag = officeEtags.get(resolved.cacheKey);
    if (cachedEtag) {
      applyCacheHeaders(reply, cachedEtag);
      if (requestMatchesEtag(request, cachedEtag)) {
        return reply.code(304).send();
      }
    }

    const body = composeOfficeHour({
      context: app.apiContext,
      dateParam: request.params.date,
      hourParam: request.params.hour,
      query: request.query,
      resolved
    });
    const etag = buildDeterministicEtag({
      key: officeResponseCacheKey(body),
      body
    });
    officeEtags.set(resolved.cacheKey, etag);
    applyCacheHeaders(reply, etag);
    if (requestMatchesEtag(request, etag)) {
      return reply.code(304).send();
    }
    return body;
  });
}
