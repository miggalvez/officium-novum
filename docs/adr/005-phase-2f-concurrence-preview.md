# ADR-005: Materialize Day Concurrence Preview Per Date in Phase 2f

- **Status:** accepted
- **Date:** 2026-04-16
- **Related:** [Phase 2 Rubrical Engine Design §13, §16.1, §18 (Phase 2f)](../phase-2-rubrical-engine-design.md)

## Context

Phase 2f introduces Vespers concurrence: resolving day `D` requires data from
day `D+1` (tomorrow's First Vespers side). A naive implementation creates a
cross-date recursion risk:

- Resolving `D` asks for `D+1`.
- If `D+1` is resolved through the same full pipeline, it asks for `D+2`, etc.
- Pulling a full-year precompute just to answer one date adds avoidable work.

We need a deterministic way to obtain "just enough tomorrow state" for
concurrence and Compline source selection, without coupling day resolution to a
year-wide scan.

## Options Considered

### Option 1 — Reuse full day resolution recursively

Call full `resolveDayOfficeSummary(D+1)` from `resolveDayOfficeSummary(D)`.

- Pro: minimal new abstractions.
- Con: recursive cross-date dependency chain.
- Con: hard to bound and reason about when adding more hour-level stages.

### Option 2 — Eager bulk precompute for the year

Compute concurrence inputs for all days upfront.

- Pro: no recursion at lookup time.
- Pro: simple reads once precomputed.
- Con: heavy startup/cold-year cost for dates that may never be requested.
- Con: duplicates logic already present in day summary resolution.

### Option 3 — Lazy per-date concurrence preview with engine cache

Create a lightweight `DayConcurrencePreview` for a specific date that runs
through candidate assembly, occurrence, and celebration-rule evaluation, then
stops before concurrence itself. Cache previews by `(version.handle, isoDate)`.

- Pro: breaks the recursion while preserving lazy evaluation.
- Pro: bounded work per request; adjacent requests naturally reuse cache.
- Pro: deterministic and straightforward to test.
- Con: introduces a new intermediate type and cache path to maintain.

## Decision

Use **Option 3**. Phase 2f materializes `DayConcurrencePreview` as a
pre-concurrence boundary object and caches it per engine instance using
`(version.handle, isoDate)` keys.

`resolveDayOfficeSummary(D)` now:

1. resolves full base summary for `D`,
2. loads/creates previews for `D` and `D+1`,
3. resolves concurrence from those previews,
4. builds minimal Compline from concurrence + policy hook.

## Consequences

- Positive: concurrence and Compline can be resolved without unbounded
  cross-date recursion.
- Positive: repeated lookups are stable and cache-friendly.
- Positive: architecture stays aligned with the skeleton-application model:
  preview data remains pure structural state, not composed text.
- Negative: engine now maintains two caches (`YearTransferMap`, day preview).
- Follow-up: if Phase 2g introduces additional cross-date checks, they should
  consume the preview contract first before adding broader precompute.

## Notes

- New preview module:
  `packages/rubrical-engine/src/concurrence/day-preview.ts`
- Preview cache host:
  `packages/rubrical-engine/src/engine.ts`
