import type {
  CommemorationLimitParams,
  HourDirectivesParams
} from '../../types/policy.js';
import type { Candidate, FeastReference, TemporalContext } from '../../types/model.js';
import type { ConcurrenceResult, DayConcurrencePreview } from '../../types/concurrence.js';
import type { Commemoration } from '../../types/ordo.js';
import type { ComplineSource, HourDirective } from '../../types/hour-structure.js';
import type { BenedictioEntry, LessonPlan, MatinsPlan, ScriptureCourse } from '../../types/matins.js';

const TRIDUUM_KEYS = new Set(['Quad6-4', 'Quad6-5', 'Quad6-6']);
const HOLY_WEEK_MON_WED_KEYS = new Set(['Quad6-1', 'Quad6-2', 'Quad6-3']);
const HOLY_WEEK_KEYS = new Set([
  'Quad6-0',
  'Quad6-1',
  'Quad6-2',
  'Quad6-3',
  'Quad6-4',
  'Quad6-5',
  'Quad6-6'
]);
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
const LAUDS_VESPERS_HOURS = ['lauds', 'vespers'] as const;
const MATINS_LAUDS_VESPERS_HOURS = ['matins', 'lauds', 'vespers'] as const;
const MINOR_HOURS = new Set(['prime', 'terce', 'sext', 'none']);

export function compareRomanCandidates(
  a: Candidate,
  b: Candidate,
  options: {
    readonly privilegedTemporalWins: (temporal: Candidate, sanctoral: Candidate) => boolean | null;
  }
): number {
  const privileged = comparePrivilegedTemporal(a, b, options.privilegedTemporalWins);
  if (privileged !== null) {
    return privileged;
  }

  if (a.rank.weight !== b.rank.weight) {
    return b.rank.weight - a.rank.weight;
  }

  const kindOrder = candidateKindOrder(a) - candidateKindOrder(b);
  if (kindOrder !== 0) {
    return kindOrder;
  }

  const sourceOrder = sourceTieBreakOrder(a.source) - sourceTieBreakOrder(b.source);
  if (sourceOrder !== 0) {
    return sourceOrder;
  }

  return a.feastRef.path.localeCompare(b.feastRef.path);
}

export function limitRomanCommemorations(
  commemorations: readonly Commemoration[],
  params: CommemorationLimitParams,
  maxCount: number
): readonly Commemoration[] {
  if (maxCount <= 0) {
    return [];
  }

  void params;
  return commemorations.slice(0, maxCount);
}

export function deriveSeasonalDirectivesRomanPre1960(
  params: HourDirectivesParams
): ReadonlySet<HourDirective> {
  const directives = new Set<HourDirective>();
  const { hour, celebration, celebrationRules, hourRules, temporal, overlay } = params;

  if (
    temporal.season === 'septuagesima' ||
    temporal.season === 'lent' ||
    temporal.season === 'passiontide'
  ) {
    directives.add('omit-alleluia');
  }
  if (
    temporal.season === 'eastertide' ||
    temporal.season === 'ascensiontide' ||
    temporal.season === 'pentecost-octave'
  ) {
    directives.add('add-alleluia');
    directives.add('add-versicle-alleluia');
  }

  if (TRIDUUM_KEYS.has(temporal.dayName)) {
    directives.add('omit-gloria-patri');
    directives.add('short-chapter-only');
  }
  const ferialDay =
    celebration.source === 'temporal' && !celebration.kind && !celebration.vigil;

  if (ferialDay && temporal.season === 'passiontide' && MINOR_HOURS.has(hour)) {
    directives.add('omit-responsory-gloria');
  }

  if (
    ferialDay &&
    shouldSayFerialPrecesPre1960(hour, temporal) &&
    !hourRules.omit.includes('preces')
  ) {
    directives.add('preces-feriales');
  }

  const privilegedSeason =
    temporal.season === 'advent' ||
    temporal.season === 'lent' ||
    temporal.season === 'passiontide' ||
    temporal.season === 'septuagesima';
  const shouldSaySuffragium =
    (hour === 'lauds' || hour === 'vespers') &&
    ferialDay &&
    !privilegedSeason &&
    !celebrationRules.noSuffragium;
  if (shouldSaySuffragium) {
    directives.add('suffragium-of-the-saints');
  } else if (hour === 'lauds' || hour === 'vespers') {
    directives.add('omit-suffragium');
  }

  if (isEmberWednesday(temporal)) {
    directives.add('genuflection-at-oration');
  }

  if (overlay?.dirgeAtVespers && hour === 'vespers') {
    directives.add('dirge-vespers');
  }
  if (overlay?.dirgeAtLauds && hour === 'lauds') {
    directives.add('dirge-lauds');
  }

  return directives;
}

