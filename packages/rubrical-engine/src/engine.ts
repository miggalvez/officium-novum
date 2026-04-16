import { detectVigil } from './candidates/vigil-detection.js';
import { assembleCandidates } from './candidates/assemble.js';
import { buildConcurrencePreview, resolveConcurrence } from './concurrence/index.js';
import { buildOverlay } from './directorium/overlay.js';
import { buildCompline } from './hours/index.js';
import { resolveOfficeDefinition, resolveOfficeFile } from './internal/content.js';
import { addDays, formatIsoDate, normalizeDateInput, type CalendarDate } from './internal/date.js';
import { resolveOccurrence } from './occurrence/resolver.js';
import { normalizeRank } from './sanctoral/rank-normalizer.js';
import { buildTemporalContext } from './temporal/context.js';
import { dayNameForDate, weekStemForDate } from './temporal/day-name.js';
import { liturgicalSeasonForDate } from './temporal/season.js';
import { sanctoralCandidates } from './sanctoral/kalendarium-lookup.js';
import { buildYearTransferMap } from './transfer/year-map.js';
import { describeVersion, resolveVersion } from './version/resolver.js';
import { VERSION_POLICY } from './version/policy-map.js';

import type {
  Candidate,
  DayOfficeSummary,
  TemporalContext,
  RubricalEngine,
  RubricalEngineConfig
} from './types/model.js';
import type { ResolvedVersion } from './types/version.js';
import type { Transfer, YearTransferMap } from './transfer/index.js';
import type { DirectoriumOverlay, RubricalWarning } from './types/directorium.js';
import type { Celebration, Commemoration } from './types/ordo.js';
import type { CelebrationRuleSet } from './types/rule-set.js';
import type { DayConcurrencePreview } from './types/concurrence.js';

