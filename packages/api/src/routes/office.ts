import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

import { composeOfficeHour, type OfficeQuery } from '../services/compose-office.js';

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

const VersionDescriptorSchema = Type.Object({
  handle: Type.String(),
  kalendar: Type.String(),
  transfer: Type.String(),
  stransfer: Type.String(),
  base: Type.Optional(Type.String()),
  transferBase: Type.Optional(Type.String()),
  policyName: Type.String()
});

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
  summary: Type.Any(),
  office: Type.Object({
    date: Type.String(),
    hour: Type.String(),
    celebration: Type.String(),
    languages: Type.Array(Type.String()),
    orthography: Type.Union([Type.Literal('source'), Type.Literal('version')]),
    sections: Type.Array(Type.Any()),
    warnings: Type.Array(Type.Any())
  }),
  warnings: Type.Object({
    rubrical: Type.Array(Type.Any()),
    composition: Type.Array(Type.Any())
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
        400: ApiErrorSchema,
        422: ApiErrorSchema,
        501: ApiErrorSchema,
        500: ApiErrorSchema
      }
    }
  }, async function officeHandler(request) {
    return composeOfficeHour({
      context: app.apiContext,
      dateParam: request.params.date,
      hourParam: request.params.hour,
      query: request.query
    });
  });
}