function shouldSayFerialPrecesPre1960(
  hour: HourDirectivesParams['hour'],
  temporal: TemporalContext
): boolean {
  if (hour !== 'lauds' && hour !== 'vespers') {
    return false;
  }

  const seasonalWednesdayOrFriday =
    (temporal.season === 'advent' ||
      temporal.season === 'lent' ||
      temporal.season === 'passiontide') &&
    (temporal.dayOfWeek === 3 || temporal.dayOfWeek === 5);
  if (seasonalWednesdayOrFriday) {
    return true;
  }

  if (!isEmberDay(temporal) || temporal.season === 'pentecost-octave') {
    return false;
  }

  return temporal.dayOfWeek === 3 || temporal.dayOfWeek === 5 || (hour === 'lauds' && temporal.dayOfWeek === 6);
}

export function defaultRomanScriptureCourse(temporal: TemporalContext): ScriptureCourse {
  switch (temporal.season) {
    case 'advent':
      return 'advent-isaias';
    case 'christmastide':
      return isWithinChristmasOctave(temporal.date)
        ? 'octava-nativitatis'
        : 'tempora-nativitatis';
    case 'epiphanytide':
    case 'time-after-epiphany':
      return 'post-epiphania';
    case 'septuagesima':
      return 'septuagesima';
    case 'lent':
      return 'lent';
    case 'passiontide':
      return 'passiontide';
    case 'eastertide':
    case 'pentecost-octave':
      return 'paschaltide';
    case 'ascensiontide':
      return 'ascensiontide';
    case 'time-after-pentecost':
    default:
      return 'post-pentecost';
  }
}

export function romanComplineSource(params: {
  readonly concurrence: ConcurrenceResult;
  readonly today: DayConcurrencePreview;
  readonly tomorrow: DayConcurrencePreview;
}): ComplineSource {
  if (TRIDUUM_KEYS.has(params.today.temporal.dayName)) {
    return {
      kind: 'triduum-special',
      dayName: params.today.temporal.dayName
    };
  }

  void params.tomorrow;
  return {
    kind: 'vespers-winner',
    celebration: params.concurrence.source
  };
}

export function forbidsTransferIntoRoman(
  impeded: Candidate,
  temporal: TemporalContext,
  options: {
    readonly suppressChristmasOctave?: boolean;
  } = {}
): boolean {
  void impeded;

  if (HOLY_WEEK_KEYS.has(temporal.dayName)) {
    return true;
  }

  if (TRIDUUM_KEYS.has(temporal.dayName)) {
    return true;
  }

  if (temporal.dayName === 'Quadp3-3') {
    return true;
  }

  if (options.suppressChristmasOctave && isWithinChristmasOctave(temporal.date)) {
    return true;
  }

  return false;
}

export function romanImmaculateException(
  temporal: Candidate,
  sanctoral: Candidate
): boolean {
  return (
    temporal.rank.classSymbol === 'privileged-sunday' &&
    sanctoral.feastRef.path === 'Sancti/12-08'
  );
}

export function isTriduumDay(temporal: TemporalContext): boolean {
  return TRIDUUM_KEYS.has(temporal.dayName);
}

export function isPaschalOctaveDay(temporal: TemporalContext): boolean {
  return temporal.dayName.startsWith('Pasc0-');
}

export function isPentecostOctaveDay(temporal: TemporalContext): boolean {
  return temporal.dayName.startsWith('Pasc7-');
}

export function isAshWednesdayOrHolyWeekMonWed(temporal: TemporalContext): boolean {
  return temporal.dayName === 'Quadp3-3' || HOLY_WEEK_MON_WED_KEYS.has(temporal.dayName);
}

