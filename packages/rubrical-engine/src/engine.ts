import { assembleCandidates, pickNaiveWinner } from './candidates/assemble.js';
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
      const temporal = buildTemporalContext(date, version, config.corpus);
      const sanctoral = sanctoralCandidates(
        date,
        version,
        config.versionRegistry,
        config.kalendarium,
        config.corpus
      );
      const candidates = assembleCandidates(temporal, sanctoral);

      return {
        date: temporal.date,
        version: describeVersion(version),
        temporal,
        candidates,
        winner: pickNaiveWinner(candidates)
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
