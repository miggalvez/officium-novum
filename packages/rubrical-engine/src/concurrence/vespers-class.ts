import type { ParsedFile, RuleDirective } from '@officium-novum/parser';

import { deriveVespersClass1960 } from '../policy/rubrics-1960.js';
import type { VespersClass } from '../types/concurrence.js';
import type { Celebration } from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';
import type { CelebrationRuleSet } from '../types/rule-set.js';

export interface FeastVespersSignals {
  readonly hasVespersSection: boolean;
  readonly hasVespersViaCommune: boolean;
  readonly hasCapitulumOnly: boolean;
}

export function deriveVespersClass(params: {
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly feastFile: ParsedFile;
  readonly policy: RubricalPolicy;
}): VespersClass {
  const { celebration, celebrationRules, feastFile, policy } = params;
  if (!celebrationRules.hasFirstVespers && !celebrationRules.hasSecondVespers) {
    return 'nihil';
  }

  const signals = inspectFeastVespersSignals(feastFile);
  switch (policy.name) {
    case 'rubrics-1960':
      return deriveVespersClass1960({
        celebration,
        signals
      });
    default:
      return deriveFallbackVespersClass(celebration, signals);
  }
}

export function inspectFeastVespersSignals(feastFile: ParsedFile): FeastVespersSignals {
  const normalizedHeaders = feastFile.sections.map((section) => normalizeHeader(section.header));
  const hasVespersSection = normalizedHeaders.some((header) =>
    /\bvesperae?\b/u.test(header)
  );
  const hasCapitulumVespera = normalizedHeaders.some((header) =>
    /^capitulum\s+vesperae?/u.test(header)
  );
  const hasPsalmVespera = normalizedHeaders.some((header) =>
    /^psalm(?:us)?\s+vesperae?/u.test(header)
  );
  const hasVespersViaCommune = extractRuleDirectives(feastFile).some(
    (directive) => isCommuneReferenceDirective(directive)
  );

  return {
    hasVespersSection,
    hasVespersViaCommune,
    hasCapitulumOnly: hasCapitulumVespera && !hasPsalmVespera
  };
}

function extractRuleDirectives(file: ParsedFile): readonly RuleDirective[] {
  const directives: RuleDirective[] = [];
  for (const section of file.sections) {
    if (section.header !== 'Rule' || !section.rules) {
      continue;
    }
    directives.push(...section.rules);
  }
  return directives;
}

function isCommuneReferenceDirective(directive: RuleDirective): boolean {
  if (directive.kind !== 'action') {
    return false;
  }
  const keyword = directive.keyword.trim().toLowerCase();
  if (keyword !== 'vide' && keyword !== 'ex') {
    return false;
  }
  const argument = directive.args.join(' ').trim();
  if (!argument) {
    return false;
  }
  const cleaned = argument.replace(/[;,\s]+$/gu, '');
  return /^commune(?:m|op|cist)?\//iu.test(cleaned) || /^c\d/iu.test(cleaned);
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function deriveFallbackVespersClass(
  celebration: Celebration,
  signals: FeastVespersSignals
): VespersClass {
  if (isTemporalSunday(celebration.feastRef.path)) {
    return 'totum';
  }

  if (signals.hasCapitulumOnly) {
    return 'capitulum';
  }

  if (signals.hasVespersSection || signals.hasVespersViaCommune) {
    return 'totum';
  }

  return 'nihil';
}

function isTemporalSunday(path: string): boolean {
  return path.startsWith('Tempora/') && path.endsWith('-0');
}
