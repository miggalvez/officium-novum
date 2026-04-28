import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

import {
  composeOfficeDay,
  resolveDayRequest,
  type DayQuery
} from '../services/compose-day.js';
import {
  applyCacheHeaders,
  buildDeterministicEtag,
  createEtagMemoryCache,
  dayResponseCacheKey,
  requestMatchesEtag
} from '../services/cache.js';
import {
  ApiErrorSchema,
  DaySummarySchema,
  PublicComposedHourSchema,
  VersionDescriptorSchema,
  WarningSchema
} from '../schemas/responses.js';

const dayEtags = createEtagMemoryCache();

const OfficeDayResponseSchema = Type.Object({
  kind: Type.Literal('office-day'),
  apiVersion: Type.Literal('v1'),
  request: Type.Object({
    date: Type.String(),
    version: Type.String(),
    languages: Type.Array(Type.String()),
    langfb: Type.Optional(Type.String()),
    orthography: Type.Union([Type.Literal('source'), Type.Literal('version')]),
    hours: Type.Array(Type.String()),
    strict: Type.Boolean()
  }),
  version: VersionDescriptorSchema,
  summary: DaySummarySchema,
  hours: Type.Record(Type.String(), PublicComposedHourSchema),
  warnings: Type.Object({
    rubrical: Type.Array(WarningSchema),
    composition: Type.Record(Type.String(), Type.Array(WarningSchema))
  }),
  meta: Type.Object({
    contentVersion: Type.String(),
    canonicalPath: Type.String(),
    quality: Type.Union([Type.Literal('complete'), Type.Literal('partial')])
  })
});

export async function registerDayRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { date: string };
    Querystring: DayQuery;
  }>('/api/v1/days/:date', {
    schema: {
      params: Type.Object({
        date: Type.String()
      }),
      querystring: Type.Object({
        version: Type.Optional(Type.String()),
        rubrics: Type.Optional(Type.String()),
        lang: Type.Optional(Type.String()),
        langfb: Type.Optional(Type.String()),
        orthography: Type.Optional(Type.String()),
        hours: Type.Optional(Type.String()),
        strict: Type.Optional(Type.Union([Type.Boolean(), Type.String()]))
      }),
      response: {
        200: OfficeDayResponseSchema,
        304: Type.Null(),
        400: ApiErrorSchema,
        422: ApiErrorSchema,
        501: ApiErrorSchema,
        500: ApiErrorSchema
      }
    }
  }, async function dayHandler(request, reply) {
    const resolved = resolveDayRequest({
      context: app.apiContext,
      dateParam: request.params.date,
      query: request.query
    });
    const cachedEtag = dayEtags.get(resolved.cacheKey);
    if (cachedEtag) {
      applyCacheHeaders(reply, cachedEtag);
      if (requestMatchesEtag(request, cachedEtag)) {
        return reply.code(304).send();
      }
    }

    const body = composeOfficeDay({
      context: app.apiContext,
      dateParam: request.params.date,
      query: request.query,
      resolved
    });
    const etag = buildDeterministicEtag({
      key: dayResponseCacheKey(body),
      body
    });
    dayEtags.set(resolved.cacheKey, etag);
    applyCacheHeaders(reply, etag);
    if (requestMatchesEtag(request, etag)) {
      return reply.code(304).send();
    }
    return body;
  });
}