export function createRubricalEngine(config: RubricalEngineConfig): RubricalEngine {
  const version = resolveConfiguredVersion(config);
  const yearTransferMapCache = new Map<string, YearTransferMap>();
  const dayPreviewCache = new Map<string, DayConcurrencePreview>();

  return {
    version,
    resolveDayOfficeSummary(date): DayOfficeSummary {
      const calendarDate = normalizeDateInput(date);
      const todaySummary = resolveTodayBaseSummary(calendarDate);
      const todayPreview = getDayConcurrencePreview(calendarDate, todaySummary);
      const tomorrowPreview = getDayConcurrencePreview(addDays(calendarDate, 1));
      const concurrence = resolveConcurrence({
        today: todayPreview,
        tomorrow: tomorrowPreview,
        temporal: todaySummary.temporal,
        policy: version.policy
      });
      const compline = buildCompline({
        concurrence,
        today: todayPreview,
        tomorrow: tomorrowPreview,
        policy: version.policy
      });
      return {
        ...todaySummary,
        warnings: [...todaySummary.warnings, ...concurrence.warnings],
        concurrence,
        compline
      };
    }
  };

  function getDayConcurrencePreview(
    date: CalendarDate,
    precomputedSummary?: BaseDaySummary
  ): DayConcurrencePreview {
    const isoDate = formatIsoDate(date);
    const key = `${version.handle}::${isoDate}`;
    const cached = dayPreviewCache.get(key);
    if (cached) {
      return cached;
    }

    const preview = buildConcurrencePreview(date, {
      policy: version.policy,
      resolveSummary(requestDate) {
        if (precomputedSummary && precomputedSummary.date === formatIsoDate(requestDate)) {
          return precomputedSummary;
        }
        return resolvePreviewBaseSummary(requestDate);
      },
      resolveFeastFile(path) {
        return resolveOfficeFile(config.corpus, path);
      }
    });
    dayPreviewCache.set(key, preview);
    return preview;
  }

  function synthesizePreviewSummary(calendarDate: CalendarDate): BaseDaySummary {
    const isoDate = formatIsoDate(calendarDate);
    const dayName = dayNameForDate(calendarDate);
    const season = liturgicalSeasonForDate(calendarDate);
    const feastPath = `Tempora/${dayName}`;
    const rank = version.policy.resolveRank(
      {
        name: 'Feria',
        classWeight: 1
      },
      {
        date: isoDate,
        feastPath,
        source: 'temporal',
        version: version.handle,
        season
      }
    );
    const celebration: Celebration = {
      feastRef: {
        path: feastPath,
        id: feastPath,
        title: dayName
      },
      rank,
      source: 'temporal'
    };
    return {
      date: isoDate,
      version: describeVersion(version),
      temporal: {
        date: isoDate,
        dayOfWeek: new Date(`${isoDate}T00:00:00Z`).getUTCDay(),
        weekStem: weekStemForDate(calendarDate),
        dayName,
        season,
        feastRef: celebration.feastRef,
        rank: celebration.rank
      },
      warnings: [],
      candidates: [
        {
          feastRef: celebration.feastRef,
          rank: celebration.rank,
          source: 'temporal'
        }
      ],
      celebration,
      celebrationRules: defaultCelebrationRuleSet(),
      commemorations: [],
      winner: {
        feastRef: celebration.feastRef,
        rank: celebration.rank,
        source: celebration.source
      }
    };
  }

  function resolveTodayBaseSummary(calendarDate: CalendarDate): BaseDaySummary {
    try {
      return resolveBaseDaySummary(calendarDate);
    } catch (error) {
      if (isMissingOfficeError(error)) {
        return withFallbackWarning(
          calendarDate,
          error.message,
          'missing-office-file',
          'day-summary'
        );
      }

      if (isNoMatchingRankSanctiError(error)) {
        const filePath = extractNoMatchingRankPath(error.message);
        if (filePath && sanctiFileHasRankSection(config.corpus, filePath)) {
          throw error;
        }

        return withFallbackWarning(calendarDate, error.message, 'rankless-office', 'day-summary');
      }

      throw error;
    }
  }

  function resolvePreviewBaseSummary(calendarDate: CalendarDate): BaseDaySummary {
    try {
      return resolveBaseDaySummary(calendarDate);
    } catch (error) {
      if (isMissingOfficeError(error)) {
        return withFallbackWarning(
          calendarDate,
          error.message,
          'missing-office-file',
          'day-preview'
        );
      }

      if (isNoMatchingRankSanctiError(error)) {
        const filePath = extractNoMatchingRankPath(error.message);
        if (filePath && sanctiFileHasRankSection(config.corpus, filePath)) {
          throw error;
        }

        return withFallbackWarning(
          calendarDate,
          error.message,
          'rankless-office',
          'day-preview'
        );
      }

      throw error;
    }
  }

  function withFallbackWarning(
    calendarDate: CalendarDate,
    message: string,
    cause: 'missing-office-file' | 'rankless-office',
    scope: 'day-summary' | 'day-preview'
  ): BaseDaySummary {
    const fallback = synthesizePreviewSummary(calendarDate);
    const missingPath =
      (cause === 'rankless-office'
        ? extractNoMatchingRankPath(message)
        : extractMissingOfficePath(message)) ?? fallback.celebration.feastRef.path;
    const subject = scope === 'day-summary' ? 'Day summary' : 'Day preview';

    return {
      ...fallback,
      warnings: [
        ...fallback.warnings,
        {
          code: 'rubric-synth-fallback',
          message:
            cause === 'rankless-office'
              ? `${subject} synthesized fallback temporal data because the resolved Sancti office has no applicable [Rank] section.`
              : `${subject} synthesized fallback temporal data because a source office file was missing.`,
          severity: 'info',
          context: {
            scope,
            date: fallback.date,
            missingPath,
            cause
          }
        }
      ]
    };
  }

  function resolveBaseDaySummary(calendarDate: CalendarDate): BaseDaySummary {
    const isoDate = formatIsoDate(calendarDate);
    const temporal = buildTemporalContext(calendarDate, version, config.corpus);
    const yearTransferMap = getYearTransferMap(calendarDate.year);
    const transferredIn = collectTransfersInto(
      isoDate,
      calendarDate.year,
      calendarDate.month,
      calendarDate.day
    );
    const sanctoral = sanctoralCandidates(
      calendarDate,
      version,
      config.versionRegistry,
      config.kalendarium,
      config.corpus
    );
    const overlayResult = buildOverlay({
      date: calendarDate,
      version,
      registry: config.versionRegistry,
      yearTransfers: config.yearTransfers,
      scriptureTransfers: config.scriptureTransfers
    });
    const assembled = assembleCandidates(temporal, sanctoral, {
      overlay: overlayResult.overlay,
      transferredIn: transferredIn.map((transfer) => ({
        ...resolveCandidate(
          transfer.feastRef.path,
          'sanctoral',
          calendarDate,
          temporal,
          version,
          config.corpus
        ),
        source: 'transferred-in',
        transferredFrom: transfer.originalDate
      })),
      detectVigil: (candidate) =>
        detectVigil({
          candidate,
          version,
          corpus: config.corpus
        }),
      resolveOverlayCandidate: (path, source) => {
        return resolveCandidate(path, source, calendarDate, temporal, version, config.corpus);
      }
    });
    const overlay = hasOverlayDirectives(overlayResult.overlay)
      ? overlayResult.overlay
      : undefined;
    const occurrence = resolveOccurrence(assembled.candidates, temporal, version.policy);
    const celebrationFile = resolveOfficeFile(config.corpus, occurrence.celebration.feastRef.path);
    const celebrationRuleEvaluation = version.policy.buildCelebrationRuleSet(
      celebrationFile,
      occurrence.commemorations,
      {
        date: calendarDate,
        dayOfWeek: temporal.dayOfWeek,
        season: temporal.season,
        version,
        dayName: temporal.dayName,
        celebration: occurrence.celebration,
        commemorations: occurrence.commemorations,
        corpus: config.corpus
      }
    );
    const warnings = [
      ...yearTransferMap.warningsOn(isoDate),
      ...overlayResult.warnings,
      ...assembled.warnings,
      ...occurrence.warnings,
      ...celebrationRuleEvaluation.warnings
    ];
    const winner = {
      feastRef: occurrence.celebration.feastRef,
      rank: occurrence.celebration.rank,
      source: occurrence.celebration.source
    } as const;

    return {
      date: temporal.date,
      version: describeVersion(version),
      temporal,
      ...(overlay ? { overlay } : {}),
      warnings,
      candidates: assembled.candidates,
      celebration: occurrence.celebration,
      celebrationRules: celebrationRuleEvaluation.celebrationRules,
      commemorations: occurrence.commemorations,
      winner
    };
  }

  function getYearTransferMap(year: number): YearTransferMap {
    const key = `${version.handle}::${year}`;
    const cached = yearTransferMapCache.get(key);
    if (cached) {
      return cached;
    }

    const built = buildYearTransferMap({
      year,
      version,
      policy: version.policy,
      corpus: config.corpus,
      versionRegistry: config.versionRegistry,
      kalendarium: config.kalendarium,
      yearTransfers: config.yearTransfers,
      scriptureTransfers: config.scriptureTransfers
    });
    yearTransferMapCache.set(key, built);
    return built;
  }

  function collectTransfersInto(
    date: string,
    year: number,
    month: number,
    day: number
  ): readonly Transfer[] {
    const maps = [getYearTransferMap(year)];
    if (year > 1 && (month < 3 || (month === 3 && day <= 2))) {
      maps.push(getYearTransferMap(year - 1));
    }

    const uniqueByTransfer = new Map<string, Transfer>();
    for (const map of maps) {
      for (const transfer of map.transfersInto(date)) {
        const key = `${transfer.feastRef.path}|${transfer.originalDate}|${transfer.target}`;
        uniqueByTransfer.set(key, transfer);
      }
    }

    return [...uniqueByTransfer.values()];
  }
}

