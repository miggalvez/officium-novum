import type {
  Condition,
  RuleActionDirective,
  RuleAssignmentDirective,
  RuleDirective
} from '@officium-novum/parser';

import type {
  AlternateLocation,
  CapitulumVariant,
  LessonSetAlternate,
  LessonSourceOverride,
  MatinsRuleSpec,
  OmittableSlot,
  PsalterScheme
} from '../types/rule-set.js';
import type { HourName } from '../types/ordo.js';

export type ClassifiedDirective =
  | { readonly target: 'celebration'; readonly effect: CelebrationEffect }
  | { readonly target: 'hour'; readonly effect: HourEffect }
  | { readonly target: 'missa' }
  | { readonly target: 'unmapped' };

export type CelebrationEffect =
  | { readonly kind: 'matins'; readonly value: MatinsRuleSpec }
  | { readonly kind: 'first-vespers'; readonly value: boolean }
  | { readonly kind: 'second-vespers'; readonly value: boolean }
  | { readonly kind: 'lesson-source'; readonly value: LessonSourceOverride }
  | { readonly kind: 'lesson-set-alternate'; readonly value: LessonSetAlternate }
  | { readonly kind: 'te-deum'; readonly value: 'forced' | 'suppressed' }
  | { readonly kind: 'festum-domini' }
  | { readonly kind: 'papal-office-name'; readonly value: string }
  | { readonly kind: 'papal-commemoration-name'; readonly value: string }
  | { readonly kind: 'conclusion-mode'; readonly value: 'sub-unica' }
  | { readonly kind: 'antiphon-scheme'; readonly value: 'proper-minor-hours' }
  | { readonly kind: 'doxology'; readonly value: string }
  | { readonly kind: 'omit-commemoration' }
  | { readonly kind: 'comkey'; readonly value: string }
  | { readonly kind: 'suffragium'; readonly value: string }
  | { readonly kind: 'no-suffragium' }
  | { readonly kind: 'quorum-festum' }
  | { readonly kind: 'commemoratio3' }
  | { readonly kind: 'una-antiphona' };

export type HourEffect =
  | {
      readonly kind: 'omit';
      readonly slots: readonly OmittableSlot[];
      readonly hours?: readonly HourName[];
      readonly omitCommemoration: boolean;
    }
  | {
      readonly kind: 'psalter-scheme';
      readonly value: PsalterScheme;
      readonly hours?: readonly HourName[];
    }
  | {
      readonly kind: 'psalm-override';
      readonly key: string;
      readonly value: string;
      readonly hours?: readonly HourName[];
    }
  | {
      readonly kind: 'matins-lesson-introduction';
      readonly value: 'ordinary' | 'pater-totum-secreto';
      readonly hours?: readonly HourName[];
    }
  | {
      readonly kind: 'minor-hours-sine-antiphona';
      readonly value: true;
      readonly hours?: readonly HourName[];
    }
  | {
      readonly kind: 'minor-hours-ferial-psalter';
      readonly value: true;
      readonly hours?: readonly HourName[];
    }
  | {
      readonly kind: 'capitulum-variant';
      readonly value: CapitulumVariant;
      readonly hours?: readonly HourName[];
    }
  | {
      readonly kind: 'horas1960-feria';
      readonly value: true;
      readonly hours?: readonly HourName[];
    }
  | {
      readonly kind: 'hour-flag';
      readonly value:
        | 'preces-feriales'
        | 'versum-feria'
        | 'responsory-feria'
        | 'gloria-responsory'
        | 'vespers-defunctorum';
      readonly hours?: readonly HourName[];
    };

export function classifyDirective(directive: RuleDirective): ClassifiedDirective {
  if (directive.kind === 'reference') {
    return { target: 'unmapped' };
  }

  if (directive.kind === 'assignment') {
    return classifyAssignment(directive);
  }

  return classifyAction(directive);
}

