import { parseRuleLine, type RuleDirective } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import { classifyDirective } from '../../src/rules/classify.js';

describe('classifyDirective', () => {
  const cases: ReadonlyArray<{
    readonly line: string;
    readonly target: 'celebration' | 'hour' | 'missa' | 'unmapped';
    readonly effectKind?: string;
  }> = [
    { line: '9 lectiones', target: 'celebration', effectKind: 'matins' },
    { line: '9 lectiones 1960', target: 'celebration', effectKind: 'matins' },
    { line: '3 lectiones', target: 'celebration', effectKind: 'matins' },
    { line: '12 lectiones', target: 'celebration', effectKind: 'matins' },
    { line: '1 nocturn', target: 'celebration', effectKind: 'matins' },
    { line: 'No prima Vespera', target: 'celebration', effectKind: 'first-vespers' },
    { line: 'No secunda Vespera', target: 'celebration', effectKind: 'second-vespers' },
    { line: 'Lectio1 tempora', target: 'celebration', effectKind: 'lesson-source' },
    { line: 'Lectio1 OctNat', target: 'celebration', effectKind: 'lesson-source' },
    { line: 'Lectio1 TempNat', target: 'celebration', effectKind: 'lesson-source' },
    { line: 'Lectio1 Quad', target: 'celebration', effectKind: 'lesson-source' },
    { line: 'scriptura1960', target: 'celebration', effectKind: 'lesson-source' },
    {
      line: 'in 3 Nocturno Lectiones ex Commune in 3 loco',
      target: 'celebration',
      effectKind: 'lesson-set-alternate'
    },
    { line: 'Feria Te Deum', target: 'celebration', effectKind: 'te-deum' },
    { line: 'Festum Domini', target: 'celebration', effectKind: 'festum-domini' },
    { line: 'Domini', target: 'celebration', effectKind: 'festum-domini' },
    { line: 'OPapaM=Ioannes', target: 'celebration', effectKind: 'papal-office-name' },
    {
      line: 'CPapaC=Ioannes',
      target: 'celebration',
      effectKind: 'papal-commemoration-name'
    },
    { line: 'Sub unica concl', target: 'celebration', effectKind: 'conclusion-mode' },
    { line: 'Antiphonas horas', target: 'celebration', effectKind: 'antiphon-scheme' },
    { line: 'Doxology=Nat', target: 'celebration', effectKind: 'doxology' },
    { line: 'No commemoratio', target: 'celebration', effectKind: 'omit-commemoration' },
    { line: 'Omit Hymnus Preces Suffragium Commemoratio', target: 'hour', effectKind: 'omit' },
    { line: 'Comkey=20', target: 'celebration', effectKind: 'comkey' },
    { line: 'Suffr=Maria3;;Ecclesiæ;Papa', target: 'celebration', effectKind: 'suffragium' },
    { line: 'No Suffragium', target: 'celebration', effectKind: 'no-suffragium' },
    { line: 'Quorum Festum', target: 'celebration', effectKind: 'quorum-festum' },
    { line: 'commemoratio3', target: 'celebration', effectKind: 'commemoratio3' },
    { line: 'Una Antiphona', target: 'celebration', effectKind: 'una-antiphona' },
    { line: 'Psalmi Dominica', target: 'hour', effectKind: 'psalter-scheme' },
    { line: 'Psalmi Feria', target: 'hour', effectKind: 'psalter-scheme' },
    { line: 'Psalm5 Vespera=116', target: 'hour', effectKind: 'psalm-override' },
    { line: 'Psalm5 Vespera3=138', target: 'hour', effectKind: 'psalm-override' },
    { line: 'Psalm5Vespera=116', target: 'hour', effectKind: 'psalm-override' },
    { line: 'Prima=53', target: 'hour', effectKind: 'psalm-override' },
    { line: 'no Psalm5', target: 'hour', effectKind: 'psalm-override' },
    { line: 'Minores sine Antiphona', target: 'hour', effectKind: 'minor-hours-sine-antiphona' },
    {
      line: 'Psalmi minores ex Psalterio',
      target: 'hour',
      effectKind: 'minor-hours-ferial-psalter'
    },
    { line: 'Psalmi minores Dominica', target: 'hour', effectKind: 'psalter-scheme' },
    { line: 'Capitulum Versum 2', target: 'hour', effectKind: 'capitulum-variant' },
    {
      line: 'Capitulum Versum 2 ad Laudes et Vesperas',
      target: 'hour',
      effectKind: 'capitulum-variant'
    },
    {
      line: 'Capitulum Versum 2 ad Laudes tantum',
      target: 'hour',
      effectKind: 'capitulum-variant'
    },
    { line: 'Horas1960 feria', target: 'hour', effectKind: 'horas1960-feria' },
    { line: 'Preces feriales', target: 'hour', effectKind: 'hour-flag' },
    { line: 'Versum Feria', target: 'hour', effectKind: 'hour-flag' },
    { line: 'Responsory Feria', target: 'hour', effectKind: 'hour-flag' },
    { line: 'Gloria responsory', target: 'hour', effectKind: 'hour-flag' },
    {
      line: 'Omit ad Matutinum Incipit Invitatorium Hymnus',
      target: 'hour',
      effectKind: 'omit'
    },
    { line: 'Vesperae Defunctorum', target: 'hour', effectKind: 'hour-flag' },
    { line: 'Credo', target: 'missa' },
    { line: 'Gloria', target: 'missa' },
    { line: 'Prefatio=Nat', target: 'missa' },
    { line: 'Oratio Dominica', target: 'missa' },
    { line: 'Requiem gloria', target: 'missa' },
    { line: 'vide Sancti/01-01', target: 'unmapped' },
    { line: 'ex Sancti/12-25m3;', target: 'unmapped' },
    { line: '1 et 2 lectiones', target: 'unmapped' },
    { line: 'Symbolum Athanasium', target: 'unmapped' }
  ];

  for (const entry of cases) {
    it(`classifies '${entry.line}' as ${entry.target}`, () => {
      const directive = parseOrThrow(entry.line);
      const classified = classifyDirective(directive);

      expect(classified.target).toBe(entry.target);

      if (entry.target === 'celebration' || entry.target === 'hour') {
        expect(classified.effect.kind).toBe(entry.effectKind);
      }
    });
  }
});

function parseOrThrow(line: string): RuleDirective {
  const directive = parseRuleLine(line);
  if (!directive) {
    throw new Error(`Failed to parse rule line: ${line}`);
  }

  return directive;
}
