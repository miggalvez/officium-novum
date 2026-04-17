# ADR-007: Keep Matins as a plan-first pipeline (`buildMatinsPlan` -> `structureMatins`)

- **Status:** accepted
- **Date:** 2026-04-16
- **Deciders:** Phase 2g-beta implementation pass
- **Related:** `docs/phase-2-rubrical-engine-design.md` §16.3, §18

## Context

Matins is the densest Hour in Roman 1960: nocturn shape, lesson-source routing,
`in N loco` alternates, Directorium scripture-transfer post-processing,
per-nocturn responsories, and Te Deum replacement/omission logic all interact.

The upstream Perl path (`horas.pl::hora('Matutinum', ...)`) interleaves planning
and rendering in one long mutable flow. Phase 2 needs the opposite:

- preserve symbolic references (no text dereference yet),
- keep warning emissions explicit and testable,
- make Matins behavior serializable in `HourStructure`, and
- avoid coupling plan logic to Phase 3 text transforms.

## Options Considered

### Option A — Structure directly while routing lessons

Build `HourStructure` in one pass (route lessons while filling slots).

- Pro: fewer intermediate objects.
- Con: hard to verify transfer/alternate post-passes without mutating slots.
- Con: mixes policy decisions with slot-shaping and encourages Perl-style flow.

### Option B — Plan first, then structure

Build an immutable `MatinsPlan` (`TextReference` + typed lesson-source graph),
apply post-passes there (scripture-transfer, Te Deum replacement marker), then
wrap it into `HourStructure`.

- Pro: keeps decisions symbolic and testable before presentation wrapping.
- Pro: allows focused unit tests for plan, routing, alternates, transfer.
- Pro: matches §16.3 boundary and avoids hidden dereference work.
- Con: introduces a new type surface and one extra transformation step.

## Decision

Use **Option B**.

Phase 2g-beta introduces a strict split:

1. `buildMatinsPlan(...)` creates immutable `MatinsPlan` data.
2. `applyScriptureTransfer(...)` mutates only the plan representation.
3. `structureMatins(...)` maps the final plan into `HourStructure` slots.

`structureMatins` may call the shared `applyRuleSet` pipeline only for wrapper
slots (`oration`, `conclusion`). Matins-specific planning decisions stay in the
plan stage.

## Consequences

- Positive: Matins policy behavior is now testable at the right granularity
  (`matins-plan`, `matins-lessons`, `matins-scripture`, `matins-alternates`).
- Positive: `summary.hours.matins` remains fully structural/serializable and
  Phase 3 can consume it without re-deriving rubrical logic.
- Positive: Directorium scripture-transfer is now consumed in one isolated
  post-pass and tracked by warning code.
- Negative: there is duplication risk if future contributors bypass the plan
  layer and add ad-hoc slot mutations in `structureMatins`.
- Follow-up: non-1960/monastic Matins (Phase 2h) should extend policy hooks and
  plan routing, not short-circuit this split.

## Notes

- New types: `packages/rubrical-engine/src/types/matins.ts`
- Plan stage: `packages/rubrical-engine/src/hours/matins-plan.ts`
- Structuring stage: `packages/rubrical-engine/src/hours/matins.ts`
- Engine integration point: `packages/rubrical-engine/src/engine.ts` (`hours.matins`)
