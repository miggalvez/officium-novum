# Upstream Perl Issues

This document tracks divergences between Officium Novum and the legacy
Divinum Officium Perl renderer that are classified as `perl-bug` under
the adjudication protocol in [ADR-011](./adr/011-phase-3-divergence-adjudication.md).

## Protocol

Every entry below represents an adjudicated `perl-bug` family from
`packages/compositor/test/divergence/adjudications.json` — i.e., a set
of stable divergence rows where Officium Novum matches the primary
source (Ordo Recitandi, governing rubrical book, or the live corpus file
itself) and the legacy Perl renderer diverges.

Each entry must cite:

- The affected date / Hour / policy row keys.
- The primary source establishing the expected behaviour.
- A brief reproduction recipe using the `compare:phase-3-perl` harness.

These entries are intended as upstream bug reports; if the Divinum
Officium project accepts and fixes any of them, remove the corresponding
entry here and re-run the adjudication harness.

## Current entries

### 2026-04-19 — Divino Afflatu opening rubric prose is dropped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Divino Afflatu - 1954`, the compositor emits opening
rubric prose such as `Deinde, clara voce, dicitur Versus:` and
`Secus absolute incipiuntur, ut sequitur:` because those lines are
present verbatim in the upstream Latin corpus. The legacy Perl
comparison surface drops them and advances directly to the next visible
text, which creates shallow divergences across Matins, Lauds, Prime,
Terce, Sext, None, and Vespers.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:50-65`

Relevant sections:
- `Secus absolute Parvum`
- `Clara voce`
- `Secus absolute`

These sections explicitly contain the rubric sentences that the
compositor preserves.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Divino Afflatu - 1954"
```

Then inspect the first divergent rows in
`packages/compositor/test/divergence/divino-afflatu-2024.md`. The Perl
side shows `_` or jumps to `Nocturnus I`, while the compositor shows the
source-backed rubric prose from `Common/Rubricae.txt`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Divino Afflatu - 1954 | 2024-01-01 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-01 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Matins | `f8b9b84f` |
| Divino Afflatu - 1954 | 2024-01-06 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-06 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-07 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-13 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-14 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Vespers | `919de480` |

## See also

- [ADR-011 — Phase 3 divergence adjudication](./adr/011-phase-3-divergence-adjudication.md)
- [ADR-012 — Compline benediction verb disposition](./adr/012-compline-benediction-verb.md)
- [Phase 3 composition engine design §15 — Validation Strategy](./phase-3-composition-engine-design.md)