export function isEmberWednesday(temporal: TemporalContext): boolean {
  return isEmberDay(temporal) && temporal.dayOfWeek === 3;
}

export function isEmberDay(temporal: TemporalContext): boolean {
  return EMBER_DAY_KEYS.has(temporal.dayName) || isSeptemberEmberDay(temporal.date);
}

export function isWithinChristmasOctave(isoDate: string): boolean {
  const monthDay = isoDate.slice(5);
  return (
    monthDay === '12-25' ||
    monthDay === '12-26' ||
    monthDay === '12-27' ||
    monthDay === '12-28' ||
    monthDay === '12-29' ||
    monthDay === '12-30' ||
    monthDay === '12-31' ||
    monthDay === '01-01'
  );
}

export function rootFeastMatches(
  feastRef: FeastReference,
  allowed: ReadonlySet<string>
): boolean {
  return allowed.has(feastRef.path);
}

export function collapseSameDayCommemorations(
  commemorations: readonly Commemoration[]
): readonly Commemoration[] {
  const byDay = new Map<string, readonly Commemoration[]>();
  const order: string[] = [];
  const passthrough: Commemoration[] = [];

  for (const commemoration of commemorations) {
    const key = sameDaySanctoralKey(commemoration.feastRef.path);
    if (!key) {
      passthrough.push(commemoration);
      continue;
    }

    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, [commemoration]);
      order.push(key);
      continue;
    }

    byDay.set(key, [...existing, commemoration]);
  }

  const collapsed: Commemoration[] = [];
  let dayIndex = 0;

  for (const commemoration of commemorations) {
    const key = sameDaySanctoralKey(commemoration.feastRef.path);
    if (!key) {
      if (passthrough.length > 0 && passthrough[0] === commemoration) {
        collapsed.push(commemoration);
        passthrough.shift();
      }
      continue;
    }

    if (order[dayIndex] !== key) {
      continue;
    }

    const group = byDay.get(key) ?? [];
    dayIndex += 1;

    const explicitVariant = group.find(
      (candidate) => isOptionalSameDayVariant(candidate.feastRef.path)
    );
    if (explicitVariant) {
      collapsed.push(explicitVariant);
      continue;
    }

    collapsed.push(...group);
  }

  return collapsed;
}

export function limitCommemorationsByHour(
  commemorations: readonly Commemoration[],
  laudsVespersLimit: number,
  matinsLimit: number
): readonly Commemoration[] {
  return commemorations
    .slice(0, Math.max(0, laudsVespersLimit))
    .map((commemoration, index) => ({
      ...commemoration,
      hours:
        index < Math.max(0, matinsLimit)
          ? MATINS_LAUDS_VESPERS_HOURS
          : LAUDS_VESPERS_HOURS
    }));
}

function comparePrivilegedTemporal(
  a: Candidate,
  b: Candidate,
  privilegedTemporalWins: (temporal: Candidate, sanctoral: Candidate) => boolean | null
): number | null {
  const temporal = a.source === 'temporal' ? a : b.source === 'temporal' ? b : null;
  if (!temporal) {
    return null;
  }

  const sanctoral = temporal === a ? b : a;
  if (sanctoral.source === 'temporal') {
    return null;
  }

  const winner = privilegedTemporalWins(temporal, sanctoral);
  if (winner === null) {
    return null;
  }

  return winner ? (temporal === a ? -1 : 1) : temporal === a ? 1 : -1;
}

function sourceTieBreakOrder(source: Candidate['source']): number {
  switch (source) {
    case 'temporal':
      return 0;
    case 'sanctoral':
    case 'transferred-in':
      return 1;
    default:
      return 2;
  }
}

function candidateKindOrder(candidate: Candidate): number {
  if (candidate.kind === 'vigil') {
    return 2;
  }
  if (candidate.kind === 'octave') {
    return 1;
  }
  return 0;
}

function sameDaySanctoralKey(path: string): string | null {
  const match = /^Sancti\/(\d{2}-\d{2})(?:[A-Za-z].*)?$/u.exec(path);
  return match?.[1] ?? null;
}

