import { describe, expect, it } from 'vitest';

import {
  resolveOccurrence,
  rubrics1960Policy,
  type Candidate,
  type ClassSymbol1960,
  type TemporalContext
} from '../../src/index.js';

describe('resolveOccurrence', () => {
  it('throws on an empty candidate list', () => {
    expect(() => resolveOccurrence([], temporal('2024-04-14', 'Pasc2-0'), rubrics1960Policy)).toThrow(
      'Cannot resolve occurrence from an empty candidate list.'
    );
  });

  it('returns the sole candidate as celebration when only one candidate exists', () => {
    const only = candidate('Tempora/Pasc2-0', 'temporal', 'II');
    const result = resolveOccurrence([only], temporal('2024-04-14', 'Pasc2-0'), rubrics1960Policy);

    expect(result.celebration.feastRef.path).toBe('Tempora/Pasc2-0');
    expect(result.commemorations).toEqual([]);
    expect(result.transferQueue).toEqual([]);
    expect(result.omitted).toEqual([]);
  });

  it('classifies loser fates across commemorate, transfer, and omit', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Pasc2-0', 'temporal', 'II'),
        candidate('Sancti/03-19', 'sanctoral', 'I'),
        candidate('Sancti/09-11', 'sanctoral', 'commemoration-only'),
        candidate('Sancti/10-07', 'sanctoral', 'III')
      ],
      temporal('2024-04-14', 'Pasc2-0'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Sancti/03-19');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual([
      'Tempora/Pasc2-0',
      'Sancti/10-07',
      'Sancti/09-11'
    ]);
    expect(result.transferQueue.map((entry) => entry.candidate.feastRef.path)).toEqual([]);
    expect(result.omitted).toEqual([]);
  });

  it('uses privileged-feria reason when a privileged feria loses to a first-class feast of the Lord', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Quadp3-3', 'temporal', 'I-privilegiata-ash-wednesday'),
        candidate('Sancti/01-06', 'sanctoral', 'I')
      ],
      temporal('2024-02-14', 'Quadp3-3'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Sancti/01-06');
    expect(result.commemorations).toHaveLength(1);
    expect(result.commemorations[0]?.reason).toBe('privileged-feria');
  });

  it('commemorates a Lenten feria when impeded by a II class sanctoral feast', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Quad2-2', 'temporal', 'IV-lenten-feria'),
        candidate('Sancti/09-15', 'sanctoral', 'II')
      ],
      temporal('2024-02-27', 'Quad2-2'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Sancti/09-15');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Tempora/Quad2-2']);
    expect(result.commemorations[0]?.reason).toBe('occurrence-impeded');
  });

  it('commemorates a Lenten feria when impeded by a I class sanctoral feast', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Quad2-2', 'temporal', 'IV-lenten-feria'),
        candidate('Sancti/03-19', 'sanctoral', 'I')
      ],
      temporal('2024-02-27', 'Quad2-2'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Sancti/03-19');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Tempora/Quad2-2']);
    expect(result.commemorations[0]?.reason).toBe('occurrence-impeded');
  });
});

