# Upstream Perl Issues

This document tracks divergences between Officium Novum and the legacy
Divinum Officium Perl renderer that are classified as `perl-bug` under
the adjudication protocol in [ADR-011](./adr/011-phase-3-divergence-adjudication.md).

## Protocol

Every entry below represents an adjudicated row in
`packages/compositor/test/divergence/adjudications.json` whose `class`
is `perl-bug` — i.e., the Officium Novum compositor matches the primary
source (Ordo Recitandi, governing rubrical book, or the live corpus file
itself) and the legacy Perl renderer diverges.

Each entry must cite:

- The date, Hour, and policy (the stable divergence-row key).
- The primary source establishing the expected behaviour.
- A brief reproduction recipe using the `compare:phase-3-perl` harness.

These entries are intended as upstream bug reports; if the Divinum
Officium project accepts and fixes any of them, remove the corresponding
entry here and re-run the adjudication harness.

## Current entries

*(None yet. Populated during Phase 3 sub-phase 3h adjudication.)*

## See also

- [ADR-011 — Phase 3 divergence adjudication](./adr/011-phase-3-divergence-adjudication.md)
- [ADR-012 — Compline benediction verb disposition](./adr/012-compline-benediction-verb.md)
- [Phase 3 composition engine design §15 — Validation Strategy](./phase-3-composition-engine-design.md)