function isOptionalSameDayVariant(path: string): boolean {
  const match = /^Sancti\/\d{2}-\d{2}([A-Za-z]+)$/u.exec(path);
  if (!match?.[1]) {
    return false;
  }

  return match[1] === 'o' || match[1] === 'so';
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

/**
 * Shared Benedictio selection for the Roman policies (1911 / 1955 / 1960).
 *
 * For the 9- or 12-lesson office, each lesson in nocturn N picks the
 * corresponding line from `[Nocturn N]` in
 * `horas/Latin/Psalterium/Benedictions.txt` — lesson k (relative to the
 * nocturn, 1-based) resolves to line `k` of that section.
 *
 * For a 3-lesson office, ordinary temporal ferias rotate by the Perl
 * `dayofweek2i()` grouping (Sunday/Monday/Thursday -> Nocturn 1,
 * Tuesday/Friday -> Nocturn 2, Wednesday/Saturday -> Nocturn 3). Other
 * 3-lesson offices continue to start from `[Nocturn 3]`.
 *
 * This is an MVP shared by all three Roman policies: it produces the
 * structural Benedictio-before-Lectio output the compositor emits. The
 * cujus/quorum and "Evangelica" Gospel-homily substitutions (Perl lines
 * 496-530) remain open for later adjudication — see Phase 3 plan §3h.
 */
export function selectRomanBenedictions(params: {
  readonly nocturnIndex: 1 | 2 | 3;
  readonly lessons: readonly LessonPlan[];
  readonly celebration: FeastReferenceCarrier;
  readonly temporal: TemporalContext;
  readonly totalLessons: MatinsPlan['totalLessons'];
}): readonly BenedictioEntry[] {
  const { nocturnIndex, lessons, totalLessons } = params;

  const sourceNocturnSection =
    totalLessons === 3
      ? `Nocturn ${threeLessonBenedictionNocturn(params)}`
      : `Nocturn ${nocturnIndex}`;
  const path = 'horas/Latin/Psalterium/Benedictions.txt';
  const entries: BenedictioEntry[] = [];
  for (let offset = 0; offset < lessons.length; offset += 1) {
    const lesson = lessons[offset];
    if (!lesson) continue;
    const selector = String(offset + 1);
    entries.push({
      index: lesson.index,
      reference: { path, section: sourceNocturnSection, selector }
    });
  }
  return Object.freeze(entries);
}

interface FeastReferenceCarrier {
  readonly feastRef: FeastReference;
  readonly source: 'temporal' | 'sanctoral';
  readonly kind?: Candidate['kind'];
}

function threeLessonBenedictionNocturn(params: {
  readonly celebration: FeastReferenceCarrier;
  readonly temporal: TemporalContext;
}): 1 | 2 | 3 {
  if (usesOrdinaryTemporalThreeLessonBenedictions(params)) {
    return dayOfWeekToNocturnIndex(params.temporal.dayOfWeek);
  }
  return 3;
}

function usesOrdinaryTemporalThreeLessonBenedictions(params: {
  readonly celebration: FeastReferenceCarrier;
  readonly temporal: TemporalContext;
}): boolean {
  const { celebration, temporal } = params;
  if (celebration.source !== 'temporal') {
    return false;
  }
  if (temporal.dayOfWeek === 0) {
    return false;
  }
  if (celebration.kind === 'vigil') {
    return false;
  }
  if (temporal.dayName === 'Quadp3-3' || isEmberDay(temporal)) {
    return false;
  }
  if (
    /^Quad[1-5]-[1-6]$/u.test(temporal.dayName) ||
    temporal.dayName === 'Quad6-1' ||
    temporal.dayName === 'Pasc5-1' ||
    temporal.dayName.startsWith('Pasc0-') ||
    temporal.dayName.startsWith('Pasc7-')
  ) {
    return false;
  }
  return true;
}

function dayOfWeekToNocturnIndex(dayOfWeek: number): 1 | 2 | 3 {
  if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 4) {
    return 1;
  }
  if (dayOfWeek === 2 || dayOfWeek === 5) {
    return 2;
  }
  return 3;
}
