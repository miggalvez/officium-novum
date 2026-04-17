import {
  CLASS_SYMBOLS_1955,
  PRECEDENCE_1955_BY_CLASS,
  type ClassSymbol1955
} from '../../occurrence/tables/precedence-1955.js';
import type { VespersWinner } from '../../types/concurrence.js';

export interface VespersMatrixRow1955 {
  readonly todayClass: ClassSymbol1955;
  readonly tomorrowClass: ClassSymbol1955;
  readonly winner: VespersWinner | 'equal';
  readonly citation: string;
}

export const VESPERS_1955_MATRIX: readonly VespersMatrixRow1955[] = Object.freeze(
  CLASS_SYMBOLS_1955.flatMap((todayClass) =>
    CLASS_SYMBOLS_1955.map((tomorrowClass) => buildRow(todayClass, tomorrowClass))
  )
);

export const VESPERS_1955_BY_CLASSES: ReadonlyMap<string, VespersMatrixRow1955> = new Map(
  VESPERS_1955_MATRIX.map((row) => [`${row.todayClass}::${row.tomorrowClass}`, row] as const)
);

export function lookupVespers1955Row(
  todayClass: string,
  tomorrowClass: string
): VespersMatrixRow1955 {
  const row = VESPERS_1955_BY_CLASSES.get(`${todayClass}::${tomorrowClass}`);
  if (!row) {
    throw new Error(`Missing 1955 Vespers concurrence row for (${todayClass}, ${tomorrowClass}).`);
  }
  return row;
}

function buildRow(
  todayClass: ClassSymbol1955,
  tomorrowClass: ClassSymbol1955
): VespersMatrixRow1955 {
  const todayRow = PRECEDENCE_1955_BY_CLASS.get(todayClass);
  const tomorrowRow = PRECEDENCE_1955_BY_CLASS.get(tomorrowClass);
  if (!todayRow || !tomorrowRow) {
    throw new Error(`Cannot build 1955 Vespers matrix row (${todayClass}, ${tomorrowClass}).`);
  }

  if (todayRow.weight > tomorrowRow.weight) {
    return {
      todayClass,
      tomorrowClass,
      winner: 'today',
      citation: 'Cum Nostra (1955), concurrence by dignity'
    };
  }

  if (todayRow.weight < tomorrowRow.weight) {
    return {
      todayClass,
      tomorrowClass,
      winner: 'tomorrow',
      citation: 'Cum Nostra (1955), concurrence by dignity'
    };
  }

  return {
    todayClass,
    tomorrowClass,
    winner: 'equal',
    citation: 'Cum Nostra (1955), equal-rank praestantior'
  };
}
