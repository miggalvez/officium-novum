import type {
  PsalmAssignment,
  TextReference
} from '../types/hour-structure.js';
import type { TextContent } from '@officium-novum/parser';

import type { Celebration, HourName } from '../types/ordo.js';
import type { OfficeTextIndex, TemporalContext } from '../types/model.js';
import type {
  CelebrationRuleSet,
  HourRuleSet,
  PsalmOverride
} from '../types/rule-set.js';

export interface SelectPsalmodyInput {
  readonly policyName?: 'divino-afflatu' | 'reduced-1955' | 'rubrics-1960';
  readonly hour: HourName;
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly hourRules: HourRuleSet;
  readonly temporal: TemporalContext;
  readonly corpus: OfficeTextIndex;
  readonly omitPrimeBracketPsalm?: boolean;
  readonly vespersSide?: 'first' | 'second';
}

const PSALMI_MAJOR = 'horas/Latin/Psalterium/Psalmi/Psalmi major';
const PSALMI_MINOR = 'horas/Latin/Psalterium/Psalmi/Psalmi minor';
const PSALMORUM_ROOT = 'horas/Latin/Psalterium/Psalmorum';

/**
 * Roman 1960 psalter selection per §16.2.
 *
 * Emits {@link TextReference}s keyed into the shared Psalterium data files.
 * The actual psalm numbers live in `Psalterium/Psalmi/Psalmi major.txt` and
 * `Psalmi minor.txt`; this function only names the section (e.g. `Day0 Vespera`
 * for Sunday Vespers). Phase 3 dereferences those sections to text.
 */
export function selectPsalmodyRoman1960(
  params: SelectPsalmodyInput
): readonly PsalmAssignment[] {
  const { hour, hourRules, temporal, celebrationRules } = params;
  let assignments: readonly PsalmAssignment[];

  if (hourRules.psalterScheme === 'proper') {
    assignments = properFeastReferences(params);
  } else if (hourRules.psalterScheme === 'festal' && !isTemporalCelebration(params)) {
    assignments = festalReferences(params);
  } else if (hour === 'prime' || hour === 'terce' || hour === 'sext' || hour === 'none') {
    assignments = minorHourReferences({
      ...params,
      hour
    });
  } else if (hour === 'compline') {
    assignments = complineReferences(params);
  } else {
    // §16.2 step 4: `psalterScheme === 'dominica'` (e.g. `Psalmi Dominica` in a
    // feast's [Rule]) forces the Sunday distribution even on a weekday.
    const useDominicaRule =
      hourRules.psalterScheme === 'dominica' &&
      !(
        hour === 'vespers' &&
        params.vespersSide === 'first' &&
        params.celebration.source === 'temporal' &&
        !params.celebrationRules.festumDomini
      );
    const useSundayPsalmody =
      useDominicaRule || isSundayForMajorHour(hour, temporal);

    if (hour === 'lauds') {
      assignments = laudsReferences(params, useSundayPsalmody, useDominicaRule);
    } else if (hour === 'vespers') {
      assignments = vespersReferences(temporal, useSundayPsalmody);
    } else {
      assignments = [];
    }
  }

  return applyPsalmodyAntiphonOverride(
    appendQuicumqueAtPrime(applyPsalmOverrides(assignments, params), params),
    hourRules.psalmodyAntiphonOverride
  );
}

function applyPsalmodyAntiphonOverride(
  assignments: readonly PsalmAssignment[],
  override: SelectPsalmodyInput['hourRules']['psalmodyAntiphonOverride']
): readonly PsalmAssignment[] {
  if (!override || assignments.length === 0) {
    return assignments;
  }

  switch (override.application) {
    case 'whole-slot':
      return Object.freeze(
        assignments.map((assignment) => ({
          ...assignment,
          antiphonRef: override.ref
        }))
      );
  }
}

