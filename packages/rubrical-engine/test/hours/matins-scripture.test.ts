import { describe, expect, it } from 'vitest';

import {
  applyScriptureTransfer,
  asVersionHandle,
  buildScriptureTransferTable,
  buildVersionRegistry,
  computeYearKey,
  type MatinsPlan,
  type ScriptureTransferTable,
  type ScriptureTransferEntry,
  type ResolvedVersion
} from '../../src/index.js';
import { makeTestPolicy } from '../policy-fixture.js';

const registry = buildVersionRegistry([
  {
    version: 'Rubrics 1960 - 1960',
    kalendar: '1960',
    transfer: '1960',
    stransfer: '1960'
  }
]);

const version: ResolvedVersion = {
  handle: asVersionHandle('Rubrics 1960 - 1960'),
  kalendar: '1960',
  transfer: '1960',
  stransfer: '1960',
  policy: makeTestPolicy('rubrics-1960')
};

describe('applyScriptureTransfer', () => {
  it('applies operation R by rewriting scripture-kind lessons only', () => {
    const transfer = transferFor(2024, '07-09', 'Pent07-0', 'R');
    const warnings: Parameters<typeof applyScriptureTransfer>[2] = [];

    const updated = applyScriptureTransfer(oneNocturnPlan(), transfer, warnings);

    const firstLesson = updated.nocturnPlan[0]?.lessons[0];
    expect(firstLesson?.source.kind).toBe('scripture-transferred');
    if (firstLesson?.source.kind === 'scripture-transferred') {
      expect(firstLesson.source.op).toBe('R');
    }
    expect(updated.totalLessons).toBe(3);
    expect(warnings.some((warning) => warning.code === 'matins-scripture-transfer-applied')).toBe(true);
  });

  it('applies operation B to the first scripture lesson and keeps counts unchanged', () => {
    const transfer = transferFor(2024, '07-09', 'Pent07-0', 'B');
    const updated = applyScriptureTransfer(oneNocturnPlan(), transfer, []);

    const firstLesson = updated.nocturnPlan[0]?.lessons[0];
    expect(firstLesson?.source.kind).toBe('scripture-transferred');
    if (firstLesson?.source.kind === 'scripture-transferred') {
      expect(firstLesson.source.op).toBe('B');
    }
    expect(updated.totalLessons).toBe(3);
  });

  it('applies operation A on 1-nocturn ferial shape by appending lesson 4', () => {
    const transfer = transferFor(2024, '07-09', 'Pent07-0', 'A');
    const updated = applyScriptureTransfer(oneNocturnPlan(), transfer, []);

    expect(updated.totalLessons).toBe(4);
    expect(updated.lessonsPerNocturn[0]).toBe(4);
    const appended = updated.nocturnPlan[0]?.lessons.at(-1);
    expect(appended?.source.kind).toBe('scripture-transferred');
    if (appended?.source.kind === 'scripture-transferred') {
      expect(appended.source.op).toBe('A');
    }
  });

  it('applies operation A on 3x3 shape by appending to nocturn 1 and reporting total 10', () => {
    const transfer = transferFor(2024, '07-09', 'Pent07-0', 'A');
    const updated = applyScriptureTransfer(threeNocturnPlan(), transfer, []);

    expect(updated.totalLessons).toBe(10);
    expect(updated.lessonsPerNocturn[0]).toBe(4);
    expect(updated.nocturnPlan[0]?.lessons).toHaveLength(4);
  });

  it('does not rewrite non-scripture lessons', () => {
    const transfer = transferFor(2024, '07-09', 'Pent07-0', 'R');
    const plan = oneNocturnPlan({ firstKind: 'patristic' });

    const updated = applyScriptureTransfer(plan, transfer, []);

    expect(updated.nocturnPlan[0]?.lessons[0]?.source.kind).toBe('patristic');
  });
});

function transferFor(
  year: number,
  dateKey: string,
  target: string,
  operation: 'R' | 'B' | 'A'
): ScriptureTransferEntry {
  const yearKey = computeYearKey(year).letter;
  const table: ScriptureTransferTable = buildScriptureTransferTable([
    {
      yearKey,
      entries: [
        {
          dateKey,
          target,
          operation
        }
      ]
    }
  ]);

  const [level] = table.lookup({
    date: { year, month: 7, day: 9 },
    version,
    registry
  });
  const entry = level?.entries[0];
  if (!entry) {
    throw new Error('Failed to materialize scripture transfer entry from synthetic table.');
  }

  return entry;
}