function classifyAssignment(directive: RuleAssignmentDirective): ClassifiedDirective {
  const key = normalizeToken(directive.key);
  const value = directive.value.trim();

  // file-format-spec §6 line 641: Doxology=Nat/Epi/Asc/Corp/Heart.
  if (key === 'doxology') {
    return {
      target: 'celebration',
      effect: {
        kind: 'doxology',
        value
      }
    };
  }

  // file-format-spec §6 line 647: OPapaM=... and CPapaC=....
  if (key === 'opapam') {
    return {
      target: 'celebration',
      effect: {
        kind: 'papal-office-name',
        value
      }
    };
  }

  // file-format-spec §6 line 647: OPapaM=... and CPapaC=....
  if (key === 'cpapac') {
    return {
      target: 'celebration',
      effect: {
        kind: 'papal-commemoration-name',
        value
      }
    };
  }

  // corpus examples in file-format-spec §6 notes: Comkey=20 / Comkey=70.
  if (key === 'comkey') {
    return {
      target: 'celebration',
      effect: {
        kind: 'comkey',
        value
      }
    };
  }

  // corpus examples in file-format-spec §6 notes: Suffr=... and Suffragium=....
  if (key === 'suffr' || key === 'suffragium') {
    return {
      target: 'celebration',
      effect: {
        kind: 'suffragium',
        value
      }
    };
  }

  // file-format-spec §6 lines 635-637: Psalm5Vespera=116 and Prima=53.
  if (/^(psalm\d+vespera\d*|prima)$/u.test(key)) {
    return {
      target: 'hour',
      effect: {
        kind: 'psalm-override',
        key: canonicalPsalmKey(directive.key),
        value
      }
    };
  }

  // file-format-spec §6 line 653 + corpus Missa directives.
  if (key === 'prefatio') {
    return { target: 'missa' };
  }

  return { target: 'unmapped' };
}

