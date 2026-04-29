import type { Candidate, TemporalContext } from '../../types/model.js';
import type { PrecedenceFate, PrecedenceRow } from '../../types/policy.js';

export const CLASS_SYMBOLS_1960 = [
  'I-privilegiata-triduum',
  'I-privilegiata-sundays',
  'I-privilegiata-ash-wednesday',
  'I-privilegiata-holy-week-feria',
  'I-privilegiata-christmas-vigil',
  'II-ember-day',
  'I',
  'II',
  'III',
  'IV-lenten-feria',
  'IV',
  'commemoration-only'
] as const;

export type ClassSymbol1960 = (typeof CLASS_SYMBOLS_1960)[number];

export const PRECEDENCE_1960: readonly PrecedenceRow[] = [
  row(
    'I-privilegiata-triduum',
    1300,
    'Rubricarum Instructum (1960) §94; Tabella Dierum Liturgicorum, classis I',
    'omit'
  ),
  row(
    'I-privilegiata-sundays',
    1250,
    'Rubricarum Instructum (1960) §§93, 95; Tabella Dierum Liturgicorum, classis I',
    'commemorate'
  ),
  row(
    'I-privilegiata-ash-wednesday',
    1240,
    'Rubricarum Instructum (1960) §§95, 99; Tabella Dierum Liturgicorum, classis I',
    'commemorate'
  ),
  row(
    'I-privilegiata-holy-week-feria',
    1230,
    'Rubricarum Instructum (1960) §§95, 99; Tabella Dierum Liturgicorum, classis I',
    'commemorate'
  ),
  row(
    'I-privilegiata-christmas-vigil',
    1220,
    'Rubricarum Instructum (1960) §95; Tabella Dierum Liturgicorum, classis I',
    'commemorate'
  ),
  row(
    'II-ember-day',
    790,
    'Rubricarum Instructum (1960) §91; Tabella Dierum Liturgicorum, classis II',
    'commemorate'
  ),
  row(
    'I',
    1000,
    'Rubricarum Instructum (1960) §§91-92; Tabella Dierum Liturgicorum, classis I',
    'transfer'
  ),
  row(
    'II',
    800,
    'Rubricarum Instructum (1960) §§91-92; Tabella Dierum Liturgicorum, classis II',
    'commemorate'
  ),
  row(
    'III',
    600,
    'Rubricarum Instructum (1960) §§91-92; Tabella Dierum Liturgicorum, classis III',
    'commemorate'
  ),
  row(
    'IV-lenten-feria',
    450,
    'Rubricarum Instructum (1960) §95; Tabella Dierum Liturgicorum, classis IV',
    'commemorate'
  ),
  row(
    'IV',
    400,
    'Rubricarum Instructum (1960) §§91-92; Tabella Dierum Liturgicorum, classis IV',
    'commemorate'
  ),
  row(
    'commemoration-only',
    100,
    'Tabella Dierum Liturgicorum (occurrence losers reduced to commemoration only)',
    'commemorate'
  )
];

export const PRECEDENCE_1960_BY_CLASS: ReadonlyMap<ClassSymbol1960, PrecedenceRow> = new Map(
  PRECEDENCE_1960.map((entry) => [entry.classSymbol as ClassSymbol1960, entry] as const)
);

function row(
  classSymbol: ClassSymbol1960,
  weight: number,
  citation: string,
  fate: PrecedenceFate
): PrecedenceRow {
  return {
    classSymbol,
    weight,
    citation,
    decide(params: {
      readonly candidate: Candidate;
      readonly winner: Candidate;
      readonly temporal: TemporalContext;
      readonly allCandidates: readonly Candidate[];
    }): PrecedenceFate {
      // 1960 table fate is class-driven for impeded offices; later policies can use params.
      void params;
      return fate;
    }
  };
}
