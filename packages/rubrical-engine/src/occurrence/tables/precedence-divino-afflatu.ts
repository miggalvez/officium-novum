import type { Candidate, TemporalContext } from '../../types/model.js';
import type { PrecedenceFate, PrecedenceRow } from '../../types/policy.js';

export const CLASS_SYMBOLS_DIVINO_AFFLATU = [
  'privileged-triduum',
  'privileged-feria-major',
  'privileged-sunday',
  'sunday',
  'duplex-i',
  'duplex-ii',
  'duplex-major',
  'duplex',
  'semiduplex',
  'octave-major',
  'octave',
  'vigil-major',
  'vigil',
  'simplex',
  'feria',
  'commemoration-only'
] as const;

export type ClassSymbolDivinoAfflatu = (typeof CLASS_SYMBOLS_DIVINO_AFFLATU)[number];

export const PRECEDENCE_DIVINO_AFFLATU: readonly PrecedenceRow[] = [
  row(
    'privileged-triduum',
    1600,
    'Rubricae Generales Breviarii (1911), privileged Triduum',
    'omit'
  ),
  row(
    'privileged-feria-major',
    1450,
    'Rubricae Generales Breviarii (1911), privileged feriae and Ash Wednesday',
    'commemorate'
  ),
  row(
    'privileged-sunday',
    1400,
    'Rubricae Generales Breviarii (1911), privileged Sundays of Advent/Lent',
    'commemorate'
  ),
  row('sunday', 1200, 'Rubricae Generales Breviarii (1911), Sundays', 'commemorate'),
  row('duplex-i', 1300, 'Rubricae Generales Breviarii (1911), duplex I classis', 'transfer'),
  row('duplex-ii', 1150, 'Rubricae Generales Breviarii (1911), duplex II classis', 'commemorate'),
  row('duplex-major', 1000, 'Rubricae Generales Breviarii (1911), duplex majus', 'commemorate'),
  row('duplex', 900, 'Rubricae Generales Breviarii (1911), duplex', 'commemorate'),
  row('semiduplex', 800, 'Rubricae Generales Breviarii (1911), semiduplex', 'commemorate'),
  row(
    'octave-major',
    780,
    'Rubricae Generales Breviarii (1911), octave day / privileged octave',
    'commemorate'
  ),
  row('octave', 720, 'Rubricae Generales Breviarii (1911), infra octavam', 'commemorate'),
  row('vigil-major', 700, 'Rubricae Generales Breviarii (1911), major vigils', 'commemorate'),
  row('vigil', 640, 'Rubricae Generales Breviarii (1911), vigils', 'commemorate'),
  row('simplex', 560, 'Rubricae Generales Breviarii (1911), simplex', 'commemorate'),
  row('feria', 400, 'Rubricae Generales Breviarii (1911), feriae', 'omit'),
  row('commemoration-only', 100, 'Reduced to commemoration only', 'omit')
];

export const PRECEDENCE_DIVINO_AFFLATU_BY_CLASS: ReadonlyMap<
  ClassSymbolDivinoAfflatu,
  PrecedenceRow
> = new Map(
  PRECEDENCE_DIVINO_AFFLATU.map(
    (entry) => [entry.classSymbol as ClassSymbolDivinoAfflatu, entry] as const
  )
);

function row(
  classSymbol: ClassSymbolDivinoAfflatu,
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
      void params;
      return fate;
    }
  };
}