interface BaseDaySummary {
  readonly date: string;
  readonly version: ReturnType<typeof describeVersion>;
  readonly temporal: TemporalContext;
  readonly overlay?: DirectoriumOverlay;
  readonly warnings: readonly RubricalWarning[];
  readonly candidates: readonly Candidate[];
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly commemorations: readonly Commemoration[];
  readonly winner: {
    readonly feastRef: Celebration['feastRef'];
    readonly rank: Celebration['rank'];
    readonly source: Celebration['source'];
  };
}

function resolveConfiguredVersion(config: RubricalEngineConfig): ResolvedVersion {
  if (config.policyOverride) {
    const overrideMap = new Map(config.policyMap ?? VERSION_POLICY);
    overrideMap.set(config.version, config.policyOverride);
    return resolveVersion(config.version, config.versionRegistry, overrideMap);
  }

  return resolveVersion(
    config.version,
    config.versionRegistry,
    config.policyMap ?? VERSION_POLICY
  );
}

function hasOverlayDirectives(overlay: {
  readonly officeSubstitution?: unknown;
  readonly dirgeAtVespers?: unknown;
  readonly dirgeAtLauds?: unknown;
  readonly hymnOverride?: unknown;
  readonly scriptureTransfer?: unknown;
}): boolean {
  return (
    Boolean(overlay.officeSubstitution) ||
    Boolean(overlay.dirgeAtVespers) ||
    Boolean(overlay.dirgeAtLauds) ||
    Boolean(overlay.hymnOverride) ||
    Boolean(overlay.scriptureTransfer)
  );
}