function appendQuicumqueAtPrime(
  assignments: readonly PsalmAssignment[],
  params: SelectPsalmodyInput
): readonly PsalmAssignment[] {
  // The `Symbolum Athanasium` rule directive — present on Trinity Sunday
  // (`Pent01-0`), the Sundays after Epiphany, several Sundays after
  // Pentecost, and the Tridentine Quadragesima Sundays — appends the
  // Athanasian Creed (Psalm 234) to Sunday Prime psalmody. Mirrors the
  // `quicumque` push at `upstream/web/cgi-bin/horas/specials/psalmi.pl:296-309`
  // gated on Sunday + Prime + winner-from-Tempora; the `(rubrica 196)` clause
  // there limits the year-round default to Trinity Sunday for 1955/1960,
  // which the source files encode by stamping `Symbolum Athanasium` only on
  // the surviving Sundays under those rubrics. We honor whatever the rule
  // says.
  if (
    params.hour !== 'prime' ||
    params.temporal.dayOfWeek !== 0 ||
    !params.celebrationRules.symbolumAthanasium
  ) {
    return assignments;
  }
  return Object.freeze([
    ...assignments,
    {
      psalmRef: {
        path: `${PSALMORUM_ROOT}/Psalm234`,
        section: '__preamble'
      }
    }
  ]);
}

function isSundayForMajorHour(hour: HourName, temporal: TemporalContext): boolean {
  return (hour === 'lauds' || hour === 'vespers') && temporal.dayOfWeek === 0;
}

function laudsReferences(
  params: SelectPsalmodyInput,
  useSundayPsalmody: boolean,
  useDominicaRule: boolean
): readonly PsalmAssignment[] {
  const { temporal } = params;
  const useLateAdventAntiphons =
    isTemporalCelebration(params) && usesLateAdventWeekdayAntiphons(temporal);
  const scheme = usesSecondLaudsSchemeRoman1960(params, useDominicaRule)
    ? 'Laudes2'
    : 'Laudes1';
  const weekday = useSundayPsalmody ? 0 : temporal.dayOfWeek;
  const section = `Day${weekday} ${scheme}`;
  const assignments = numberedSectionAssignments(PSALMI_MAJOR, section, 5);
  if (!useLateAdventAntiphons) {
    return assignments;
  }

  const antiphonSection = `Day${weekday} Laudes3`;
  return Object.freeze(
    assignments.map((assignment, index) => ({
      ...assignment,
      antiphonRef: {
        path: PSALMI_MAJOR,
        section: antiphonSection,
        selector: String(index + 1)
      }
    }))
  );
}

function usesSecondLaudsSchemeRoman1960(
  params: SelectPsalmodyInput,
  useDominicaRule: boolean
): boolean {
  // Breviary 1960 no. 197 assigns Laudes II by family: Septuagesima/Lent/
  // Passiontide Sundays, ferias in the penitential seasons including Advent,
  // the ferial Office of the September Ember Days, and II/III class vigils
  // outside Paschaltide.
  if (params.celebrationRules.festumDomini || useDominicaRule) {
    return false;
  }

  const { celebration, temporal } = params;
  if (isSecondLaudsSunday(temporal)) {
    return true;
  }

  if (isFerialOffice(celebration)) {
    return isSecondLaudsFerialSeason(temporal) || isSeptemberEmberFeria(temporal);
  }

  return isSecondOrThirdClassVigilOutsidePaschaltide(celebration, temporal);
}

function isSecondLaudsSunday(temporal: TemporalContext): boolean {
  return (
    temporal.dayOfWeek === 0 &&
    (
      temporal.season === 'septuagesima' ||
      temporal.season === 'lent' ||
      temporal.season === 'passiontide'
    )
  );
}

function isFerialOffice(celebration: Celebration): boolean {
  return celebration.source === 'temporal' && celebration.kind !== 'vigil';
}

function isSecondLaudsFerialSeason(temporal: TemporalContext): boolean {
  return (
    temporal.dayOfWeek !== 0 &&
    (
      temporal.season === 'advent' ||
      temporal.season === 'septuagesima' ||
      temporal.season === 'lent' ||
      temporal.season === 'passiontide' ||
      temporal.dayName === 'Quadp3-3'
    )
  );
}

function isSeptemberEmberFeria(temporal: TemporalContext): boolean {
  return (
    temporal.season === 'time-after-pentecost' &&
    temporal.rank.classSymbol === 'II-ember-day' &&
    /^Pent/u.test(temporal.dayName)
  );
}

