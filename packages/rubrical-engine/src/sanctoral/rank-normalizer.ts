import type { Rank } from '@officium-novum/parser';

import {
  PRECEDENCE_1955_BY_CLASS,
  type ClassSymbol1955
} from '../occurrence/tables/precedence-1955.js';
import {
  PRECEDENCE_DIVINO_AFFLATU_BY_CLASS,
  type ClassSymbolDivinoAfflatu
} from '../occurrence/tables/precedence-divino-afflatu.js';
import {
  PRECEDENCE_1960_BY_CLASS,
  type ClassSymbol1960
} from '../occurrence/tables/precedence-1960.js';
import type { ResolvedRank } from '../types/model.js';
import type { RankContext, RubricalPolicy } from '../types/policy.js';

const TRIDUUM_KEYS = new Set(['Quad6-4', 'Quad6-5', 'Quad6-6']);
const HOLY_WEEK_MON_WED_KEYS = new Set(['Quad6-1', 'Quad6-2', 'Quad6-3']);
const TEMPORAL_FIXED_FEAST_KEYS_PRE1960 = new Set(['Nat2-0']);
const EMBER_DAY_KEYS = new Set([
  'Adv3-3',
  'Adv3-5',
  'Adv3-6',
  'Quad1-3',
  'Quad1-5',
  'Quad1-6',
  'Pent01-3',
  'Pent01-5',
  'Pent01-6'
]);

export function normalizeRank(
  raw: Rank,
  policy: RubricalPolicy,
  context: RankContext
): ResolvedRank {
  return policy.resolveRank(raw, context);
}

export function rubrics1960ResolveRank(raw: Rank, context: RankContext): ResolvedRank {
  const name = raw.name.trim() || raw.derivation?.trim() || 'Unclassified';
  const temporalKey = context.source === 'temporal' ? extractTemporalKey(context.feastPath) : undefined;
  const classSymbol = classify1960ClassSymbol(raw, name, context, temporalKey);
  const row = PRECEDENCE_1960_BY_CLASS.get(classSymbol);
  if (!row) {
    throw new Error(`Missing Rubrics 1960 precedence row for class symbol '${classSymbol}'.`);
  }

  return {
    name,
    classSymbol,
    weight: row.weight
  };
}

export function defaultResolveRank(raw: Rank, _context?: RankContext): ResolvedRank {
  const name = raw.name.trim() || raw.derivation?.trim() || 'Unclassified';
  const classSymbol =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'rank';

  return {
    name,
    weight: raw.classWeight,
    classSymbol
  };
}

export function divinoAfflatuResolveRank(raw: Rank, context: RankContext): ResolvedRank {
  return pre1960ResolveRank(raw, context, {
    lookup(classSymbol) {
      return PRECEDENCE_DIVINO_AFFLATU_BY_CLASS.get(classSymbol);
    }
  });
}

export function reduced1955ResolveRank(raw: Rank, context: RankContext): ResolvedRank {
  return pre1960ResolveRank(raw, context, {
    lookup(classSymbol) {
      return PRECEDENCE_1955_BY_CLASS.get(classSymbol);
    }
  });
}

function pre1960ResolveRank(
  raw: Rank,
  context: RankContext,
  options: {
    readonly lookup: (
      classSymbol: ClassSymbolDivinoAfflatu | ClassSymbol1955
    ) => { readonly weight: number } | undefined;
  }
): ResolvedRank {
  const name = raw.name.trim() || raw.derivation?.trim() || 'Unclassified';
  const classSymbol = classifyPre1960ClassSymbol(raw, name, context);
  const row = options.lookup(classSymbol);
  if (!row) {
    throw new Error(`Missing pre-1960 precedence row for class symbol '${classSymbol}'.`);
  }

  return {
    name,
    classSymbol,
    weight: row.weight + raw.classWeight
  };
}

function classify1960ClassSymbol(
  raw: Rank,
  name: string,
  context: RankContext,
  temporalKey: string | undefined
): ClassSymbol1960 {
  if (context.feastPath === 'Commune/C10') {
    return 'III';
  }

  if (isCommemorationOnly(raw.classWeight, name)) {
    return 'commemoration-only';
  }

  if (context.source === 'temporal' && temporalKey) {
    if (TRIDUUM_KEYS.has(temporalKey)) {
      return 'I-privilegiata-triduum';
    }
    if (temporalKey === 'Quadp3-3') {
      return 'I-privilegiata-ash-wednesday';
    }
    if (HOLY_WEEK_MON_WED_KEYS.has(temporalKey)) {
      return 'I-privilegiata-holy-week-feria';
    }
    if (isChristmasVigil(context.date)) {
      return 'I-privilegiata-christmas-vigil';
    }
    if (temporalKey === 'Pasc5-1') {
      return 'I-privilegiata-rogation-monday';
    }
    if (isPrivilegedSunday(temporalKey)) {
      return 'I-privilegiata-sundays';
    }
    if (isEmberDay(temporalKey, context.date)) {
      return 'II-ember-day';
    }
    if (isLentenWeekdayFeria(temporalKey)) {
      return 'IV-lenten-feria';
    }
  }

  if (/\bi\b\.?\s*class(?:is)?/iu.test(name) || raw.classWeight >= 6) {
    return 'I';
  }
  if (/\bii\b\.?\s*class(?:is)?/iu.test(name) || raw.classWeight >= 5) {
    return 'II';
  }
  if (/\biii\b\.?\s*class(?:is)?/iu.test(name)) {
    return 'III';
  }
  if (raw.classWeight >= 2) {
    return 'III';
  }
  return 'IV';
}

