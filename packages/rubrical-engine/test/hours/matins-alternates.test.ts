import { parseRuleLine } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  selectLessonAlternate,
  type LessonSetAlternate,
  type ResolvedVersion,
  type TemporalContext
} from '../../src/index.js';
import { makeTestPolicy } from '../policy-fixture.js';

const version1960: ResolvedVersion = {
  handle: asVersionHandle('Rubrics 1960 - 1960'),
  kalendar: '1960',
  transfer: '1960',
  stransfer: '1960',
  policy: makeTestPolicy('rubrics-1960')
};

describe('selectLessonAlternate', () => {
  it('selects an ungated alternate for the matching nocturn', () => {
    const selected = selectLessonAlternate({
      nocturn: 3,
      alternates: [{ nocturn: 3, alternate: { location: 2 } }],
      temporal: temporal('2024-08-15', 'Pent11-4')
    });

    expect(selected.location).toBe(2);
  });

  it('selects a gate constrained to rubrica 1960 in a 1960 context', () => {
    const selected = selectLessonAlternate({
      nocturn: 3,
      alternates: [
        {
          nocturn: 3,
          alternate: {
            location: 3,
            gate: parseGate('(rubrica 1960) No prima Vespera')
          }
        }
      ],
      temporal: temporal('2024-08-15', 'Pent11-4'),
      version: version1960
    });

    expect(selected.location).toBe(3);
  });

  it('falls back to location 1 when gate does not match', () => {
    const selected = selectLessonAlternate({
      nocturn: 3,
      alternates: [
        {
          nocturn: 3,
          alternate: {
            location: 2,
            gate: parseGate('(rubrica tridentina) No prima Vespera')
          }
        }
      ],
      temporal: temporal('2024-08-15', 'Pent11-4'),
      version: version1960
    });

    expect(selected.location).toBe(1);
  });

  it('falls back to location 1 when no alternates are present', () => {
    const selected = selectLessonAlternate({
      nocturn: 1,
      alternates: [],
      temporal: temporal('2024-08-15', 'Pent11-4'),
      version: version1960
    });

    expect(selected.location).toBe(1);
  });
});

function temporal(date: string, dayName: string): TemporalContext {
  return {
    date,
    dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season: 'time-after-pentecost',
    feastRef: {
      path: `Tempora/${dayName}`,
      id: `Tempora/${dayName}`,
      title: dayName
    },
    rank: {
      name: 'IV classis',
      classSymbol: 'IV',
      weight: 100
    }
  };
}

function parseGate(line: string): NonNullable<LessonSetAlternate['alternate']['gate']> {
  const directive = parseRuleLine(line);
  if (!directive?.condition) {
    throw new Error(`Expected a condition in directive: ${line}`);
  }
  return directive.condition;
}