function isSecondOrThirdClassVigilOutsidePaschaltide(
  celebration: Celebration,
  temporal: TemporalContext
): boolean {
  if (
    celebration.kind !== 'vigil' ||
    (celebration.rank.classSymbol !== 'II' && celebration.rank.classSymbol !== 'III')
  ) {
    return false;
  }

  return !isPaschaltideSeason(temporal.season);
}

function isPaschaltideSeason(season: TemporalContext['season']): boolean {
  return season === 'eastertide' || season === 'ascensiontide' || season === 'pentecost-octave';
}

function vespersReferences(
  temporal: TemporalContext,
  useSundayPsalmody: boolean
): readonly PsalmAssignment[] {
  const weekday = useSundayPsalmody ? 0 : temporal.dayOfWeek;
  const section = `Day${weekday} Vespera`;
  return numberedSectionAssignments(PSALMI_MAJOR, section, 5);
}

function complineReferences(params: SelectPsalmodyInput): readonly PsalmAssignment[] {
  // Pius X's Compline (1911) varies by day of week; 1960 retains that
  // distribution — the source file stores it as weekday-keyed entries under
  // the shared `Completorium` section in `Psalmi minor.txt`.
  const { temporal, corpus, hourRules, policyName } = params;
  const weekday =
    policyName === 'rubrics-1960' &&
    hourRules.psalterScheme === 'dominica' &&
    !usesActualSaturdayComplineForTemporalSunday(params)
      ? 0
      : temporal.dayOfWeek;
  const weekdayKey = WEEKDAY_KEYS[weekday] ?? WEEKDAY_KEYS[0] ?? 'Dominica';
  const assignments = resolveWeekdayMinorHourAssignments(corpus, 'Completorium', weekdayKey, {
    includePrimeBracketPsalm: true,
    suppressAntiphon: hourRules.minorHoursSineAntiphona
  });
  const keyed =
    assignments.length > 0
      ? assignments
      : [
          {
            psalmRef: { path: PSALMI_MINOR, section: 'Completorium', selector: weekdayKey }
          }
        ];

  // Upstream treats `Minores sine Antiphona` as covering Roman Compline
  // psalmody too: the psalms are retained, but no seasonal psalmody antiphon
  // is applied before or after them.
  if (hourRules.minorHoursSineAntiphona) {
    return keyed;
  }

  if (
    temporal.season !== 'eastertide' &&
    temporal.season !== 'ascensiontide' &&
    temporal.season !== 'pentecost-octave'
  ) {
    return keyed;
  }

  return Object.freeze(
    keyed.map((assignment) => ({
      ...assignment,
      antiphonRef: {
        path: PSALMI_MINOR,
        section: 'Pasch',
        selector: '1'
      }
    }))
  );
}

function usesActualSaturdayComplineForTemporalSunday(params: SelectPsalmodyInput): boolean {
  const isFestiveOrSemifestiveTemporalSunday =
    params.celebration.rank.classSymbol === 'I' || params.celebrationRules.festumDomini;
  return (
    params.policyName === 'rubrics-1960' &&
    params.hour === 'compline' &&
    params.temporal.dayOfWeek === 6 &&
    params.celebration.source === 'temporal' &&
    /-0$/u.test(params.temporal.dayName) &&
    !params.temporal.dayName.startsWith('Nat') &&
    !isFestiveOrSemifestiveTemporalSunday
  );
}

function minorHourReferences(
  params: SelectPsalmodyInput & {
    readonly hour: 'prime' | 'terce' | 'sext' | 'none';
  }
): readonly PsalmAssignment[] {
  const { hour, temporal, hourRules, corpus } = params;
  if (hourRules.minorHoursFerialPsalter) {
    return weekdayMinorHourReferences(params);
  }

  const useSundayOrFestalMinorHours =
    temporal.dayOfWeek === 0 || hourRules.psalterScheme === 'dominica';
  if (useSundayOrFestalMinorHours) {
    const selectors = tridentinumMinorHourSelectors(
      hour,
      temporal.dayOfWeek === 0,
      temporal.dayName,
      params.celebrationRules.antiphonScheme === 'proper-minor-hours'
    );
    for (const selector of selectors) {
      const assignments = resolveTridentinumMinorHourAssignments(
        corpus,
        selector,
        hourRules.minorHoursSineAntiphona
      );
      if (assignments.length > 0) {
        return assignments;
      }
    }
  }

  return weekdayMinorHourReferences(params);
}

