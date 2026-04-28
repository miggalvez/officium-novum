import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

import {
  composeCalendarMonth,
  resolveCalendarMonthRequest,
  type CalendarQuery
} from '../services/compose-calendar.js';
import {
  applyCacheHeaders,
  buildDeterministicEtag,
  calendarResponseCacheKey,
  createEtagMemoryCache,
  requestMatchesEtag
} from '../services/cache.js';
import {
  ApiErrorSchema,
  CelebrationSchema,
  CommemorationSchema,
  VersionDescriptorSchema,
  WarningSchema
} from '../schemas/responses.js';

const calendarEtags = createEtagMemoryCache();

const CalendarMonthResponseSchema = Type.Object({
  kind: Type.Literal('calendar-month'),
  apiVersion: Type.Literal('v1'),
  request: Type.Object({
    year: Type.String(),
    version: Type.String()
  }),
  year: Type.Number(),
  month: Type.Number(),
  version: VersionDescriptorSchema,
  days: Type.Array(Type.Object({
    date: Type.String(),
    dayOfWeek: Type.Number(),
    season: Type.String(),
    celebration: CelebrationSchema,
    commemorations: Type.Array(CommemorationSchema),
    warnings: Type.Array(WarningSchema)
  })),
  meta: Type.Object({
    contentVersion: Type.String(),
    canonicalPath: Type.String()
  })
});

export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { year: string; month: string };
    Querystring: CalendarQuery;
  }>('/api/v1/calendar/:year/:month', {
    schema: {
      params: Type.Object({
        year: Type.String(),
        month: Type.String()
      }),
      querystring: Type.Object({
        version: Type.Optional(Type.String()),
        rubrics: Type.Optional(Type.String())
      }),
      response: {
        200: CalendarMonthResponseSchema,
        304: Type.Null(),
        400: ApiErrorSchema,
        422: ApiErrorSchema,
        501: ApiErrorSchema,
        500: ApiErrorSchema
      }
    }
  }, async function calendarHandler(request, reply) {
    const resolved = resolveCalendarMonthRequest({
      context: app.apiContext,
      yearParam: request.params.year,
      monthParam: request.params.month,
      query: request.query
    });
    const cachedEtag = calendarEtags.get(resolved.cacheKey);
    if (cachedEtag) {
      applyCacheHeaders(reply, cachedEtag);
      if (requestMatchesEtag(request, cachedEtag)) {
        return reply.code(304).send();
      }
    }

    const body = composeCalendarMonth({
      context: app.apiContext,
      yearParam: request.params.year,
      monthParam: request.params.month,
      query: request.query,
      resolved
    });
    const etag = buildDeterministicEtag({
      key: calendarResponseCacheKey(body),
      body
    });
    calendarEtags.set(resolved.cacheKey, etag);
    applyCacheHeaders(reply, etag);
    if (requestMatchesEtag(request, etag)) {
      return reply.code(304).send();
    }
    return body;
  });
}
