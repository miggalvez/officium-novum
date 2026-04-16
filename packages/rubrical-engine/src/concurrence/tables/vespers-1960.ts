import {
  CLASS_SYMBOLS_1960,
  PRECEDENCE_1960_BY_CLASS,
  type ClassSymbol1960
} from '../../occurrence/tables/precedence-1960.js';
import type { VespersWinner } from '../../types/concurrence.js';

export interface VespersMatrixRow1960 {
  readonly todayClass: ClassSymbol1960;
  readonly tomorrowClass: ClassSymbol1960;
  readonly winner: VespersWinner | 'equal';
  readonly citation: string;
}

/**
 * 1960 concurrence table materialized as a full class-pair matrix.
 *
 * RI's Tabella Concurrentiae is rank-class driven. In our 1960 implementation,
 * precedence classes are already normalized and weighted, so each pair can be
 * derived deterministically from that ordering while still carrying explicit
 * citations per row.
 */
export const VESPERS_1960_MATRIX: readonly VespersMatrixRow1960[] = Object.freeze(
  CLASS_SYMBOLS_1960.flatMap((todayClass) =>
    CLASS_SYMBOLS_1960.map((tomorrowClass) =>
      buildRow(todayClass, tomorrowClass)
    )
  )
);

export const VESPERS_1960_BY_CLASSES: ReadonlyMap<
  string,
  VespersMatrixRow1960
> = new Map(
  VESPERS_1960_MATRIX.map((row) => [matrixKey(row.todayClass, row.tomorrowClass), row] as const)
);

export function lookupVespers1960Row(
  todayClass: string,
  tomorrowClass: string
): VespersMatrixRow1960 {
  const today = coerceClass(todayClass);
  const tomorrow = coerceClass(tomorrowClass);
  const row = VESPERS_1960_BY_CLASSES.get(matrixKey(today, tomorrow));
  if (!row) {
    throw new Error(
      `Missing 1960 Vespers concurrence row for (${todayClass}, ${tomorrowClass}).`
    );
  }
  return row;
}

function buildRow(
  todayClass: ClassSymbol1960,
  tomorrowClass: ClassSymbol1960
): VespersMatrixRow1960 {
  const todayRow = PRECEDENCE_1960_BY_CLASS.get(todayClass);
  const tomorrowRow = PRECEDENCE_1960_BY_CLASS.get(tomorrowClass);
  if (!todayRow || !tomorrowRow) {
    throw new Error(
      `Cannot build 1960 Vespers matrix row; missing precedence row (${todayClass}, ${tomorrowClass}).`
    );
  }

  if (todayRow.weight > tomorrowRow.weight) {
    return {
      todayClass,
      tomorrowClass,
      winner: 'today',
      citation: 'Rubricarum Instructum (1960) §§108-110; Tabella Concurrentiae §§108-112'
    };
  }

  if (todayRow.weight < tomorrowRow.weight) {
    return {
      todayClass,
      tomorrowClass,
      winner: 'tomorrow',
      citation: 'Rubricarum Instructum (1960) §§108-110; Tabella Concurrentiae §§108-112'
    };
  }

  return {
    todayClass,
    tomorrowClass,
    winner: 'equal',
    citation: 'Rubricarum Instructum (1960) §109; Tabella Concurrentiae §109'
  };
}

function matrixKey(todayClass: ClassSymbol1960, tomorrowClass: ClassSymbol1960): string {
  return `${todayClass}::${tomorrowClass}`;
}

function coerceClass(classSymbol: string): ClassSymbol1960 {
  if (
    CLASS_SYMBOLS_1960.includes(classSymbol as ClassSymbol1960)
  ) {
    return classSymbol as ClassSymbol1960;
  }
  throw new Error(`Unsupported 1960 class symbol for Vespers matrix: ${classSymbol}`);
}