function resolveCandidate(
  path: string,
  source: 'temporal' | 'sanctoral',
  calendarDate: ReturnType<typeof normalizeDateInput>,
  temporal: ReturnType<typeof buildTemporalContext>,
  version: ResolvedVersion,
  corpus: RubricalEngineConfig['corpus']
): { readonly feastRef: Candidate['feastRef']; readonly rank: Candidate['rank'] } {
  const definition = resolveOfficeDefinition(corpus, path, {
    date: calendarDate,
    dayOfWeek: temporal.dayOfWeek,
    season: temporal.season,
    version
  });

  return {
    feastRef: definition.feastRef,
    rank: normalizeRank(definition.rawRank, version.policy, {
      date: temporal.date,
      feastPath: definition.feastRef.path,
      source,
      version: version.handle,
      season: temporal.season
    })
  };
}

function defaultCelebrationRuleSet(): CelebrationRuleSet {
  return {
    matins: {
      lessonCount: 9,
      nocturns: 3,
      rubricGate: 'always'
    },
    hasFirstVespers: true,
    hasSecondVespers: true,
    lessonSources: [],
    lessonSetAlternates: [],
    festumDomini: false,
    conclusionMode: 'separate',
    antiphonScheme: 'default',
    omitCommemoration: false,
    noSuffragium: false,
    quorumFestum: false,
    commemoratio3: false,
    unaAntiphona: false,
    unmapped: [],
    hourScopedDirectives: []
  };
}

function isMissingOfficeError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message.startsWith('Corpus file not found for office path: Tempora/') ||
      error.message.startsWith('Corpus file not found for office path: Sancti/'))
  );
}

function isNoMatchingRankSanctiError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith('No matching [Rank] line found in horas/Latin/Sancti/')
  );
}

function extractMissingOfficePath(message: string): string | null {
  const match = /office path: ([^ ]+)/u.exec(message);
  if (match?.[1]) {
    return match[1];
  }

  const rankMatch = /in (horas\/Latin\/[^ ]+)/u.exec(message);
  if (rankMatch?.[1]) {
    return rankMatch[1];
  }

  return null;
}

function extractNoMatchingRankPath(message: string): string | null {
  const prefix = 'No matching [Rank] line found in ';
  if (!message.startsWith(prefix)) {
    return null;
  }

  const path = message.slice(prefix.length).trim();
  return path.length > 0 ? path : null;
}

function sanctiFileHasRankSection(
  corpus: RubricalEngineConfig['corpus'],
  filePath: string
): boolean {
  const file = corpus.getFile(filePath);
  if (!file) {
    return true;
  }

  return file.sections.some(
    (section) => section.header === 'Rank' && (section.rank?.length ?? 0) > 0
  );
}