function weekdayMinorHourReferences(
  params: SelectPsalmodyInput & {
    readonly hour: 'prime' | 'terce' | 'sext' | 'none';
  }
): readonly PsalmAssignment[] {
  const { hour, temporal, corpus } = params;
  const hourSection = MINOR_HOUR_SECTION[hour];
  const weekdayKey = WEEKDAY_KEYS[temporal.dayOfWeek] ?? 'Dominica';
  const keyed = resolveWeekdayMinorHourAssignments(corpus, hourSection, weekdayKey, {
    includePrimeBracketPsalm:
      hour === 'prime' && !params.omitPrimeBracketPsalm && isPenitentialDay(temporal),
    suppressAntiphon: params.hourRules.minorHoursSineAntiphona
  });
  if (keyed.length > 0) {
    return applySeasonalWeekdayMinorHourAntiphon(keyed, params);
  }

  return [
    {
      psalmRef: {
        path: PSALMI_MINOR,
        section: hourSection,
        selector: weekdayKey
      }
    }
  ];
}

const SEASONAL_MINOR_HOUR_ANTIPHON_SELECTOR: Readonly<
  Record<'prime' | 'terce' | 'sext' | 'none', string>
> = {
  prime: '1',
  terce: '2',
  sext: '3',
  none: '5'
};

function applySeasonalWeekdayMinorHourAntiphon(
  assignments: readonly PsalmAssignment[],
  params: SelectPsalmodyInput & {
    readonly hour: 'prime' | 'terce' | 'sext' | 'none';
  }
): readonly PsalmAssignment[] {
  const section = seasonalWeekdayMinorHourAntiphonSection(params);
  if (!section || assignments.length === 0) {
    return assignments;
  }

  const first = assignments[0];
  if (!first) {
    return assignments;
  }

  return Object.freeze([
    {
      ...first,
      antiphonRef: {
        path: PSALMI_MINOR,
        section,
        selector: `${SEASONAL_MINOR_HOUR_ANTIPHON_SELECTOR[params.hour]}#antiphon`
      }
    },
    ...assignments.slice(1)
  ]);
}

function seasonalWeekdayMinorHourAntiphonSection(
  params: SelectPsalmodyInput & {
    readonly hour: 'prime' | 'terce' | 'sext' | 'none';
  }
): 'Adv42' | 'Adv43' | 'Adv44' | 'Adv45' | 'Adv46' | 'Adv47' | 'Quad' | 'Quad5_' | undefined {
  if (!isTemporalCelebration(params) || params.temporal.dayOfWeek === 0) {
    return undefined;
  }

  const adventSection = adventWeekdayMinorHourAntiphonSection(params.temporal);
  if (adventSection) {
    return adventSection;
  }

  if (/^Quad[56]-[1-6]/u.test(params.temporal.dayName)) {
    return 'Quad5_';
  }

  if (/^Quad(?:p3-[3-6]|[1-4]-[1-6])/u.test(params.temporal.dayName)) {
    return 'Quad';
  }

  return undefined;
}

function usesLateAdventWeekdayAntiphons(temporal: TemporalContext): boolean {
  const [, month, day] = temporal.date.match(/^\d{4}-(\d{2})-(\d{2})$/u) ?? [];
  return (
    temporal.season === 'advent' &&
    temporal.dayOfWeek > 0 &&
    month === '12' &&
    day !== undefined &&
    Number(day) > 16 &&
    Number(day) < 24
  );
}

function adventWeekdayMinorHourAntiphonSection(
  temporal: TemporalContext
): 'Adv42' | 'Adv43' | 'Adv44' | 'Adv45' | 'Adv46' | 'Adv47' | undefined {
  if (temporal.season !== 'advent' || temporal.dayOfWeek === 0) {
    return undefined;
  }

  if (usesLateAdventWeekdayAntiphons(temporal)) {
    return `Adv4${temporal.dayOfWeek + 1}` as
      | 'Adv42'
      | 'Adv43'
      | 'Adv44'
      | 'Adv45'
      | 'Adv46'
      | 'Adv47';
  }

  return undefined;
}

