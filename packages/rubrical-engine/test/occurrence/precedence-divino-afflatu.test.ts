import { describe, expect, it } from 'vitest';

import {
  PRECEDENCE_DIVINO_AFFLATU_BY_CLASS,
  type Candidate,
  type ClassSymbolDivinoAfflatu,
  type TemporalContext
} from '../../src/index.js';

describe('PRECEDENCE_DIVINO_AFFLATU', () => {
  it('keeps the privileged and duplex ordering above ordinary ferias', () => {
    expect(weight('privileged-triduum')).toBeGreaterThan(weight('duplex-i'));
    expect(weight('duplex-i')).toBeGreaterThan(weight('duplex-ii'));
    expect(weight('duplex-ii')).toBeGreaterThan(weight('semiduplex'));
    expect(weight('semiduplex')).toBeGreaterThan(weight('feria'));
  });

  it('preserves the expected loser fate for representative rows', () => {
    const temporal = candidate('Tempora/Quad6-4', 'privileged-triduum', 'temporal');
    const sanctoral = candidate('Sancti/03-25', 'duplex-i', 'sanctoral');
    const context = temporalContext('2024-03-28', 'Quad6-4');

    expect(
      PRECEDENCE_DIVINO_AFFLATU_BY_CLASS.get('duplex-i')?.decide({
        candidate: sanctoral,
        winner: temporal,
        temporal: context,
        allCandidates: [temporal, sanctoral]
      })
    ).toBe('transfer');

    expect(
      PRECEDENCE_DIVINO_AFFLATU_BY_CLASS.get('feria')?.decide({
        candidate: candidate('Tempora/Pent07-2', 'feria', 'temporal'),
        winner: sanctoral,
        temporal: context,
        allCandidates: [sanctoral]
      })
    ).toBe('omit');
  });
});

function weight(classSymbol: ClassSymbolDivinoAfflatu): number {
  return PRECEDENCE_DIVINO_AFFLATU_BY_CLASS.get(classSymbol)?.weight ?? 0;
}

function candidate(
  path: string,
  classSymbol: ClassSymbolDivinoAfflatu,
  source: Candidate['source']
): Candidate {
  return {
    feastRef: {
      path,
      id: path,
      title: path
    },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: weight(classSymbol)
    },
    source
  };
}

function temporalContext(date: string, dayName: string): TemporalContext {
  return {
    date,
    dayOfWeek: 4,
    weekStem: dayName.replace(/-\d+$/u, ''),
    dayName,
    season: 'passiontide',
    feastRef: {
      path: `Tempora/${dayName}`,
      id: `Tempora/${dayName}`,
      title: dayName
    },
    rank: {
      name: 'Feria',
      classSymbol: 'privileged-triduum',
      weight: weight('privileged-triduum')
    }
  };
}
