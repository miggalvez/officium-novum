import {
  PRECEDENCE_1960_BY_CLASS,
  type ClassSymbol1960
} from '../occurrence/tables/precedence-1960.js';
import { buildCelebrationRuleSet as defaultBuildCelebrationRuleSet } from '../rules/evaluate.js';
import { rubrics1960ResolveRank } from '../sanctoral/rank-normalizer.js';
import type {
  Candidate,
  FeastReference,
  TemporalContext
} from '../types/model.js';
import type {
  PrecedenceRow,
  RubricalPolicy
} from '../types/policy.js';

const TRIDUUM_KEYS = new Set(['Quad6-4', 'Quad6-5', 'Quad6-6']);
const HOLY_WEEK_MON_WED_KEYS = new Set(['Quad6-1', 'Quad6-2', 'Quad6-3']);
const PRIVILEGED_TEMPORAL_CLASSES = new Set<ClassSymbol1960>([
  'I-privilegiata-sundays',
  'I-privilegiata-ash-wednesday',
  'I-privilegiata-holy-week-feria',
  'I-privilegiata-christmas-vigil',
  'I-privilegiata-rogation-monday'
]);

const FEASTS_OF_THE_LORD = new Set<string>([
  'Sancti/01-00',
  'Sancti/01-01',
  'Sancti/01-06',
  'Sancti/01-13',
  'Sancti/02-02',
  'Sancti/07-01',
  'Sancti/08-06',
  'Sancti/09-14',
  'Sancti/10-DU',
  'Sancti/11-09',
  'Sancti/11-18',
  'Sancti/12-25',
  'Tempora/Epi1-0',
  'Tempora/Nat2-0',
  'Tempora/Nat2-0r',
  'Tempora/Pent02-5'
]);

export const rubrics1960Policy: RubricalPolicy = {
  name: 'rubrics-1960',
  resolveRank: rubrics1960ResolveRank,
  precedenceRow(classSymbol: string): PrecedenceRow {
    const row = PRECEDENCE_1960_BY_CLASS.get(classSymbol as ClassSymbol1960);
    if (!row) {
      throw new Error(`Unknown Rubrics 1960 class symbol: ${classSymbol}`);
    }
    return row;
  },
  applySeasonPreemption(candidates: readonly Candidate[], temporal: TemporalContext) {
    if (!isTriduum(temporal)) {
      return {
        kept: [...candidates],
        suppressed: []
      };
    }

    const kept: Candidate[] = [];
    const suppressed: Array<{ readonly candidate: Candidate; readonly reason: string }> = [];

    for (const candidate of candidates) {
      if (candidate.source === 'temporal') {
        kept.push(candidate);
        continue;
      }
      suppressed.push({
        candidate,
        reason:
          'Sacred Triduum cannot be impeded; competing offices are omitted for the year.'
      });
    }

    return { kept, suppressed };
  },
  compareCandidates(a: Candidate, b: Candidate): number {
    const privilegedOverride = comparePrivilegedTemporal(a, b);
    if (privilegedOverride !== null) {
      return privilegedOverride;
    }

    if (a.rank.weight !== b.rank.weight) {
      return b.rank.weight - a.rank.weight;
    }

    if (a.source !== b.source) {
      return a.source === 'temporal' ? -1 : 1;
    }

    return a.feastRef.path.localeCompare(b.feastRef.path);
  },
  isPrivilegedFeria(temporal: TemporalContext): boolean {
    return (
      temporal.dayName === 'Quadp3-3' ||
      HOLY_WEEK_MON_WED_KEYS.has(temporal.dayName) ||
      temporal.dayName === 'Pasc5-1' ||
      temporal.date.endsWith('-12-24')
    );
  },
  buildCelebrationRuleSet(feastFile, commemorations, context) {
    return defaultBuildCelebrationRuleSet(feastFile, commemorations, context);
  },
  octavesEnabled(_feastRef: FeastReference): null {
    return null;
  }
};

function comparePrivilegedTemporal(a: Candidate, b: Candidate): number | null {
  const temporal = a.source === 'temporal' ? a : b.source === 'temporal' ? b : null;
  if (!temporal) {
    return null;
  }

  const sanctoral = temporal === a ? b : a;
  if (sanctoral.source !== 'sanctoral') {
    return null;
  }

  if (temporal.rank.classSymbol === 'I-privilegiata-triduum') {
    return temporal === a ? -1 : 1;
  }

  if (temporal.rank.classSymbol === 'II-ember-day') {
    // RI (1960) §95 treats Quattuor Tempora ferias as retaining their Office in occurrence.
    // Phase 2c models that by forcing ember ferias ahead of sanctoral competitors.
    return temporal === a ? -1 : 1;
  }

  if (
    temporal.rank.classSymbol === 'IV-lenten-feria' &&
    sanctoral.rank.classSymbol === 'III'
  ) {
    return temporal === a ? -1 : 1;
  }

  if (!PRIVILEGED_TEMPORAL_CLASSES.has(temporal.rank.classSymbol as ClassSymbol1960)) {
    return null;
  }

  // horascommon.pl:397-405 models the 1960 "Festum Domini" displacement on privileged Sundays
  // and includes the Immaculate Conception exception against Advent II.
  if (canDisplacePrivilegedTemporal(sanctoral)) {
    return temporal === a ? 1 : -1;
  }

  return temporal === a ? -1 : 1;
}

function canDisplacePrivilegedTemporal(candidate: Candidate): boolean {
  if (candidate.feastRef.path === 'Sancti/12-08') {
    return true;
  }

  return candidate.rank.classSymbol === 'I' && FEASTS_OF_THE_LORD.has(candidate.feastRef.path);
}

function isTriduum(temporal: TemporalContext): boolean {
  return TRIDUUM_KEYS.has(temporal.dayName);
}