function oneNocturnPlan(options: { firstKind?: 'scripture' | 'patristic' } = {}): MatinsPlan {
  const firstKind = options.firstKind ?? 'scripture';

  return {
    hour: 'matins',
    nocturns: 1,
    totalLessons: 3,
    lessonsPerNocturn: [3],
    invitatorium: { kind: 'season', reference: ref('horas/Latin/Psalterium/Invitatorium', 'Tempus') },
    hymn: { kind: 'ordinary', reference: ref('horas/Ordinarium/Matutinum', 'Hymnus') },
    nocturnPlan: [
      {
        index: 1,
        psalmody: [],
        antiphons: [],
        versicle: { reference: ref('horas/Latin/Tempora/Pent07-2', 'Nocturn 1 Versum') },
        lessonIntroduction: 'ordinary',
        lessons: [
          {
            index: 1,
            source:
              firstKind === 'scripture'
                ? {
                    kind: 'scripture',
                    course: 'post-pentecost',
                    pericope: {
                      book: 'post-pentecost',
                      reference: ref('horas/Latin/Tempora/Pent07-2', 'Lectio1')
                    }
                  }
                : {
                    kind: 'patristic',
                    reference: ref('horas/Latin/Tempora/Pent07-2', 'Lectio1')
                  }
          },
          {
            index: 2,
            source: {
              kind: 'scripture',
              course: 'post-pentecost',
              pericope: {
                book: 'post-pentecost',
                reference: ref('horas/Latin/Tempora/Pent07-2', 'Lectio2')
              }
            }
          },
          {
            index: 3,
            source: {
              kind: 'scripture',
              course: 'post-pentecost',
              pericope: {
                book: 'post-pentecost',
                reference: ref('horas/Latin/Tempora/Pent07-2', 'Lectio3')
              }
            }
          }
        ],
        responsories: [
          { index: 1, reference: ref('horas/Latin/Tempora/Pent07-2', 'Responsory1') },
          { index: 2, reference: ref('horas/Latin/Tempora/Pent07-2', 'Responsory2') },
          { index: 3, reference: ref('horas/Latin/Tempora/Pent07-2', 'Responsory3') }
        ]
      }
    ],
    teDeum: 'replace-with-responsory'
  };
}

function threeNocturnPlan(): MatinsPlan {
  return {
    hour: 'matins',
    nocturns: 3,
    totalLessons: 9,
    lessonsPerNocturn: [3, 3, 3],
    invitatorium: { kind: 'season', reference: ref('horas/Latin/Psalterium/Invitatorium', 'Tempus') },
    hymn: { kind: 'ordinary', reference: ref('horas/Ordinarium/Matutinum', 'Hymnus') },
    nocturnPlan: [
      {
        index: 1,
        psalmody: [],
        antiphons: [],
        versicle: { reference: ref('horas/Latin/Tempora/Adv2-0', 'Nocturn 1 Versum') },
        lessonIntroduction: 'ordinary',
        lessons: [
          scriptureLesson(1),
          scriptureLesson(2),
          scriptureLesson(3)
        ],
        responsories: [
          { index: 1, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory1') },
          { index: 2, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory2') },
          { index: 3, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory3') }
        ]
      },
      {
        index: 2,
        psalmody: [],
        antiphons: [],
        versicle: { reference: ref('horas/Latin/Tempora/Adv2-0', 'Nocturn 2 Versum') },
        lessonIntroduction: 'ordinary',
        lessons: [
          { index: 4, source: { kind: 'hagiographic', reference: ref('horas/Latin/Tempora/Adv2-0', 'Lectio4') } },
          { index: 5, source: { kind: 'hagiographic', reference: ref('horas/Latin/Tempora/Adv2-0', 'Lectio5') } },
          { index: 6, source: { kind: 'hagiographic', reference: ref('horas/Latin/Tempora/Adv2-0', 'Lectio6') } }
        ],
        responsories: [
          { index: 4, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory4') },
          { index: 5, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory5') },
          { index: 6, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory6') }
        ]
      },
      {
        index: 3,
        psalmody: [],
        antiphons: [],
        versicle: { reference: ref('horas/Latin/Tempora/Adv2-0', 'Nocturn 3 Versum') },
        lessonIntroduction: 'ordinary',
        lessons: [
          {
            index: 7,
            source: {
              kind: 'homily-on-gospel',
              gospel: { book: 'evangelium', reference: ref('horas/Latin/Tempora/Adv2-0', 'Lectio7') }
            }
          },
          {
            index: 8,
            source: {
              kind: 'homily-on-gospel',
              gospel: { book: 'evangelium', reference: ref('horas/Latin/Tempora/Adv2-0', 'Lectio7') }
            }
          },
          {
            index: 9,
            source: {
              kind: 'homily-on-gospel',
              gospel: { book: 'evangelium', reference: ref('horas/Latin/Tempora/Adv2-0', 'Lectio7') }
            }
          }
        ],
        responsories: [
          { index: 7, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory7') },
          { index: 8, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory8') },
          { index: 9, reference: ref('horas/Latin/Tempora/Adv2-0', 'Responsory9') }
        ]
      }
    ],
    teDeum: 'say'
  };
}

function scriptureLesson(index: 1 | 2 | 3) {
  return {
    index,
    source: {
      kind: 'scripture' as const,
      course: 'advent-isaias' as const,
      pericope: {
        book: 'advent-isaias',
        reference: ref('horas/Latin/Tempora/Adv2-0', `Lectio${index}`)
      }
    }
  };
}

function ref(path: string, section: string) {
  return { path, section } as const;
}