function resolveWeekdayMinorHourAssignments(
  corpus: OfficeTextIndex,
  sectionName: string,
  weekdayKey: string,
  options: {
    readonly includePrimeBracketPsalm: boolean;
    readonly suppressAntiphon?: boolean;
  }
): readonly PsalmAssignment[] {
  const file = corpus.getFile(`${PSALMI_MINOR}.txt`);
  const section = file?.sections.find((entry) => entry.header === sectionName);
  if (!section) {
    return [];
  }

  const row = findSequentialKeyedRow(section.content, weekdayKey);
  if (!row?.psalmSpec) {
    return [];
  }

  const tokens = row.psalmSpec
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => options.includePrimeBracketPsalm || !isBracketedPsalmToken(token));
  if (tokens.length === 0) {
    return [];
  }

  return Object.freeze(
    tokens.map((token, index): PsalmAssignment => ({
      psalmRef: psalmTokenReference(token),
      ...(index === 0 && !options.suppressAntiphon && hasTextualAntiphon(row.antiphon)
        ? {
            antiphonRef: {
              path: PSALMI_MINOR,
              section: sectionName,
              selector: `${weekdayKey}#antiphon`
            }
          }
        : {})
    }))
  );
}

function hasTextualAntiphon(value: string | undefined): boolean {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 && trimmed !== '_';
}

function isBracketedPsalmToken(token: string): boolean {
  return /^\[\d+\]$/u.test(token);
}

function properFeastReferences(
  params: SelectPsalmodyInput
): readonly PsalmAssignment[] {
  // When the feast carries its own psalmody, reference its per-hour psalm
  // section. Phase 3 resolves the actual psalm numbers.
  const feastPath = `horas/Latin/${params.celebration.feastRef.path}`;
  const section = FEAST_PSALM_SECTION[params.hour] ?? 'Psalmi';
  if (params.hour === 'lauds' || params.hour === 'vespers') {
    return numberedSectionAssignments(feastPath, section, 5);
  }
  return [
    {
      psalmRef: { path: feastPath, section }
    }
  ];
}

function festalReferences(
  params: SelectPsalmodyInput
): readonly PsalmAssignment[] {
  // For doubles and I/II-class feasts whose rules route to the Commune festal
  // psalmody. Phase 3 follows `CelebrationRuleSet.comkey` or the feast's `vide`
  // chain to resolve the concrete commune file.
  const comkey = params.celebrationRules.comkey ?? 'C10';
  const commonPath = `horas/Latin/Commune/${comkey}`;
  const section = FEAST_PSALM_SECTION[params.hour] ?? 'Psalmi';
  if (params.hour === 'lauds' || params.hour === 'vespers') {
    return numberedSectionAssignments(commonPath, section, 5);
  }
  return [
    {
      psalmRef: { path: commonPath, section }
    }
  ];
}

function numberedSectionAssignments(
  path: string,
  section: string,
  count: number
): readonly PsalmAssignment[] {
  return Array.from({ length: count }, (_, index): PsalmAssignment => ({
    psalmRef: {
      path,
      section,
      selector: String(index + 1)
    }
  }));
}

function psalmOverrideReference(override: PsalmOverride): TextReference {
  // Override values are psalm numbers (or comma-separated lists like "62,66").
  // Phase 3 dereferences them against the per-psalm files at
  // `horas/Latin/Psalterium/Psalmorum/Psalm<N>.txt`. When multiple psalms
  // share one override slot the first number anchors the reference; the
  // `selector` preserves the full directive value so Phase 3 can split.
  const firstNumber = override.value.split(/[,\s]+/u)[0]?.trim() ?? '';
  const normalized = firstNumber.replace(/[^0-9]/gu, '');
  if (normalized.length === 0) {
    return {
      path: PSALMI_MAJOR,
      section: override.key,
      selector: override.value
    };
  }
  return {
    path: `${PSALMORUM_ROOT}/Psalm${normalized}`,
    section: '__preamble',
    selector: override.value
  };
}

