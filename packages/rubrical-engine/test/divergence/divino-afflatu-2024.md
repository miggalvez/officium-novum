# Divino Afflatu 2024 Divergences

This file tracks the remaining **Perl fixture vs engine** differences after the
current engine-bug cleanup pass.

## Current status

- Source of comparison:
  - `packages/rubrical-engine/test/fixtures/divino-afflatu-2024.json`
  - `pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures`
- Exact-match rows: `55/62`
- Divergent rows: `7/62`

## Remaining rows

| Date | Fields |
|---|---|
| 2024-02-25 | commemorations, concurrenceWinner, concurrenceSourcePath |
| 2024-05-26 | commemorations |
| 2024-08-19 | concurrenceWinner, concurrenceSourcePath |
| 2024-09-08 | celebrationPath, commemorations, concurrenceSourcePath |
| 2024-09-15 | celebrationPath, commemorations, concurrenceSourcePath |
| 2024-09-29 | concurrenceWinner, concurrenceSourcePath |
| 2024-10-06 | concurrenceWinner, concurrenceSourcePath |

## Notes

- The obvious engine-side regressions cleared in this pass were:
  - phantom `Nat01` / `Nat06` commemorations
  - Holy Saturday concurrence routing
  - Ember Saturday Matins shape
  - same-day optional commemoration collapse
  - Christmas Eve Matins + commemoration suppression
- The remaining rows need source-backed adjudication or another targeted policy pass.