function classifyAction(directive: RuleActionDirective): ClassifiedDirective {
  const normalized = normalizeAction(directive);
  const words = normalized.split(' ').filter((word) => word.length > 0);
  const hours = extractHourScope(normalized);

  // file-format-spec §6 lines 622-626: lesson/nocturn matins shape directives.
  const matins = parseMatins(normalized);
  if (matins) {
    return {
      target: 'celebration',
      effect: {
        kind: 'matins',
        value: matins
      }
    };
  }

  // Tridentine/Monastic-only legacy form ("1 et 2 lectiones") is intentionally
  // left unmapped in Phase 2d's 1960-focused scope and tracked via diagnostics.
  if (normalized === '1 et 2 lectiones') {
    return { target: 'unmapped' };
  }

  // file-format-spec §6 line 646: no prima vespera.
  if (/^no\s+prima\s+vespera(?:s)?$/u.test(normalized)) {
    return {
      target: 'celebration',
      effect: {
        kind: 'first-vespers',
        value: false
      }
    };
  }

  // file-format-spec §6 line 645: no secunda vespera.
  if (/^no\s+secunda\s+vespera(?:s)?$/u.test(normalized)) {
    return {
      target: 'celebration',
      effect: {
        kind: 'second-vespers',
        value: false
      }
    };
  }

  // file-format-spec §6 lines 642-644: Lectio1 tempora/OctNat/TempNat/Quad/scriptura1960.
  const lessonSource = parseLessonSource(normalized);
  if (lessonSource) {
    return {
      target: 'celebration',
      effect: {
        kind: 'lesson-source',
        value: lessonSource
      }
    };
  }

  // file-format-spec §6 line 649: in N Nocturno Lectiones ex Commune in M loco.
  const lessonSetAlternate = parseLessonSetAlternate(normalized, directive.condition);
  if (lessonSetAlternate) {
    return {
      target: 'celebration',
      effect: {
        kind: 'lesson-set-alternate',
        value: lessonSetAlternate
      }
    };
  }

  // file-format-spec §6 line 639 + corpus variant "no Te Deum".
  if (normalized === 'feria te deum') {
    return {
      target: 'celebration',
      effect: {
        kind: 'te-deum',
        value: 'forced'
      }
    };
  }
  if (normalized === 'no te deum') {
    return {
      target: 'celebration',
      effect: {
        kind: 'te-deum',
        value: 'suppressed'
      }
    };
  }

  // file-format-spec §6 line 640 + corpus shorthand "Domini".
  if (normalized === 'festum domini' || normalized === 'domini') {
    return {
      target: 'celebration',
      effect: {
        kind: 'festum-domini'
      }
    };
  }

  // file-format-spec §6 line 648: Sub unica concl.
  if (normalized === 'sub unica concl') {
    return {
      target: 'celebration',
      effect: {
        kind: 'conclusion-mode',
        value: 'sub-unica'
      }
    };
  }

  // file-format-spec §6 line 638: Antiphonas horas.
  if (normalized === 'antiphonas horas') {
    return {
      target: 'celebration',
      effect: {
        kind: 'antiphon-scheme',
        value: 'proper-minor-hours'
      }
    };
  }

  // file-format-spec §6 line 627 + corpus variants with no/Omit commemoration.
  if (isNoCommemoration(normalized)) {
    return {
      target: 'celebration',
      effect: {
        kind: 'omit-commemoration'
      }
    };
  }

  // file-format-spec §6 line 627 + corpus extended Omit forms.
  if (words[0] === 'omit') {
    const omit = parseOmitDirective(normalized, hours);
    return {
      target: 'hour',
      effect: omit
    };
  }

  // corpus examples in Tempora/Sancti: No Suffragium / No suffragium.
  if (normalized === 'no suffragium') {
    return {
      target: 'celebration',
      effect: {
        kind: 'no-suffragium'
      }
    };
  }

  // corpus examples: Quorum Festum / Quarum festum.
  if (normalized === 'quorum festum' || normalized === 'quarum festum') {
    return {
      target: 'celebration',
      effect: {
        kind: 'quorum-festum'
      }
    };
  }

  // corpus example: commemoratio3.
  if (normalized === 'commemoratio3') {
    return {
      target: 'celebration',
      effect: {
        kind: 'commemoratio3'
      }
    };
  }

  // file-format-spec §6 line 650: Una Antiphona.
  if (normalized === 'una antiphona') {
    return {
      target: 'celebration',
      effect: {
        kind: 'una-antiphona'
      }
    };
  }

  // file-format-spec §6 line 634 + corpus variant Psalmi Feria.
  if (normalized === 'psalmi dominica' || normalized === 'psalmi feria') {
    return {
      target: 'hour',
      effect: {
        kind: 'psalter-scheme',
        value: normalized.endsWith('dominica') ? 'dominica' : 'ferial',
        hours
      }
    };
  }

  // Corpus examples: Tempora/Quad6-[4-6], Commune/C9, Sancti/11-02.
  if (normalized === 'limit benedictiones oratio') {
    return {
      target: 'hour',
      effect: {
        kind: 'matins-lesson-introduction',
        value: 'pater-totum-secreto',
        hours: ['matins']
      }
    };
  }

  // file-format-spec §6 line 629: Minores sine Antiphona.
  if (normalized === 'minores sine antiphona') {
    return {
      target: 'hour',
      effect: {
        kind: 'minor-hours-sine-antiphona',
        value: true,
        hours
      }
    };
  }

  // file-format-spec §6 lines 630 + corpus variant Psalmi minores Dominica.
  if (normalized === 'psalmi minores ex psalterio') {
    return {
      target: 'hour',
      effect: {
        kind: 'minor-hours-ferial-psalter',
        value: true,
        hours
      }
    };
  }
  if (normalized === 'psalmi minores dominica') {
    return {
      target: 'hour',
      effect: {
        kind: 'psalter-scheme',
        value: 'dominica',
        hours: minorHours()
      }
    };
  }

  // file-format-spec §6 lines 631-633: Capitulum Versum 2 variants.
  const capitulumVariant = parseCapitulumVariant(normalized);
  if (capitulumVariant) {
    return {
      target: 'hour',
      effect: capitulumVariant
    };
  }

  // corpus example Sancti/10-02: Horas1960 feria.
  if (normalized === 'horas1960 feria') {
    return {
      target: 'hour',
      effect: {
        kind: 'horas1960-feria',
        value: true,
        hours: minorHours()
      }
    };
  }

  // corpus examples: Preces feriales / Versum Feria / Responsory Feria / Gloria responsory.
  if (normalized === 'preces feriales') {
    return {
      target: 'hour',
      effect: {
        kind: 'hour-flag',
        value: 'preces-feriales',
        hours
      }
    };
  }
  if (normalized === 'versum feria') {
    return {
      target: 'hour',
      effect: {
        kind: 'hour-flag',
        value: 'versum-feria',
        hours
      }
    };
  }
  if (normalized === 'responsory feria') {
    return {
      target: 'hour',
      effect: {
        kind: 'hour-flag',
        value: 'responsory-feria',
        hours
      }
    };
  }
  if (normalized === 'gloria responsory') {
    return {
      target: 'hour',
      effect: {
        kind: 'hour-flag',
        value: 'gloria-responsory',
        hours
      }
    };
  }

  // corpus example Sancti/11-01: Vesperae Defunctorum.
  if (normalized === 'vespera defunctorum' || normalized === 'vesperae defunctorum') {
    return {
      target: 'hour',
      effect: {
        kind: 'hour-flag',
        value: 'vespers-defunctorum',
        hours: ['vespers']
      }
    };
  }

  // file-format-spec §6 lines 635-637 + corpus spacing variants.
  const psalmOverride = parseActionPsalmOverride(normalized);
  if (psalmOverride) {
    return {
      target: 'hour',
      effect: {
        kind: 'psalm-override',
        key: psalmOverride.key,
        value: psalmOverride.value,
        hours: psalmOverride.hours
      }
    };
  }

  // corpus examples in Christmas octave: no Psalm5.
  if (normalized === 'no psalm5') {
    return {
      target: 'hour',
      effect: {
        kind: 'psalm-override',
        key: 'Psalm5',
        value: 'omit',
        hours: ['vespers']
      }
    };
  }

  // file-format-spec §6 lines 651-654 + corpus variants.
  if (
    normalized === 'credo' ||
    normalized === 'gloria' ||
    normalized === 'oratio dominica' ||
    normalized === 'requiem gloria' ||
    normalized === 'no gloria'
  ) {
    return { target: 'missa' };
  }

  return { target: 'unmapped' };
}

