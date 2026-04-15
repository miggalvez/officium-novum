/**
 * Stable identifier for a rubrical policy family.
 *
 * Multiple {@link VersionHandle}s can share a single {@link PolicyName} when
 * they run the same rubrics against different calendars — e.g. both
 * `"Rubrics 1960 - 1960"` and `"Rubrics 1960 - 2020 USA"` bind to
 * `'rubrics-1960'` but use different sanctoral tables.
 *
 * Phase 2a binds all 15 Breviary handles in `data.txt` by expanding the
 * 7-member illustrative list from design §11 to 10 distinct traditions:
 *
 *   | Policy                  | Versions in data.txt                                       |
 *   |-------------------------|------------------------------------------------------------|
 *   | tridentine-1570         | Tridentine - 1570, 1888, 1906                              |
 *   | divino-afflatu          | Divino Afflatu - 1939, 1954                                |
 *   | reduced-1955            | Reduced - 1955                                             |
 *   | rubrics-1960            | Rubrics 1960 - 1960, Rubrics 1960 - 2020 USA               |
 *   | monastic-tridentine     | Monastic Tridentinum 1617                                  |
 *   | monastic-divino         | Monastic Divino 1930                                       |
 *   | monastic-1963           | Monastic - 1963, Monastic - 1963 - Barroux                 |
 *   | cistercian-1951         | Monastic Tridentinum Cisterciensis 1951                    |
 *   | cistercian-altovadense  | Monastic Tridentinum Cisterciensis Altovadensis            |
 *   | dominican-1962          | Ordo Praedicatorum - 1962                                  |
 *
 * Policies are split conservatively: historically-distinct rubrical traditions
 * get their own {@link PolicyName} even when they share columns in `data.txt`
 * with a related tradition, because merging later is cheap (delete a name,
 * rebind the handle) while untangling an incorrect merge is expensive. If
 * Phase 2c research shows, e.g., that `cistercian-altovadense` is rubrically
 * identical to `cistercian-1951` aside from local customs, those two entries
 * can be collapsed at that point.
 */
export type PolicyName =
  | 'tridentine-1570'
  | 'divino-afflatu'
  | 'reduced-1955'
  | 'rubrics-1960'
  | 'monastic-tridentine'
  | 'monastic-divino'
  | 'monastic-1963'
  | 'cistercian-1951'
  | 'cistercian-altovadense'
  | 'dominican-1962';

/**
 * Rubrical behaviour contract for a policy family.
 *
 * Phase 2a exposes only `name`. Design §11 prescribes the full interface —
 * `resolveRank`, `compareCandidates`, `resolveConcurrence`,
 * `buildCelebrationRuleSet`, `hourDirectives`, `transferTarget`, etc. — which
 * will be added in Phases 2c–2g as each consuming stage lands.
 *
 * Policy objects are constructed once per process and attached to every
 * {@link ResolvedVersion} that binds to their `name`. They must be pure
 * (no I/O, no mutable state).
 */
export interface RubricalPolicy {
  /** Stable identifier used in diagnostics, test snapshots, and version projections. */
  readonly name: PolicyName;
  // PHASE 2c+: expand per design §11:
  //   resolveRank, precedenceRow, applySeasonPreemption, compareCandidates,
  //   resolveConcurrence, limitCommemorations, buildCelebrationRuleSet,
  //   hourDirectives, octavesEnabled, transferTarget.
}
