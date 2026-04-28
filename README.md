# Officium Novum

A modernization of the [Divinum Officium](https://github.com/DivinumOfficium/divinum-officium) project — the community-maintained application that generates the traditional Roman Breviary and Missal texts.

Officium Novum decouples the liturgical data, rubrical logic, and presentation into discrete, testable layers while preserving the project's editorial integrity and the existing source texts in version-controlled, human-readable files.

## Motivation

The current Divinum Officium architecture — monolithic Perl CGI scripts parsing flat text files and rendering HTML server-side — tightly couples text retrieval, rubrical decisions, and presentation. This makes it difficult to:

- Support alternative output formats (JSON, EPUB, PDF)
- Enable third-party integrations and mobile clients
- Compose multilingual text cleanly
- Host cost-efficiently (every request triggers live filesystem parsing and HTML generation)
- Test rubrical correctness against published *Ordo* data

## Architecture

The modernization replaces the monolithic Perl application with a layered pipeline:

```
Source Texts (.txt)  ──>  Parser  ──>  Rubrical Engine  ──>  Composition Engine  ──>  API  ──>  Clients
     (Git)              (Phase 1)       (Phase 2)             (Phase 3)          (Phase 4)    (Phase 6)
```

- **Parser** — reads the legacy `.txt` files and emits typed, validated objects. Builds an in-memory text index queryable by feast, hour, language, and rubrical system.
- **Rubrical Engine** — the target pure function is `createRubricalEngine(config).resolveDayOfficeSummary(date) → DayOfficeSummary`. It encodes the calendar, occurrence, concurrence, commemoration, and hour-structuring logic for the supported Breviary versions by resolving each `VersionHandle` to a calendar chain plus a rubrical policy family. No I/O.
- **Composition Engine** — resolves text references from the `DayOfficeSummary` against a Phase-1-resolved text index, expands deferred node kinds (`psalmInclude`, `psalmRef`, `macroRef`, `formulaRef`), flattens seasonal conditionals, applies `HourDirective` post-transforms, and emits a format-agnostic `ComposedHour` tree of typed `Section`s with per-language `ComposedRun[]` lines. Phase 3 also carries the live Perl comparison harness used to enumerate and burn down output divergences.
- **API** — stateless, read-only JSON API. Phase 4 is underway with Fastify metadata/OpenAPI endpoints, explicit `VersionHandle` discovery, and public language-tag normalization; the Office composition route is the next tranche.
- **Frontend** — lightweight SPA consuming the API, with offline support via service worker caching.

The source `.txt` files remain the single source of truth, edited via standard Git workflows (diffs, blame, pull requests).

## Rubrical Systems

| System | Governing Documents | Key Characteristics |
|---|---|---|
| **Divino Afflatu (1911)** | *Rubricae Generales Breviarii* (1911) | Full semidouble/double ranking, most commemorations, pre-1955 Holy Week |
| **Simplified Rubrics (1955)** | *Cum Nostra* (1955) | Reduced vigils, simplified octave system, revised Holy Week |
| **1960 Rubrics** | *Rubricarum Instructum* (1960) | Four-class ranking, further reduction of commemorations |

See [Rubrical Sources](docs/rubrical-sources.md) for the canonical project mapping from ordo families to repo `VersionHandle`s, Divinum Officium source links, and deferred families.

## Repository Structure

```
officium-novum/
├── packages/
│   ├── parser/            # @officium-novum/parser — reads .txt files, emits typed objects
│   ├── rubrical-engine/   # @officium-novum/rubrical-engine — Phase 2 implementation
│   ├── compositor/        # @officium-novum/compositor — Phase 3 implementation
│   └── api/               # @officium-novum/api — Phase 4 Fastify/OpenAPI scaffold
├── upstream/          # Divinum Officium as a Git submodule (source texts + legacy Perl app)
├── docs/              # Specifications and design documents
│   ├── divinum-officium-modernization-spec.md
│   ├── file-format-specification.md
│   ├── phase-2-rubrical-engine-design.md
│   ├── phase-2g-beta-matins-corpus-inventory.md
│   ├── phase-3-composition-engine-design.md
│   ├── phase-4-API-design.md
│   ├── upstream-issues.md
│   └── adr/               # Architecture Decision Records for implementation choices
├── LICENSE            # GPL-3.0
└── pnpm-workspace.yaml
```

## Design Principles

1. **Liturgical correctness is non-negotiable.** Every phase is validated against known-good outputs. One misplaced commemoration is a shipping bug that people will pray incorrectly from.
2. **The texts are a scholarly corpus, not application data.** They remain in version-controlled, human-readable, diffable files.
3. **Incremental delivery.** Each phase produces a usable, standalone artifact.
4. **Separate what changes at different rates.** Texts (editorial, slow), rubrics (essentially fixed), presentation (platform-driven) — three concerns, three modules.
5. **Cost-consciousness.** The new architecture must be cheaper to operate than the current one.

## Documentation

- [Modernization Specification](docs/divinum-officium-modernization-spec.md) — full design document covering all phases, the rubrical engine interface, validation strategy, and migration plan
- [File Format Specification](docs/file-format-specification.md) — detailed specification of the legacy `.txt` file format (section headers, directives, cross-references, language conventions)
- [Rubrical Sources](docs/rubrical-sources.md) — canonical source index for the 1911 / 1955 / 1960 families plus the deferred Tridentine / monastic / Cistercian / Dominican families
- [Phase 2 Rubrical Engine Design](docs/phase-2-rubrical-engine-design.md) — detailed design for the rubrical engine: pipeline stages, version/policy model, occurrence/concurrence/transfer/commemoration algorithms, Matins planning, and the top-level API
- [Phase 2g-β Matins Corpus Inventory](docs/phase-2g-beta-matins-corpus-inventory.md) — focused inventory and notes for the Matins-structuring corpus work
- [Phase 3 Composition Engine Design](docs/phase-3-composition-engine-design.md) — detailed design for the compositor: pipeline, data model, preamble catalog, directive catalog, Matins composition, validation strategy, success criteria, and the 3a–3h sub-phase plan with per-sub-phase shipping summaries
- [Phase 4 API Design](docs/phase-4-API-design.md) — detailed design for the read-only JSON API: version/language normalization, DTO boundaries, metadata/office/day/calendar endpoints, error model, cache model, and sub-phase plan
- [Phase 3 Adjudication Log](packages/compositor/test/divergence/ADJUDICATION_LOG.md) — chronological audit trail of divergence adjudications against the legacy Perl renderer, per ADR-011
- [Upstream Perl issues](docs/upstream-issues.md) — forward-tracking file for divergence rows classified as legacy-Perl bugs
- [Architecture Decision Records](docs/adr/) — implementation ADRs for version binding, rule evaluation, transfer caching, concurrence previews, hour-structuring architecture, compositor resolved-corpus contract, incipit emission, divergence adjudication, Compline verb disposition, Lucan canticle structural slots, and the Phase 4 API version/language contract

## Status

| Phase | State |
|---|---|
| **1 — Parser** | Complete |
| **2 — Rubrical Engine** (Roman: 1911 / 1955 / 1960) | Complete |
| **2 — Non-Roman families** (Tridentine, Monastic, Cistercian, Dominican) | Deferred by design — explicit `UnsupportedPolicyError` stubs |
| **3 — Composition Engine** | Complete — all eight sub-phases (3a–3h) shipped. End-to-end composition, 8,784-composition no-throw sweep, typed `ComposeWarning` surface, Matins Benedictio + Te Deum replacement, Phase 2 commemoration-hour coordination, the adjudication-sidecar harness, and 312 Appendix-A snapshot goldens (13 dates × 3 policies × 8 Hours) are all in place. All three Roman policy ledgers report **0 unadjudicated** rows; `pnpm -C packages/compositor verify:phase-3-signoff` is green. See [Phase 3 Composition Engine Design §19](docs/phase-3-composition-engine-design.md) for per-sub-phase shipping summaries. |
| **4 — API** | In progress — 4b metadata endpoints and 4c office endpoint shipped in `@officium-novum/api`. Fastify app/server setup, OpenAPI 3.1 route generation, `/api/v1/status`, `/api/v1/versions`, `/api/v1/languages`, and `GET /api/v1/office/{date}/{hour}` are in place, including canonical `version` handling, `rubrics` aliases, public `la`/`en` language mapping, supported/deferred/missa-only version classification, `orthography=source|version`, `joinLaudsToMatins`, and `strict` query handling. Cache canonicalization/ETags are next. |
| **5 — Frontend** | Not started |

Phase 2's Roman decision pipeline is complete, but the 3h comparison burn-down has shown that "complete" does not mean the `HourStructure` schema is frozen. Narrow structural seams such as Matins benedictions, Prime Martyrology / `De Officio Capituli`, and Lucan canticle slots were added during Phase 3 to keep the Phase 2 / Phase 3 boundary honest without regressing into Perl-style control flow. See [Phase 2 Rubrical Engine Design §4.2](docs/phase-2-rubrical-engine-design.md) and [ADR-013](docs/adr/013-phase-3-lucan-canticle-slots.md).

**Validation.** Per design §19.1, the authority order is Ordo Recitandi → governing rubrical books (1911 / 1955 / 1960) → legacy Divinum Officium Perl output. Perl is a comparison target, not an oracle. Divergence ledgers live in `packages/rubrical-engine/test/divergence/` and `packages/compositor/test/divergence/`. Workspace validation passes with `pnpm -r typecheck` and `pnpm -r test` (parser + rubrical-engine + compositor + API), and `pnpm -C packages/compositor verify:phase-3-signoff` enforces the §18 sign-off gate (per-policy <10 `unadjudicated`, source-file 800-line cap, no `commitSha: pending` adjudications). The Phase 3 live comparison harness is available at `pnpm -C packages/compositor compare:phase-3-perl` (and `compare:phase-3-perl:full` for the full-year sweep). The harness exposes a `Matching prefix` column and per-policy best/average-matching-prefix summaries so forward progress is visible even when row counts stay flat; those metrics are kept in the checked-in ledgers rather than duplicated here, because they drift as tranches land. Classified rows are tracked in [`adjudications.json`](packages/compositor/test/divergence/adjudications.json) per ADR-011 and chronologically in the [Adjudication Log](packages/compositor/test/divergence/ADJUDICATION_LOG.md). Compositor `composeHour()` runs exception-free across the full 2024 × 3-policy × 8-hour matrix (8,784 compositions) as the `test:no-throw` check, and 312 Appendix-A snapshot goldens at [`packages/compositor/test/__goldens__/`](packages/compositor/test/__goldens__/) act as a stabilization tripwire — every compose-output drift surfaces as a reviewable diff in the standard test run. The Phase 4 API scaffold has its own package checks at `pnpm -C packages/api typecheck` and `pnpm -C packages/api test`.

See [CHANGELOG.md](CHANGELOG.md) for the sub-phase implementation log, and [`docs/adr/`](docs/adr/) for architectural decisions.

## License

[GPL-3.0](LICENSE), consistent with the upstream Divinum Officium project.
