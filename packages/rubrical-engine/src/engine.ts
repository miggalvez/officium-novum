import { assembleCandidates } from './candidates/assemble.js';
import { buildOverlay } from './directorium/overlay.js';
import { resolveOfficeDefinition, resolveOfficeFile } from './internal/content.js';
import { normalizeDateInput } from './internal/date.js';
import { resolveOccurrence } from './occurrence/resolver.js';
import { normalizeRank } from './sanctoral/rank-normalizer.js';
import { buildTemporalContext } from './temporal/context.js';
import { sanctoralCandidates } from './sanctoral/kalendarium-lookup.js';
import { describeVersion, resolveVersion } from './version/resolver.js';
import { VERSION_POLICY } from './version/policy-map.js';

import type {
  DayOfficeSummary,
  RubricalEngine,
  RubricalEngineConfig
} from './types/model.js';
import type { ResolvedVersion } from './types/version.js';

export function createRubricalEngine(config: RubricalEngineConfig): RubricalEngine {
  const version = resolveConfiguredVersion(config);

  return {
    version,
    resolveDayOfficeSummary(date): DayOfficeSummary {
      const calendarDate = normalizeDateInput(date);
      const temporal = buildTemporalContext(calendarDate, version, config.corpus);
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
        resolveOverlayCandidate: (path, source) => {
          const definition = resolveOfficeDefinition(config.corpus, path, {
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
