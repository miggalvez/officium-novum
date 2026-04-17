# Divino Afflatu 2024 Divergences

This file tracks the **Perl fixture vs engine** comparison state for the
Phase 2h Divino Afflatu policy.

## Current status

- Source of comparison:
  - `packages/rubrical-engine/test/fixtures/divino-afflatu-2024.json`
  - `pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures`
- Exact-match rows: `62/62`
- Divergent rows: `0/62`

## Remaining rows

None. `pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures` now
reports zero mismatches for `Divino Afflatu - 1954` across the sampled
62-date 2024 matrix.

## Notes

- The final cleanup pass that cleared the remaining rows covered:
  - privileged-Sunday transfer vs commemoration handling
  - ordinary-Sunday vs higher double occurrence
  - octave/vigil precedence around Epiphany, Easter, and Christmas
  - Divino Afflatu concurrence cells for equal doubles and Sunday-to-double transitions
