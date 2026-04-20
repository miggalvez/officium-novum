# Phase 3 Session Loop

Use this document as the standing session brief for finishing **Phase 3 —
Composition Engine**. A fresh Codex session should begin by reading this file,
then executing the next tranche end to end.

## Scope

Work only toward closing Phase 3 per:

- [phase-3-composition-engine-design.md](./phase-3-composition-engine-design.md)
  §18 (Success Criteria)
- [phase-3-composition-engine-design.md](./phase-3-composition-engine-design.md)
  §19.8 (3h burn-down)
- [phase-3-composition-engine-design.md](./phase-3-composition-engine-design.md)
  §19.9 (finish strategy)
- [ADR-011](./adr/011-phase-3-divergence-adjudication.md)

Read these at the start of every tranche together with:

- [../CHANGELOG.md](../CHANGELOG.md)
- [../packages/compositor/test/divergence/ADJUDICATION_LOG.md](../packages/compositor/test/divergence/ADJUDICATION_LOG.md)
- [../packages/compositor/test/divergence/adjudications.json](../packages/compositor/test/divergence/adjudications.json)
- [upstream-issues.md](./upstream-issues.md)

## Core Rules

- Burn down **families**, not civil dates.
- Treat the 2024 ledgers as the **sign-off matrix**, not as a cue to hand-fix
  every year individually.
- Keep the architectural boundary intact:
  - **Phase 2 owns year-specific structure** and Directorium/transfer effects.
  - **Phase 3 owns faithful composition** of a source-correct
    `DayOfficeSummary`.
- Never land date-specific compositor logic unless a reusable structural rule
  genuinely cannot express the fix.
- Adjudication is completion, not deferral. If the compositor matches the
  source and Perl does not, classify it.
- Never resolve a divergence by matching Perl alone. Authority order is:
  1. Ordo Recitandi
  2. governing rubrical books
  3. legacy Perl output

## Session Start Checklist

At the start of each session:

1. Read the docs listed above.
2. Inspect `git status`.
3. Refresh the live frontier from:
   - the current divergence ledgers
   - `ADJUDICATION_LOG.md`
   - `upstream-issues.md`
   - targeted `compare:phase-3-perl --no-write-docs` runs as needed
4. Choose the **next highest-leverage family**, using design §19.9:
   - shared Roman structural families first
   - Roman adjudication sweeps second
   - Divino Afflatu families third
   - stabilization/sign-off last
5. State clearly which family is next and why it is the next one.

## Tranche Loop

Every tranche must follow this loop:

1. Define the family narrowly.
   - Describe it as a reusable seam, not as "fix date X".
   - Identify whether it looks like:
     - Phase 2 structure bug
     - Phase 3 composition bug
     - Perl bug
     - rendering difference

2. Lock the source seam before coding.
   - Add or tighten the smallest upstream-backed tests needed to prove
     ownership.
   - Prefer targeted tests over broad snapshots.
   - Do not code first and rationalize later.

3. Fix only the owning layer.
   - If Phase 2 structure is wrong, patch rubrical-engine.
   - If Phase 2 is right but output order/text shaping is wrong, patch
     compositor.
   - If both are source-correct, do not keep coding; adjudicate.

4. Reclassify immediately after the fix.
   - Update:
     - `packages/compositor/test/divergence/adjudications.json`
     - `packages/compositor/test/divergence/ADJUDICATION_LOG.md`
     - `docs/upstream-issues.md` for `perl-bug` families
     - `CHANGELOG.md` when the tranche materially changes live status
   - Use representative entries plus `adjudications:fanout` when appropriate.

5. Verify the tranche.
   - Always run:
     - `pnpm -r typecheck`
     - `pnpm -r test`
   - During investigation, use targeted compare runs with `--no-write-docs`.
   - At tranche end, run:
     - `pnpm -C packages/compositor compare:phase-3-perl -- --max-report 0`
   - If Phase 2 behavior changed, also run:
     - `pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures`

6. Commit the tranche.
   - Every completed tranche ends in a local git commit.
   - Do not leave a completed tranche uncommitted.
   - One tranche = one coherent commit with code, tests, docs, and
     adjudications together.
   - Commit only when the tranche is verified and in a good stopping state.

7. Name the next family before ending the session.
   - Summarize:
     - what family was closed or narrowed
     - what changed in the ledgers
     - whether the result was a fix, adjudication, or both
     - what the next family should be
   - The next recommendation must be family-based and justified by the live
     compare surface.

## Anti-Patterns

Do not:

- reopen already-closed families without new evidence of regression
- drift into Vespers, Matins, dirge, or Divino Afflatu work outside the
  currently selected family
- use the ledgers as a substitute for source analysis
- leave a family in a "maybe source, maybe compositor" state after touching it
- land a compositor patch that can only be explained as "if this date, do X"

## Endgame

Keep iterating across sessions until Phase 3 satisfies the design success
criteria, especially:

- the major remaining families are either fixed or adjudicated
- each policy has fewer than 10 `unadjudicated` rows
- the deferred 312 snapshots are committed during stabilization
- `pnpm -r typecheck` and `pnpm -r test` are green
- Phase 3 closes without date-specific compositor hacks

## Suggested Session Opener

Use this in future Codex sessions:

> Read `docs/phase-3-session-loop.md` and execute the next Phase 3 tranche.