function classifyPre1960ClassSymbol(
  raw: Rank,
  name: string,
  context: RankContext
): ClassSymbolDivinoAfflatu | ClassSymbol1955 {
  const normalized = normalizeName(name);
  const temporalKey = context.source === 'temporal' ? extractTemporalKey(context.feastPath) : undefined;

  if (context.version === 'Reduced - 1955' && context.feastPath === 'Sancti/01-13') {
    return 'duplex-ii';
  }

  if (isCommemorationOnly(raw.classWeight, name)) {
    return 'commemoration-only';
  }

  if (/\bvigilia\b/u.test(normalized)) {
    return raw.classWeight >= 5 ? 'vigil-major' : 'vigil';
  }

  if (/\b(?:infraoctavam|infra8vam|octavae?|inoctava)\b/u.test(normalized)) {
    return raw.classWeight >= 3 ? 'octave-major' : 'octave';
  }

  if (context.source === 'temporal' && temporalKey) {
    if (TRIDUUM_KEYS.has(temporalKey)) {
      return 'privileged-triduum';
    }

    if (temporalKey === 'Quadp3-3' || HOLY_WEEK_MON_WED_KEYS.has(temporalKey)) {
      return 'privileged-feria-major';
    }

    if (context.date.endsWith('-12-24')) {
      return 'vigil-major';
    }

    if (context.date.endsWith('-12-25') || context.date.endsWith('-01-01')) {
      return 'octave-major';
    }

    if (context.date.endsWith('-01-06')) {
      return 'duplex-ii';
    }

    if (isPrivilegedSunday(temporalKey)) {
      return 'privileged-sunday';
    }

    if (
      /^\w+-0$/u.test(temporalKey) &&
      !TEMPORAL_FIXED_FEAST_KEYS_PRE1960.has(temporalKey)
    ) {
      return 'sunday';
    }
  }

  if (/\bi\b\.?\s*class(?:is)?/iu.test(name) || raw.classWeight >= 6) {
    return 'duplex-i';
  }
  if (/\bii\b\.?\s*class(?:is)?/iu.test(name) || raw.classWeight >= 5) {
    return 'duplex-ii';
  }
  if (normalized.includes('duplexmajus') || normalized.includes('mmmaj') || raw.classWeight >= 4) {
    return 'duplex-major';
  }
  if (normalized.includes('semiduplex') || raw.classWeight >= 2) {
    return 'semiduplex';
  }
  if (
    normalized.includes('duplex') ||
    normalized.includes('fest') ||
    normalized.includes('dominica')
  ) {
    return 'duplex';
  }
  if (
    normalized.includes('simplex') ||
    normalized.includes('memoria') ||
    raw.classWeight > 1
  ) {
    return 'simplex';
  }

  return 'feria';
}

function isCommemorationOnly(weight: number, name: string): boolean {
  return weight <= 0 || /\b(commemoratio|nihil)\b/i.test(name);
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gu, '');
}

function extractTemporalKey(feastPath: string): string | undefined {
  const temporalPath = feastPath.startsWith('Tempora/') ? feastPath.slice('Tempora/'.length) : feastPath;
  const match = /^([A-Za-z0-9]+(?:-\d+)?)/u.exec(temporalPath);
  return match?.[1];
}

function isPrivilegedSunday(temporalKey: string): boolean {
  return /^(Adv[1-4]|Quadp[1-3]|Quad[1-6])-0$/u.test(temporalKey);
}

function isLentenWeekdayFeria(temporalKey: string): boolean {
  return /^Quad[1-5]-[1-6]$/u.test(temporalKey);
}

function isChristmasVigil(isoDate: string): boolean {
  return isoDate.endsWith('-12-24');
}

function isEmberDay(temporalKey: string, isoDate: string): boolean {
  return EMBER_DAY_KEYS.has(temporalKey) || isSeptemberEmberDay(isoDate);
}

function isSeptemberEmberDay(isoDate: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  if (!parts) {
    return false;
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (month !== 9) {
    return false;
  }

  const thirdSunday = thirdSundayOfSeptember(year);
  return day === thirdSunday + 3 || day === thirdSunday + 5 || day === thirdSunday + 6;
}

function thirdSundayOfSeptember(year: number): number {
  for (let day = 15; day <= 21; day += 1) {
    const weekday = new Date(Date.UTC(year, 8, day)).getUTCDay();
    if (weekday === 0) {
      return day;
    }
  }

  throw new Error(`Unable to determine the third Sunday of September for year ${year}.`);
}
