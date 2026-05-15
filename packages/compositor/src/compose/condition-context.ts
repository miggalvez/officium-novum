import type { ConditionExpression, TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  DayOfficeSummary,
  ResolvedVersion
} from '@officium-novum/rubrical-engine';

export function buildConditionContext(
  summary: DayOfficeSummary,
  version: ResolvedVersion,
  corpus: TextIndex
): ConditionEvalContext {
  const [yearStr, monthStr, dayStr] = summary.date.split('-');
  const commonPredicates = activeCommonPredicates(summary, corpus);
  return {
    date: {
      year: Number(yearStr),
      month: Number(monthStr),
      day: Number(dayStr)
    },
    dayOfWeek: summary.temporal.dayOfWeek,
    season: summary.temporal.season,
    version,
    ...(commonPredicates.length > 0 ? { commonPredicates } : {})
  };
}

function activeCommonPredicates(summary: DayOfficeSummary, corpus: TextIndex): readonly string[] {
  const predicates = new Set<string>();

  for (const path of activeCommonPaths(summary)) {
    const file = corpus.getFile(path);
    if (!file) continue;

    for (const section of file.sections) {
      if (section.header !== 'Officium' && section.header !== 'Rule') continue;
      collectCommonPredicatesFromExpression(section.condition?.expression, predicates);
    }
  }

  return [...predicates];
}

function activeCommonPaths(summary: DayOfficeSummary): readonly string[] {
  const keys = new Set<string>();
  const rules = summary.celebrationRules;
  if (rules.comkey) keys.add(rules.comkey);

  for (const directive of rules.unmapped ?? []) {
    const referencePath =
      directive.kind === 'reference'
        ? directive.reference.path
        : directive.kind === 'action' && /^(?:vide|ex)$/iu.test(directive.keyword)
          ? directive.args.join(' ').trim().replace(/[;,\s]+$/gu, '')
          : undefined;
    const key = commonKeyFromReferencePath(referencePath);
    if (key) keys.add(key);
  }

  const paths = new Set<string>();
  for (const key of keys) {
    for (const variant of commonKeyVariantsForSummary(key, summary)) {
      paths.add(`horas/Latin/Commune/${variant}.txt`);
    }
  }
  return [...paths];
}

function commonKeyFromReferencePath(path: string | undefined): string | undefined {
  if (!path) return undefined;

  const normalized = path.replace(/\.txt$/iu, '').trim();
  const match = /^(?:(?:horas\/Latin\/)?Commune\/)?([^/]+)$/iu.exec(normalized);
  return match?.[1];
}

function commonKeyVariantsForSummary(key: string, summary: DayOfficeSummary): readonly string[] {
  const normalized = key.replace(/\.txt$/iu, '');
  if (
    !usesPaschalCommonVariant(summary) ||
    normalized.endsWith('p') ||
    !/^C[1-3][a-z]*(?:-[12])?$/iu.test(normalized)
  ) {
    return [normalized];
  }
  return [`${normalized}p`, normalized];
}

function usesPaschalCommonVariant(summary: DayOfficeSummary): boolean {
  return (
    summary.temporal.season === 'eastertide' ||
    summary.temporal.season === 'ascensiontide' ||
    summary.temporal.season === 'pentecost-octave' ||
    /^Pasc/iu.test(summary.temporal.dayName)
  );
}

function collectCommonPredicatesFromExpression(
  expression: ConditionExpression | undefined,
  predicates: Set<string>
): void {
  if (!expression) return;

  switch (expression.type) {
    case 'match':
      if (expression.subject === 'communi' || expression.subject === 'commune') {
        predicates.add(expression.predicate);
      }
      return;
    case 'not':
      collectCommonPredicatesFromExpression(expression.inner, predicates);
      return;
    case 'and':
    case 'or':
      collectCommonPredicatesFromExpression(expression.left, predicates);
      collectCommonPredicatesFromExpression(expression.right, predicates);
      return;
  }
}
