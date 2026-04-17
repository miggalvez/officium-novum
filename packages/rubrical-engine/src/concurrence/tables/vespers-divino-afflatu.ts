import {
  CLASS_SYMBOLS_DIVINO_AFFLATU,
  PRECEDENCE_DIVINO_AFFLATU_BY_CLASS,
  type ClassSymbolDivinoAfflatu
} from '../../occurrence/tables/precedence-divino-afflatu.js';
import type { VespersWinner } from '../../types/concurrence.js';

export interface VespersMatrixRowDivinoAfflatu {
  readonly todayClass: ClassSymbolDivinoAfflatu;
  readonly tomorrowClass: ClassSymbolDivinoAfflatu;
  readonly winner: VespersWinner | 'equal';
  readonly citation: string;
}

export const VESPERS_DIVINO_AFFLATU_MATRIX: readonly VespersMatrixRowDivinoAfflatu[] =
  Object.freeze(
    CLASS_SYMBOLS_DIVINO_AFFLATU.flatMap((todayClass) =>
      CLASS_SYMBOLS_DIVINO_AFFLATU.map((tomorrowClass) => buildRow(todayClass, tomorrowClass))
    )
  );

export const VESPERS_DIVINO_AFFLATU_BY_CLASSES: ReadonlyMap<string, VespersMatrixRowDivinoAfflatu> =
  new Map(
    VESPERS_DIVINO_AFFLATU_MATRIX.map(
      (row) => [`${row.todayClass}::${row.tomorrowClass}`, row] as const
    )
  );

export function lookupVespersDivinoAfflatuRow(
  todayClass: string,
  tomorrowClass: string
): VespersMatrixRowDivinoAfflatu {
  const row = VESPERS_DIVINO_AFFLATU_BY_CLASSES.get(`${todayClass}::${tomorrowClass}`);
  if (!row) {
    throw new Error(
      `Missing Divino Afflatu Vespers concurrence row for (${todayClass}, ${tomorrowClass}).`
    );
  }
  return row;
}

function buildRow(
  todayClass: ClassSymbolDivinoAfflatu,
  tomorrowClass: ClassSymbolDivinoAfflatu
): VespersMatrixRowDivinoAfflatu {
  const todayRow = PRECEDENCE_DIVINO_AFFLATU_BY_CLASS.get(todayClass);
  const tomorrowRow = PRECEDENCE_DIVINO_AFFLATU_BY_CLASS.get(tomorrowClass);
  if (!todayRow || !tomorrowRow) {
    throw new Error(
      `Cannot build Divino Afflatu Vespers matrix row (${todayClass}, ${tomorrowClass}).`
    );
  }

  if (todayRow.weight > tomorrowRow.weight) {
    return {
      todayClass,
      tomorrowClass,
      winner: 'today',
      citation: 'Rubricae Generales Breviarii (1911), concurrence by dignity'
    };
  }

  if (todayRow.weight < tomorrowRow.weight) {
    return {
      todayClass,
      tomorrowClass,
      winner: 'tomorrow',
      citation: 'Rubricae Generales Breviarii (1911), concurrence by dignity'
    };
  }

  return {
    todayClass,
    tomorrowClass,
    winner: 'equal',
    citation: 'Rubricae Generales Breviarii (1911), equal-rank praestantior'
  };
}