function applyPsalmOverrides(
  assignments: readonly PsalmAssignment[],
  params: SelectPsalmodyInput
): readonly PsalmAssignment[] {
  const overrides = params.hourRules.psalmOverrides
    .map((override) => classifyPsalmOverride(override, params.hour))
    .filter((override): override is ClassifiedPsalmOverride => override !== undefined);
  if (overrides.length === 0) {
    return assignments;
  }

  const effectiveOverrides = new Map<number, ClassifiedPsalmOverride>();
  for (const override of overrides) {
    const current = effectiveOverrides.get(override.index);
    if (!current || override.priority >= current.priority) {
      effectiveOverrides.set(override.index, override);
    }
  }

  const next = [...assignments];
  for (const override of effectiveOverrides.values()) {
    if (override.index >= next.length) {
      continue;
    }

    if (override.action === 'omit') {
      next.splice(override.index, 1);
      continue;
    }

    if (override.action === 'omit-prime-sunday-psalm117') {
      if (isPsalmSelector(next[0], override.override.value) && isPsalmSelector(next[1], '117')) {
        next.splice(override.index, 1);
      }
      continue;
    }

    next[override.index] = {
      ...next[override.index],
      psalmRef: psalmOverrideReference({
        key: override.override.key,
        value: override.override.value
      })
    };
  }

  return Object.freeze(next);
}

interface ClassifiedPsalmOverride {
  readonly override: PsalmOverride;
  readonly index: number;
  readonly action: 'replace' | 'omit' | 'omit-prime-sunday-psalm117';
  readonly priority: number;
}

function isPsalmSelector(assignment: PsalmAssignment | undefined, selector: string): boolean {
  return assignment?.psalmRef.selector === selector;
}

function classifyPsalmOverride(
  override: PsalmOverride,
  hour: HourName
): ClassifiedPsalmOverride | undefined {
  const normalized = override.key.toLowerCase().replace(/\s+/gu, '');
  const omit = override.value === 'omit';

  if (hour === 'vespers') {
    if (normalized === 'psalm5vespera') {
      return { override, index: 4, action: omit ? 'omit' : 'replace', priority: 2 };
    }
    if (normalized === 'psalm5vespera3') {
      return { override, index: 4, action: omit ? 'omit' : 'replace', priority: 1 };
    }
    if (normalized === 'psalm5') {
      return { override, index: 4, action: omit ? 'omit' : 'replace', priority: 0 };
    }
  }

  if (hour === 'prime' && normalized === 'prima') {
    if (override.value === '53') {
      return { override, index: 1, action: 'omit-prime-sunday-psalm117', priority: 2 };
    }
    return { override, index: 0, action: omit ? 'omit' : 'replace', priority: 2 };
  }

  return undefined;
}

function isTemporalCelebration(params: SelectPsalmodyInput): boolean {
  return params.celebration.source === 'temporal';
}

function isPenitentialDay(temporal: TemporalContext): boolean {
  return (
    temporal.season === 'lent' ||
    temporal.season === 'passiontide' ||
    temporal.season === 'septuagesima' ||
    temporal.dayName === 'Quadp3-3'
  );
}

const MINOR_HOUR_SECTION: Readonly<Record<'prime' | 'terce' | 'sext' | 'none', string>> = {
  prime: 'Prima',
  terce: 'Tertia',
  sext: 'Sexta',
  none: 'Nona'
};

const WEEKDAY_KEYS: readonly string[] = [
  'Dominica',
  'Feria II',
  'Feria III',
  'Feria IV',
  'Feria V',
  'Feria VI',
  'Sabbato'
];

const FEAST_PSALM_SECTION: Readonly<Partial<Record<HourName, string>>> = {
  lauds: 'Psalmi Laudes',
  vespers: 'Psalmi Vespera',
  prime: 'Psalmi Prima',
  terce: 'Psalmi Tertia',
  sext: 'Psalmi Sexta',
  none: 'Psalmi Nona',
  compline: 'Psalmi Completorium'
};

function tridentinumMinorHourSelectors(
  hour: 'prime' | 'terce' | 'sext' | 'none',
  isSunday: boolean,
  dayName: string,
  preferFestalPrime: boolean
): readonly string[] {
  switch (hour) {
    case 'prime':
      // Keep parity with the legacy keyed-selector seam in
      // `upstream/.../cgi-bin/horas/specials/psalmi.pl`: Sunday Prime during
      // Quad* seasons first asks for `Prima Dominica SQP`, then falls back to
      // the ordinary Sunday row when no SQP override exists.
      if (isSunday && /^Quad/u.test(dayName)) {
        return ['Prima Dominica SQP', 'Prima Dominica'];
      }
      // Sunday offices that carry proper minor-hour antiphons still source
      // Prime from `Prima Festis`; only the ordinary temporal Sunday Prime
      // stays on `Prima Dominica` (or the SQP override above).
      return [isSunday && !preferFestalPrime ? 'Prima Dominica' : 'Prima Festis'];
    case 'terce':
      return ['Tertia Dominica'];
    case 'sext':
      return ['Sexta Dominica'];
    case 'none':
      return ['Nona Dominica'];
  }
}