function parseMatins(normalized: string): MatinsRuleSpec | null {
  const lessonsMatch = /^(3|9|12)\s+lectiones(?:\s+([a-z0-9-]+))?$/u.exec(normalized);
  if (lessonsMatch) {
    const count = Number(lessonsMatch[1]);
    const qualifier = lessonsMatch[2];
    if (count === 3 || count === 9 || count === 12) {
      return {
        lessonCount: count,
        nocturns: count === 3 ? 1 : 3,
        ...(qualifier ? { rubricGate: qualifier } : {})
      };
    }
  }

  if (normalized === '1 nocturn') {
    return {
      lessonCount: 3,
      nocturns: 1
    };
  }

  return null;
}

function parseLessonSource(normalized: string): LessonSourceOverride | null {
  if (normalized === 'scriptura1960') {
    return {
      lesson: 1,
      source: 'scriptura1960'
    };
  }

  const match = /^lectio\s*1\s+(tempora|octnat|tempnat|quad)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  const sourceRaw = match[1];
  const source =
    sourceRaw === 'octnat'
      ? 'OctNat'
      : sourceRaw === 'tempnat'
        ? 'TempNat'
        : sourceRaw === 'quad'
          ? 'Quad'
          : 'tempora';

  return {
    lesson: 1,
    source
  };
}

function parseLessonSetAlternate(
  normalized: string,
  gate: Condition | undefined
): LessonSetAlternate | null {
  const match =
    /^in\s+([123])\s+nocturno\s+lectiones\s+ex\s+commune\s+(?:in\s+)?([123])\s+loco$/u.exec(
      normalized
    );
  if (!match) {
    return null;
  }

  const nocturn = Number(match[1]);
  const location = Number(match[2]);
  if (!isNocturn(nocturn) || !isLocation(location)) {
    return null;
  }

  const alternate: AlternateLocation = {
    location,
    ...(gate ? { gate } : {})
  };

  return { nocturn, alternate };
}

function parseCapitulumVariant(normalized: string): Extract<HourEffect, { kind: 'capitulum-variant' }> | null {
  if (normalized === 'capitulum versum 2') {
    return {
      kind: 'capitulum-variant',
      value: {
        scheme: 2
      }
    };
  }

  if (normalized === 'capitulum versum 2 ad laudes et vesperas') {
    return {
      kind: 'capitulum-variant',
      value: {
        scheme: 2,
        scope: 'lauds-vespers'
      },
      hours: ['lauds', 'vespers']
    };
  }

  if (normalized === 'capitulum versum 2 ad laudes tantum') {
    return {
      kind: 'capitulum-variant',
      value: {
        scheme: 2,
        scope: 'lauds'
      },
      hours: ['lauds']
    };
  }

  return null;
}

