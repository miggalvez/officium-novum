import type { Candidate, TemporalContext } from '../../types/model.js';
import type { PrecedenceFate, PrecedenceRow } from '../../types/policy.js';

export const CLASS_SYMBOLS_1955 = [
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

export type ClassSymbol1955 = (typeof CLASS_SYMBOLS_1955)[number];

export const PRECEDENCE_1955: readonly PrecedenceRow[] = [
  row(
    'privileged-triduum',
    1600,
    'Cum Nostra (1955), Sacred Triduum',
    'omit'
  ),
  row(
    'privileged-feria-major',
    1500,
    'Cum Nostra (1955), Ash Wednesday and Holy Week feriae',
    'commemorate'
  ),
  row(
    'privileged-sunday',
    1450,
    'Cum Nostra (1955), privileged Sundays',
    'commemorate'
  ),
  row('sunday', 1180, 'Cum Nostra (1955), Sundays', 'commemorate'),
  row('duplex-i', 1300, 'Cum Nostra (1955), I class feasts', 'transfer'),
  row('duplex-ii', 1200, 'Cum Nostra (1955), II class feasts', 'commemorate'),
  row('duplex-major', 1000, 'Cum Nostra (1955), duplex majus', 'commemorate'),
  row('duplex', 900, 'Cum Nostra (1955), duplex', 'commemorate'),
  row('semiduplex', 760, 'Cum Nostra (1955), semiduplex residuals', 'commemorate'),
  row('octave-major', 740, 'Cum Nostra (1955), surviving octaves', 'commemorate'),
  row('octave', 620, 'Cum Nostra (1955), octave continuations', 'commemorate'),
  row('vigil-major', 700, 'Cum Nostra (1955), major vigils', 'commemorate'),
  row('vigil', 580, 'Cum Nostra (1955), minor vigils', 'commemorate'),
  row('simplex', 520, 'Cum Nostra (1955), simplex / commemorations', 'commemorate'),
  row('feria', 400, 'Cum Nostra (1955), feriae', 'omit'),
  row('commemoration-only', 100, 'Reduced to commemoration only', 'omit')
];

export const PRECEDENCE_1955_BY_CLASS: ReadonlyMap<ClassSymbol1955, PrecedenceRow> = new Map(
  PRECEDENCE_1955.map((entry) => [entry.classSymbol as ClassSymbol1955, entry] as const)
);

function row(
  classSymbol: ClassSymbol1955,
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
