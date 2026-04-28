import { Type } from '@sinclair/typebox';

export const ApiErrorSchema = Type.Object({
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

export const VersionDescriptorSchema = Type.Object({
  handle: Type.String(),
  kalendar: Type.String(),
  transfer: Type.String(),
  stransfer: Type.String(),
  base: Type.Optional(Type.String()),
  transferBase: Type.Optional(Type.String()),
  policyName: Type.String()
});

export const WarningSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  severity: Type.Union([
    Type.Literal('info'),
    Type.Literal('warn'),
    Type.Literal('error')
  ]),
  context: Type.Optional(Type.Record(Type.String(), Type.String()))
});

export const FeastRefSchema = Type.Object({
  id: Type.String(),
  path: Type.String(),
  title: Type.String()
});

export const RankSchema = Type.Object({
  name: Type.String(),
  classSymbol: Type.String(),
  weight: Type.Number()
});

export const OctaveDaySchema = Type.Union([
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
  Type.Literal(5),
  Type.Literal(6),
  Type.Literal(7),
  Type.Literal(8)
]);

export const CelebrationSchema = Type.Object({
  feast: FeastRefSchema,
  rank: RankSchema,
  source: Type.Union([Type.Literal('temporal'), Type.Literal('sanctoral')]),
  kind: Type.Optional(Type.Union([Type.Literal('vigil'), Type.Literal('octave')])),
  octaveDay: Type.Optional(OctaveDaySchema),
  transferredFrom: Type.Optional(Type.String())
});

export const CommemorationSchema = Type.Object({
  feast: FeastRefSchema,
  rank: RankSchema,
  reason: Type.String(),
  hours: Type.Array(Type.String()),
  kind: Type.Optional(Type.Union([Type.Literal('vigil'), Type.Literal('octave')])),
  octaveDay: Type.Optional(OctaveDaySchema),
  color: Type.Optional(Type.String())
});

export const CandidateSchema = Type.Object({
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

export const DaySummarySchema = Type.Object({
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

export const ComposedRunSchema = Type.Union([
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

export const SectionSchema = Type.Object({
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

export const PublicComposedHourSchema = Type.Object({
  date: Type.String(),
  hour: Type.String(),
  celebration: Type.String(),
  languages: Type.Array(Type.String()),
  orthography: Type.Union([Type.Literal('source'), Type.Literal('version')]),
  sections: Type.Array(SectionSchema),
  warnings: Type.Array(WarningSchema)
});
