import type { Condition, ConditionExpression } from '@officium-novum/parser';

import type { LiturgicalSeason } from '../types/model.js';
import type { ResolvedVersion } from '../types/version.js';

import type { CalendarDate } from './date.js';

export interface ConditionEvalContext {
  readonly date: CalendarDate;
  readonly dayOfWeek: number;
  readonly season?: LiturgicalSeason;
  readonly version: ResolvedVersion;
}

export function conditionMatches(
  condition: Condition | undefined,
  context: ConditionEvalContext
): boolean {
  if (!condition) {
    return true;
  }

  return evaluateExpression(condition.expression, context);
}

function evaluateExpression(
  expression: ConditionExpression,
  context: ConditionEvalContext
): boolean {
  switch (expression.type) {
    case 'match':
      return matchPredicate(expression.subject, expression.predicate, context);
    case 'not':
      return !evaluateExpression(expression.inner, context);
    case 'and':
      return (
        evaluateExpression(expression.left, context) &&
        evaluateExpression(expression.right, context)
      );
    case 'or':
      return (
        evaluateExpression(expression.left, context) ||
        evaluateExpression(expression.right, context)
      );
  }
}

function matchPredicate(
  subject: string,
  predicate: string,
  context: ConditionEvalContext
): boolean {
  const normalized = normalizeToken(predicate);

  switch (subject) {
    case 'rubrica':
    case 'rubricis':
      return rubricTagsForVersion(context.version).has(normalized);
    case 'tempore':
      return matchesSeasonPredicate(normalized, context.season);
    case 'mense':
      return Number(normalized) === context.date.month;
    case 'die':
      return Number(normalized) === context.date.day || matchesNamedDayPredicate(normalized, context.date);
    case 'feria':
      return feriaToDayOfWeek(normalized) === context.dayOfWeek;
    default:
      return false;
  }
}

function matchesNamedDayPredicate(predicate: string, date: CalendarDate): boolean {
  switch (predicate) {
    case 'epiphaniae':
      return date.month === 1 && date.day === 6;
    default:
      return false;
  }
}

function matchesSeasonPredicate(
  predicate: string,
  season: LiturgicalSeason | undefined
): boolean {
  if (!season) {
    return false;
  }

  switch (predicate) {
    case 'adventus':
    case 'adventu':
      return season === 'advent';
    case 'quadragesimae':
    case 'quadragesima':
      return season === 'lent' || season === 'passiontide';
    case 'septuagesimae':
      return season === 'septuagesima';
    case 'paschali':
    case 'paschale':
      return (
        season === 'eastertide' ||
        season === 'ascensiontide' ||
        season === 'pentecost-octave'
      );
    case 'ascensionis':
      return season === 'ascensiontide';
    case 'pentecostes':
      return season === 'pentecost-octave';
    case 'epiphaniae':
      return season === 'epiphanytide' || season === 'time-after-epiphany';
    case 'nativitatis':
      return season === 'christmastide';
    default:
      return false;
  }
}

function feriaToDayOfWeek(predicate: string): number | null {
  switch (predicate) {
    case 'dominica':
      return 0;
    case 'ii':
    case '2':
      return 1;
    case 'iii':
    case '3':
      return 2;
    case 'iv':
    case '4':
      return 3;
    case 'v':
    case '5':
      return 4;
    case 'vi':
    case '6':
      return 5;
    case 'vii':
    case '7':
    case 'sabbato':
    case 'sabbati':
      return 6;
    default:
      return null;
  }
}

function rubricTagsForVersion(version: ResolvedVersion): ReadonlySet<string> {
  const tags = new Set<string>();
  const handle = version.handle;

  if (handle.includes('1570')) {
    addTags(tags, '1570', 'trident', 'tridentina');
  }
  if (handle.includes('1888')) {
    addTags(tags, '1888', 'trident', 'tridentina');
  }
  if (handle.includes('1906')) {
    addTags(tags, '1906', 'trident', 'tridentina');
  }
  if (handle.includes('1939')) {
    addTags(tags, '1939', 'divino');
  }
  if (handle.includes('1954')) {
    addTags(tags, '1954', 'divino');
  }
  if (handle.includes('1955')) {
    addTags(tags, '1955', 'innovata');
  }
  if (handle === 'Rubrics 1960 - 1960') {
    addTags(tags, '196', '1960', 'innovata');
  }
  if (handle === 'Rubrics 1960 - 2020 USA') {
    addTags(tags, '196', 'newcal', 'innovata');
  }
  if (handle.includes('1617')) {
    addTags(tags, '1617', 'monastica');
  }
  if (handle.includes('1930')) {
    addTags(tags, '1930', 'divino', 'monastica');
  }
  if (handle.includes('1963')) {
    addTags(tags, '1963', 'monastica', 'innovata');
  }
  if (handle.includes('Barroux')) {
    addTags(tags, 'barroux');
  }
  if (handle.includes('Cisterciensis')) {
    addTags(tags, 'cisterciensis', 'cisterciensisa', 'cisterciensisi');
  }
  if (handle.includes('Altovadensis')) {
    addTags(tags, 'altovadensis', 'cisterciensis');
  }
  if (handle.includes('Praedicatorum')) {
    addTags(tags, 'praedicatorum', 'dominican', '1962', 'innovata');
  }

  switch (version.policy.name) {
    case 'tridentine-1570':
      addTags(tags, 'trident', 'tridentina');
      break;
    case 'divino-afflatu':
      addTags(tags, 'divino');
      break;
    case 'reduced-1955':
      addTags(tags, '1955', 'innovata');
      break;
    case 'rubrics-1960':
      addTags(tags, '196', 'innovata');
      break;
    case 'monastic-tridentine':
      addTags(tags, '1617', 'monastica');
      break;
    case 'monastic-divino':
      addTags(tags, '1930', 'divino', 'monastica');
      break;
    case 'monastic-1963':
      addTags(tags, '1963', 'monastica', 'innovata');
      break;
    case 'cistercian-1951':
      addTags(tags, 'cisterciensis');
      break;
    case 'cistercian-altovadense':
      addTags(tags, 'altovadensis', 'cisterciensis');
      break;
    case 'dominican-1962':
      addTags(tags, 'praedicatorum', 'dominican', '1962', 'innovata');
      break;
  }

  return tags;
}

function addTags(tags: Set<string>, ...values: string[]): void {
  for (const value of values) {
    tags.add(normalizeToken(value));
  }
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/æ/gu, 'ae')
    .replace(/œ/gu, 'oe')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gu, '');
}