function parseActionPsalmOverride(
  normalized: string
): { readonly key: string; readonly value: string; readonly hours?: readonly HourName[] } | null {
  const match = /^psalm\s*(\d+)\s+([a-z0-9]+)\s*=\s*([a-z0-9-]+)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  const number = match[1];
  const slotRaw = match[2];
  const value = match[3];
  if (!number || !slotRaw || !value) {
    return null;
  }

  return {
    key: `Psalm${number}${capitalize(slotRaw)}`,
    value,
    hours: slotRaw.startsWith('vespera') ? ['vespers'] : undefined
  };
}

function parseOmitDirective(
  normalized: string,
  hours: readonly HourName[] | undefined
): Extract<HourEffect, { kind: 'omit' }> {
  const slots: OmittableSlot[] = [];

  if (containsWord(normalized, 'hymnus')) {
    slots.push('hymnus');
  }
  if (containsWord(normalized, 'martyrologium')) {
    slots.push('martyrologium');
  }
  if (containsWord(normalized, 'preces')) {
    slots.push('preces');
  }
  if (containsWord(normalized, 'suffragium')) {
    slots.push('suffragium');
  }
  if (containsWord(normalized, 'incipit')) {
    slots.push('incipit');
  }
  if (containsWord(normalized, 'invitatorium')) {
    slots.push('invitatorium');
  }
  if (containsPhrase(normalized, 'te deum')) {
    slots.push('tedeum');
  }
  if (containsPhrase(normalized, 'gloria patri')) {
    slots.push('gloria-patri');
  }

  return {
    kind: 'omit',
    slots: dedupe(slots),
    hours,
    omitCommemoration: /\bcommemorati(?:o|on)\b/u.test(normalized)
  };
}

function extractHourScope(normalized: string): readonly HourName[] | undefined {
  if (containsPhrase(normalized, 'ad matutinum')) {
    return ['matins'];
  }

  if (containsPhrase(normalized, 'ad laudes et vesperas')) {
    return ['lauds', 'vespers'];
  }

  if (containsPhrase(normalized, 'ad laudes tantum')) {
    return ['lauds'];
  }

  if (containsPhrase(normalized, 'ad vesperas') || containsPhrase(normalized, 'ad vespera')) {
    return ['vespers'];
  }

  return undefined;
}

function isNoCommemoration(normalized: string): boolean {
  return (
    normalized === 'no commemoratio' ||
    normalized === 'no commemoration' ||
    normalized === 'no sunday commemoratio'
  );
}

function normalizeAction(directive: RuleActionDirective): string {
  const words = [directive.keyword, ...directive.args]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => value.replace(/[;:,.]+$/gu, ''))
    .map((value) => normalizeToken(value));

  return words.join(' ').replace(/\s+/gu, ' ').trim();
}

function canonicalPsalmKey(key: string): string {
  const normalized = key.trim();
  const compact = normalized.replace(/\s+/gu, '');

  if (/^prima$/iu.test(compact)) {
    return 'Prima';
  }

  const match = /^psalm(\d+)([a-z0-9]+)$/iu.exec(compact);
  if (!match) {
    return normalized;
  }

  const number = match[1];
  const slot = match[2];
  if (!number || !slot) {
    return normalized;
  }

  return `Psalm${number}${capitalize(slot)}`;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/gu, ' ');
}

function containsWord(source: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, 'u').test(source);
}

function containsPhrase(source: string, phrase: string): boolean {
  return source.includes(phrase);
}

function minorHours(): readonly HourName[] {
  return ['prime', 'terce', 'sext', 'none'];
}

function capitalize(value: string): string {
  const base = normalizeToken(value).replace(/[^a-z0-9]+/gu, '');
  if (base.length === 0) {
    return value;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function dedupe<T>(items: readonly T[]): readonly T[] {
  const output: T[] = [];
  const seen = new Set<T>();

  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    output.push(item);
  }

  return output;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isNocturn(value: number): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isLocation(value: number): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}