function resolveTridentinumMinorHourAssignments(
  corpus: OfficeTextIndex,
  selector: string,
  omitOpeningAntiphon = false
): readonly PsalmAssignment[] {
  const file = corpus.getFile(`${PSALMI_MINOR}.txt`);
  const section = file?.sections.find((entry) => entry.header === 'Tridentinum');
  if (!section) {
    return [];
  }

  const row = findKeyedRow(section.content, selector);
  if (!row) {
    return [];
  }

  const [antiphon, psalmSpec] = splitTridentinumRow(row);
  if (!psalmSpec) {
    return [];
  }

  const tokens = psalmSpec
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return [];
  }

  return Object.freeze(
    tokens.map((token, index): PsalmAssignment => ({
      psalmRef: psalmTokenReference(token),
      ...(!omitOpeningAntiphon && index === 0 && antiphon
        ? {
            antiphonRef: {
              path: PSALMI_MINOR,
              section: 'Tridentinum',
              selector: `${selector}#antiphon`
            }
          }
        : {})
    }))
  );
}

function findKeyedRow(
  content: readonly TextContent[],
  selector: string
): string | undefined {
  for (const node of content) {
    if (node.type === 'conditional') {
      const nested = findKeyedRow(node.content, selector);
      if (nested) {
        return nested;
      }
      continue;
    }
    if (node.type !== 'text') {
      continue;
    }
    const match = node.value.match(/^([^=]+?)\s*=\s*(.*)$/u);
    if (!match) {
      continue;
    }
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key === selector && value) {
      return value;
    }
  }
  return undefined;
}

function findSequentialKeyedRow(
  content: readonly TextContent[],
  selector: string,
  continuation: readonly TextContent[] = []
): { readonly antiphon?: string; readonly psalmSpec?: string } | undefined {
  for (let index = 0; index < content.length; index += 1) {
    const node = content[index];
    if (node?.type === 'conditional') {
      const nested = findSequentialKeyedRow(node.content, selector, [
        ...content.slice(index + 1),
        ...continuation
      ]);
      if (nested) {
        return nested;
      }
      continue;
    }
    if (node?.type !== 'text') {
      continue;
    }
    const match = node.value.match(/^([^=]+?)\s*=\s*(.*)$/u);
    if (!match) {
      continue;
    }
    const key = match[1]?.trim();
    if (key !== selector) {
      continue;
    }
    return {
      antiphon: match[2]?.trim(),
      psalmSpec: nextTextValue(content, index + 1) ?? nextTextValue(continuation, 0)
    };
  }
  return undefined;
}

function nextTextValue(content: readonly TextContent[], startIndex: number): string | undefined {
  for (let index = startIndex; index < content.length; index += 1) {
    const node = content[index];
    if (node?.type === 'text') {
      return node.value.trim();
    }
    if (node?.type === 'conditional') {
      const nested = nextTextValue(node.content, 0);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

function splitTridentinumRow(value: string): readonly [string | undefined, string | undefined] {
  const [antiphonRaw, psalmSpecRaw] = value.split(';;', 2);
  const antiphon = antiphonRaw?.trim();
  const psalmSpec = psalmSpecRaw?.trim();
  return [antiphon && antiphon !== '_' ? antiphon : undefined, psalmSpec];
}

function psalmTokenReference(token: string): TextReference {
  const match = token.match(/^\[?(\d+)\]?(?:\(([^)]+)\))?$/u);
  const psalmNumber = match?.[1];
  if (!psalmNumber) {
    return {
      path: PSALMI_MINOR,
      section: 'Tridentinum',
      selector: token
    };
  }

  return {
    path: `${PSALMORUM_ROOT}/Psalm${psalmNumber}`,
    section: '__preamble',
    selector: token
  };
}
