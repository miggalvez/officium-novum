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

const dayEtags = createEtagMemoryCache();

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

const WarningSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  severity: Type.Union([
    Type.Literal('info'),
    Type.Literal('warn'),
    Type.Literal('error')
  ]),
  context: Type.Optional(Type.Record(Type.String(), Type.String()))
});

const FeastRefSchema = Type.Object({
  id: Type.String(),
  path: Type.String(),
  title: Type.String()
});

const RankSchema = Type.Object({
  name: Type.String(),
  classSymbol: Type.String(),
  weight: Type.Number()
});

const OctaveDaySchema = Type.Union([
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
  Type.Literal(5),
  Type.Literal(6),
  Type.Literal(7),
  Type.Literal(8)
]);

const CelebrationSchema = Type.Object({
  feast: FeastRefSchema,
  rank: RankSchema,
  source: Type.Union([Type.Literal('temporal'), Type.Literal('sanctoral')]),
  kind: Type.Optional(Type.Union([Type.Literal('vigil'), Type.Literal('octave')])),
  octaveDay: Type.Optional(OctaveDaySchema),
  transferredFrom: Type.Optional(Type.String())
});

const CommemorationSchema = Type.Object({
  feast: FeastRefSchema,
  rank: RankSchema,
  reason: Type.String(),
  hours: Type.Array(Type.String()),
  kind: Type.Optional(Type.Union([Type.Literal('vigil'), Type.Literal('octave')])),
  octaveDay: Type.Optional(OctaveDaySchema),
  color: Type.Optional(Type.String())
});

const CandidateSchema = Type.Object({
  feast: FeastRefSchema,
  rank: RankSchema,
  source: Type.Union([
    Type.Literal('temporal'),
    Type.Literal('sanctoral'),
    Type.Literal('transferred-in')
  ]),
  kind: Type.Optional(Type.Union([Type.Literal('vigil'), Type.Literal('octave')])),
  octaveDay: Type.Optional(OctaveDaySchema),
  transferredFrom: Type.Optional(Type.String())
});

const DaySummarySchema = Type.Object({
  date: Type.String(),
  version: VersionDescriptorSchema,
  temporal: Type.Object({
    date: Type.String(),
    dayOfWeek: Type.Number(),
    dayName: Type.String(),
    weekStem: Type.String(),
    season: Type.String(),
    feast: FeastRefSchema,
    rank: RankSchema
  }),
  celebration: CelebrationSchema,
  commemorations: Type.Array(CommemorationSchema),
  concurrence: Type.Object({
    winner: Type.Union([Type.Literal('today'), Type.Literal('tomorrow')])
  }),
  candidates: Type.Array(CandidateSchema),
  warnings: Type.Array(WarningSchema)
});

const ComposedRunSchema = Type.Union([
  Type.Object({
    type: Type.Literal('text'),
    value: Type.String()
  }),
  Type.Object({
    type: Type.Literal('rubric'),
    value: Type.String()
  }),
  Type.Object({
    type: Type.Literal('citation'),
    value: Type.String()
  }),
  Type.Object({
    type: Type.Literal('unresolved-macro'),
    name: Type.String()
  }),
  Type.Object({
    type: Type.Literal('unresolved-formula'),
    name: Type.String()
  }),
  Type.Object({
    type: Type.Literal('unresolved-reference'),
    ref: Type.Unknown()
  })
]);

const SectionSchema = Type.Object({
  type: Type.String(),
  slot: Type.String(),
  reference: Type.Optional(Type.String()),
  languages: Type.Array(Type.String()),
  heading: Type.Optional(Type.Object({
    kind: Type.Union([Type.Literal('nocturn'), Type.Literal('lesson')]),
    ordinal: Type.Number()
  })),
  lines: Type.Array(Type.Object({
    marker: Type.Optional(Type.String()),
    texts: Type.Record(Type.String(), Type.Array(ComposedRunSchema))
  }))
});

const PublicComposedHourSchema = Type.Object({
  date: Type.String(),
  hour: Type.String(),
  celebration: Type.String(),
  languages: Type.Array(Type.String()),
  orthography: Type.Union([Type.Literal('source'), Type.Literal('version')]),
  sections: Type.Array(SectionSchema),
  warnings: Type.Array(WarningSchema)
});

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