describe('resolveOccurrence edge cases (design §10.4)', () => {
  it('queues Annunciation for deferred transfer when impeded by Holy Week', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Quad6-3', 'temporal', 'I-privilegiata-holy-week-feria'),
        candidate('Sancti/03-25', 'sanctoral', 'I')
      ],
      temporal('2024-03-27', 'Quad6-3'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Tempora/Quad6-3');
    expect(result.transferQueue.map((entry) => entry.candidate.feastRef.path)).toEqual(['Sancti/03-25']);
    expect(result.warnings.some((warning) => warning.code === 'occurrence-transfer-deferred')).toBe(
      true
    );
  });

  it('queues St Joseph for deferred transfer when impeded by Palm Sunday', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Quad6-0', 'temporal', 'I-privilegiata-sundays'),
        candidate('Sancti/03-19', 'sanctoral', 'I')
      ],
      temporal('2024-03-24', 'Quad6-0'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Tempora/Quad6-0');
    expect(result.transferQueue.map((entry) => entry.candidate.feastRef.path)).toEqual(['Sancti/03-19']);
  });

  it('handles the St Matthias remapped sanctoral key date without changing occurrence semantics', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Quadp2-6', 'temporal', 'IV'),
        candidate('Sancti/02-24', 'sanctoral', 'II')
      ],
      temporal('2024-02-24', 'Quadp2-6'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Sancti/02-24');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Tempora/Quadp2-6']);
    expect(result.omitted).toEqual([]);
  });

  it('prefers Immaculate Conception over Advent II Sunday and commemorates the Sunday', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Adv2-0', 'temporal', 'I-privilegiata-sundays'),
        candidate('Sancti/12-08', 'sanctoral', 'I')
      ],
      temporal('2024-12-08', 'Adv2-0'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Sancti/12-08');
    expect(result.commemorations).toHaveLength(1);
    expect(result.commemorations[0]?.reason).toBe('sunday');
    expect(result.commemorations[0]?.feastRef.path).toBe('Tempora/Adv2-0');
  });

  it('keeps Sunday against the Vigil of Epiphany and commemorates the vigil', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Epi1-0', 'temporal', 'I-privilegiata-sundays'),
        candidate('Sancti/01-05', 'sanctoral', 'II')
      ],
      temporal('2025-01-05', 'Epi1-0'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Tempora/Epi1-0');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Sancti/01-05']);
  });

  it('keeps Ember Saturday in Advent against a III class sanctoral feast', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Adv3-6', 'temporal', 'II-ember-day'),
        candidate('Sancti/12-13', 'sanctoral', 'III')
      ],
      temporal('2024-12-21', 'Adv3-6'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Tempora/Adv3-6');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Sancti/12-13']);
  });

  it('keeps September Ember Wednesday against a III class sanctoral feast', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Pent17-3', 'temporal', 'II-ember-day'),
        candidate('Sancti/09-18', 'sanctoral', 'III')
      ],
      temporal('2024-09-18', 'Pent17-3'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Tempora/Pent17-3');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Sancti/09-18']);
  });

  it('resolves two sanctoral feasts by higher class and canonical tie-break when classes match', () => {
    const higherWins = resolveOccurrence(
      [
        candidate('Tempora/Pasc2-2', 'temporal', 'IV'),
        candidate('Sancti/06-24', 'sanctoral', 'I'),
        candidate('Sancti/06-29', 'sanctoral', 'II')
      ],
      temporal('2024-04-16', 'Pasc2-2'),
      rubrics1960Policy
    );

    expect(higherWins.celebration.feastRef.path).toBe('Sancti/06-24');
    expect(higherWins.commemorations.map((entry) => entry.feastRef.path)).toContain('Sancti/06-29');

    const tieBreak = resolveOccurrence(
      [
        candidate('Tempora/Pasc2-2', 'temporal', 'IV'),
        candidate('Sancti/07-15', 'sanctoral', 'III'),
        candidate('Sancti/07-17', 'sanctoral', 'III')
      ],
      temporal('2024-04-16', 'Pasc2-2'),
      rubrics1960Policy
    );

    expect(tieBreak.celebration.feastRef.path).toBe('Sancti/07-15');
  });

  it('suppresses all non-temporal candidates in the Sacred Triduum', () => {
    const result = resolveOccurrence(
      [
        candidate('Tempora/Quad6-5', 'temporal', 'I-privilegiata-triduum'),
        candidate('Sancti/03-25', 'sanctoral', 'I'),
        candidate('Sancti/03-19', 'sanctoral', 'I')
      ],
      temporal('2024-03-29', 'Quad6-5'),
      rubrics1960Policy
    );

    expect(result.celebration.feastRef.path).toBe('Tempora/Quad6-5');
    expect(result.commemorations).toEqual([]);
    expect(result.transferQueue).toEqual([]);
    expect(result.omitted.map((entry) => entry.feastRef.path)).toEqual([
      'Sancti/03-25',
      'Sancti/03-19'
    ]);
    expect(
      result.warnings.filter((warning) => warning.code === 'occurrence-season-preemption')
    ).toHaveLength(2);
  });
});

function temporal(date: string, dayName: string): TemporalContext {
  return {
    date,
    dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season: seasonFor(dayName),
    feastRef: feast(dayName.startsWith('Tempora/') ? dayName : `Tempora/${dayName}`),
    rank: rank('II')
  };
}

function candidate(path: string, source: Candidate['source'], classSymbol: ClassSymbol1960): Candidate {
  return {
    feastRef: feast(path),
    rank: rank(classSymbol),
    source
  };
}

function feast(path: string) {
  return {
    path,
    id: path,
    title: path.split('/').at(-1) ?? path
  } as const;
}

function rank(classSymbol: ClassSymbol1960) {
  const row = rubrics1960Policy.precedenceRow(classSymbol);
  return {
    name: classSymbol,
    classSymbol,
    weight: row.weight
  } as const;
}

function seasonFor(dayName: string): TemporalContext['season'] {
  if (dayName.startsWith('Adv')) {
    return 'advent';
  }
  if (dayName.startsWith('Quadp')) {
    return 'septuagesima';
  }
  if (dayName.startsWith('Quad5') || dayName.startsWith('Quad6')) {
    return 'passiontide';
  }
  if (dayName.startsWith('Quad')) {
    return 'lent';
  }
  if (dayName.startsWith('Pasc')) {
    return 'eastertide';
  }
  if (dayName.startsWith('Pent')) {
    return 'time-after-pentecost';
  }
  return 'christmastide';
}
