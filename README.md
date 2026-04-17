# Officium Nova

A modernization of the [Divinum Officium](https://github.com/DivinumOfficium/divinum-officium) project — the community-maintained application that generates the traditional Roman Breviary and Missal texts.

Officium Nova decouples the liturgical data, rubrical logic, and presentation into discrete, testable layers while preserving the project's editorial integrity and the existing source texts in version-controlled, human-readable files.

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
- **Rubrical Engine** — the target pure function is `(date, versionHandle) → OrdoEntry`. It encodes the calendar, occurrence, concurrence, and commemoration logic for the supported Breviary versions by resolving each `VersionHandle` to a calendar chain plus a rubrical policy family. No I/O.
- **Composition Engine** — resolves text references from the `OrdoEntry` against the text index, applies inline rubrical modifications, and produces a format-agnostic structured document.
- **API** — stateless, read-only JSON API (`GET /api/v1/office/{date}/{hour}`) with aggressive HTTP caching.
- **Frontend** — lightweight SPA consuming the API, with offline support via service worker caching.

The source `.txt` files remain the single source of truth, edited via standard Git workflows (diffs, blame, pull requests).

## Rubrical Systems

| System | Governing Documents | Key Characteristics |
|---|---|---|
| **Divino Afflatu (1911)** | *Rubricae Generales Breviarii* (1911) | Full semidouble/double ranking, most commemorations, pre-1955 Holy Week |
| **Simplified Rubrics (1955)** | *Cum Nostra* (1955) | Reduced vigils, simplified octave system, revised Holy Week |
| **1960 Rubrics** | *Rubricarum Instructum* (1960) | Four-class ranking, further reduction of commemorations |

## Repository Structure

```
officium-nova/
├── packages/
│   ├── parser/            # @officium-nova/parser — reads .txt files, emits typed objects
│   └── rubrical-engine/   # @officium-nova/rubrical-engine — Phase 2 implementation
├── upstream/          # Divinum Officium as a Git submodule (source texts + legacy Perl app)
├── docs/              # Specifications and design documents
│   ├── divinum-officium-modernization-spec.md
│   ├── file-format-specification.md
│   ├── phase-2-rubrical-engine-design.md
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
- [Phase 2 Rubrical Engine Design](docs/phase-2-rubrical-engine-design.md) — detailed design for the rubrical engine: pipeline stages, version/policy model, occurrence/concurrence/transfer/commemoration algorithms, Matins planning, and the top-level API

## Status

**Phase 1 — Parser (complete).** The `@officium-nova/parser` package parses the full 34,000+ file corpus across 16 languages, resolves cross-references with language fallback, and builds an in-memory text index. All 64 tests pass, including a spot-check validation of 62 representative feast files across languages against resolved snapshots.

Implemented:

- Section splitter, directive parser, condition parser (recursive descent with `aut`/`et`/`nisi` precedence), rank parser, rule parser
- Cross-reference resolver with path resolution, language fallback chains, line selectors, regex substitutions, cycle detection, and preamble merging
- Corpus walker (horas/, missa/, Tabulae/ with rite variant detection), file loader, file cache
- Calendar parsers (Kalendarium, feast transfers, version registry)
- In-memory text index queryable by path and content directory
- Corpus loader with integrated reference resolution

**Phase 2 — Rubrical Engine (in progress).** The detailed design is in [`docs/phase-2-rubrical-engine-design.md`](docs/phase-2-rubrical-engine-design.md). Pipeline: Version Resolver → Temporal/Sanctoral → Directorium Overlay → Candidate Assembly → Occurrence Resolver → Celebration Rule Eval → Transfer Computation → Concurrence → Commemoration Assembly → Hour Structuring. Phase 2 is broken into eight sub-phases (2a–2h) per §18 of the design.

**Phase 2a — Foundations (complete).** The end-to-end deliverable from design §18 is in place: `createRubricalEngine(config).resolveDayOfficeSummary(date)` returns temporal + sanctoral candidates with a naive (highest-raw-rank) winner for every date.

Implemented in 2a:

- `@officium-nova/rubrical-engine` package scaffold with build, typecheck, and Vitest setup
- Version-layer foundations: branded `VersionHandle`, `ResolvedVersion`, `VersionDescriptor`, and immutable `VersionRegistry`
- `data.txt` registry builder and version resolver with four-way error dispatch (unknown / missa-with-hint / missa-without-hint / unbound Breviary)
- Policy binding map covering all 15 Breviary rows in `Tabulae/data.txt` across 10 distinct policy families
- Temporal cycle: Meeus/Jones/Butcher Gregorian computus; `dayNameForDate`/`weekStemForDate` cross-checked against the upstream Perl `getweek` on a 550+ date matrix spanning 2020–2030; `LiturgicalSeason` classifier
- Sanctoral kalendarium lookup that walks the inheritance chain via `ResolvedVersion.base`, replicating upstream `Directorium.pm`'s date-level override semantics and the bisextile Feb 24 remap
- Policy-hookable rank normalization (`defaultResolveRank` for Phase 2a; pluggable for Phase 2c+)
- Conditional evaluation for `aut`/`et`/`nisi` expressions against `rubrica`/`tempore`/`mense`/`die`/`feria` subjects
- Canonical content-dir routing (`Tempora`, `TemporaM`, `TemporaCist`, `TemporaOP`, same for `Sancti`)
- Candidate assembly with equal-rank tie-breaking in favor of the temporal cycle
- `policyOverride` composite pattern: overrides augment the configured policy map rather than replacing it

**Phase 2b — Directorium Overlay (complete).** The per-date `DirectoriumOverlay` is computed from the version's `Transfer`/`Stransfer` tables, surfaced on `DayOfficeSummary` (as `undefined` when empty), and threaded back into candidate assembly with resolved replacement ranks and typed warnings.

Implemented in 2b:

- `DirectoriumOverlay` type: `officeSubstitution?`, `dirgeAtVespers?`, `dirgeAtLauds?`, `hymnOverride?`, `scriptureTransfer?` — the split-Hour dirge shape reflects that `dirge1`/`dirge2`/`dirge3` are a month partition, not an Hour partition (per `Directorium.pm:229-237` and `horas/Help/technical.html`)
- `computeYearKey(year)` — Sunday-letter + Easter-MMDD derivation mirroring Perl's `load_transfer`, including the leap-year companion pair with the `332 → 401` wrap
- `YearTransferTable` / `ScriptureTransferTable` with inheritance-chain lookup via `ResolvedVersion.transferBase`, leap-chunk filtering equivalent to Perl's `load_transfer_file` `regexp`/`regexp2`, and a runtime guard that rejects mixed wildcard/named-handle inputs at construction
- `matchesVersionFilter` — Perl-shape regex match (version name as pattern, filter as string) with a tokenized-substring fallback; agreement with Perl semantics validated on every `(filter × transfer-name)` pair from the live `Tabulae` files
- Dirge extraction as a union scan over all three buckets, keyed on today's sday for Lauds and tomorrow's sday for Vespers — independently, so a single civil date can carry both attachments
- Office-substitution extraction with `Tempora/<path>` and bare-`MM-DD` canonicalization, plus an `overlay-alternates-deferred` info warning when tilde-chained targets are seen (consumed in Phase 2e)
- Candidate-assembly substitution: `resolveOverlayCandidate` callback resolves both `feastRef` and `rank` for the replacement against the corpus, so the substituted candidate carries its own rank rather than inheriting the displaced one; resolver failures surface as `severity: 'error'` warnings and fall back to the displaced rank
- Integration harness that loads every real `Tabulae/Transfer/*.txt` and `Tabulae/Stransfer/*.txt` file and asserts overlay directives for a focused matrix (leap-year companion substitution on 2024-01-08, hymn-merge on 2025-05-18, simultaneous dirge pair on 2025-11-02/2025-11-03, and `~R`/`~B`/`~A` scripture operations)

**Phase 2c — Occurrence for 1960 (complete).** The 1960 occurrence stage from design §18 is now wired end-to-end: `resolveDayOfficeSummary(date)` returns a resolved `celebration` and raw `commemorations`, with deferred transfer signaling for Phase 2e.

Implemented in 2c:

- `PRECEDENCE_1960` plus class-symbol registry with explicit Rubricarum Instructum/Tabella citations
- `rubrics1960Policy` with precedence lookup, seasonal preemption, deterministic candidate comparison, privileged-feria detection, and deferred octave hook
- Pure `resolveOccurrence(candidates, temporal, policy)` outputting `celebration`, `commemorations`, `omitted`, `transferQueue`, and typed warnings (`occurrence-season-preemption`, `occurrence-transfer-deferred`, `occurrence-omitted`)
- Expanded `RubricalPolicy` interface for occurrence hooks; non-1960 policies now fail loud at occurrence-time via `UnsupportedPolicyError` while still allowing engine construction
- `DayOfficeSummary` evolution to include `celebration` + `commemorations` while preserving `winner` as a deprecated compatibility mirror
- 1960-specific rank normalization (`rubrics1960ResolveRank`) mapped to precedence class symbols with a weight-consistency invariant against the precedence table
- Edge-case coverage for design §10.4 (Annunciation/Holy Week, St Joseph/Palm Sunday, bisextile St Matthias remap semantics, Dec 8 vs Advent II, Vigil of Epiphany clash, Ember Saturday clash, dual sanctoral collision, Triduum suppression)
- Focused upstream integration matrix (`test/fixtures/ordo-1960-2024.json`) validated against a real 1960 engine build

ADRs for the key architectural decisions so far:

- [`docs/adr/001-version-handle-primary-binding.md`](docs/adr/001-version-handle-primary-binding.md)
- [`docs/adr/002-two-scope-rule-evaluation.md`](docs/adr/002-two-scope-rule-evaluation.md)
- [`docs/adr/003-phase-2c-non-1960-stubs.md`](docs/adr/003-phase-2c-non-1960-stubs.md)
- [`docs/adr/004-phase-2e-year-map-caching.md`](docs/adr/004-phase-2e-year-map-caching.md)
- [`docs/adr/005-phase-2f-concurrence-preview.md`](docs/adr/005-phase-2f-concurrence-preview.md)
- [`docs/adr/006-phase-2g-ordinarium-skeleton-cache.md`](docs/adr/006-phase-2g-ordinarium-skeleton-cache.md)
- [`docs/adr/007-phase-2g-matins-plan-separation.md`](docs/adr/007-phase-2g-matins-plan-separation.md)

**Phase 2d — Rule Evaluation (complete).** The dedicated rule-evaluation stage from design §12/§18 is now wired after occurrence: every winning celebration now carries a typed `CelebrationRuleSet`, with tested per-hour derivation via `deriveHourRuleSet`.

Implemented in 2d:

- New `types/rule-set.ts` contract (`CelebrationRuleSet`, `HourRuleSet`, `MatinsRuleSpec`, `HourScopedDirective`, supporting unions)
- New `rules/` module:
  - `evaluate.ts` (`buildCelebrationRuleSet`) for policy defaults + feast directives + commemorated lesson routing
  - `classify.ts` vocabulary mapper (`celebration` / `hour` / `missa` / `unmapped`)
  - `resolve-vide-ex.ts` chained `vide`/`ex` inheritance with missing-target, cycle, and depth-limit warnings
  - `merge.ts` pure merges plus tested `deriveHourRuleSet`
  - `apply-conditionals.ts` paragraph-scoped conditional evaluation primitive for Phase 2g wiring
- Policy hook expansion: `RubricalPolicy.buildCelebrationRuleSet`; 1960 delegates to default evaluator; non-1960 policy stubs throw `UnsupportedPolicyError`
- Engine integration: `DayOfficeSummary` now includes `celebrationRules`, and rule-evaluation warnings are merged into `summary.warnings`
- Upstream regression harness for `horas/Latin/Sancti` + `horas/Latin/Tempora` with stable unmapped/missa-pass-through totals

**Phase 2e — Transfer Computation and Vigils (complete).** Transfer-flagged losers are now fully resolved into concrete target dates through a cached year-map (`(version, year)`), reconciled against the Directorium transfer table (overlay wins on disagreement), and surfaced back into daily candidate assembly as `source: 'transferred-in'` with `transferredFrom` metadata. Candidate assembly also tags vigils (`vigilOf`) and wires celebration-level vigil/transfer metadata through occurrence into `DayOfficeSummary`. New transfer diagnostics are emitted as data (`transfer-rule-agrees-with-overlay`, `transfer-table-overrides-rule`, `transfer-perpetually-impeded`, `transfer-bounded-search-exceeded`), and upstream integration coverage now includes transfer matrices plus vigil behavior.

**Phase 2f — Concurrence and Compline (complete).** `resolveDayOfficeSummary(date)` now computes the Vespers boundary between today and tomorrow using cached per-date `DayConcurrencePreview` materialization, honors `hasFirstVespers` / `hasSecondVespers` veto flags before rank-matrix comparison, and emits typed concurrence outputs (`winner`, source celebration, Vespers-only concurrence commemorations, reason tags, warnings). The 1960 policy now provides explicit concurrence-table resolution (`concurrence/tables/vespers-1960.ts`) plus Compline-source selection (`vespers-winner` / `ordinary` / `triduum-special`), and `hours/compline.ts` ships the Phase 2f minimal `HourStructure` (source + directives, empty slots by design). Upstream fixture coverage now includes a focused 2024 concurrence/Compline matrix (`test/fixtures/vespers-1960-2024.json`).

**Phase 2g (α + β) — Hour Structuring (complete).** `summary.hours` is now populated with typed `HourStructure` values for all eight Hours (`matins`, `lauds`, `prime`, `terce`, `sext`, `none`, `vespers`, `compline`) per design §16.

2g-α delivered the non-Matins infrastructure:

- `hours/skeleton.ts` with `OrdinariumSkeletonCache` (per-engine, keyed on `(version.handle, hour)`); walks the legacy `#Heading` markers inside the `__preamble` of `horas/Ordinarium/*.txt` and maps each to a typed `SlotName`.
- `hours/psalter.ts` implementing the §16.2 psalter-selection decision tree for Roman 1960 (ferial / dominica / festal / proper, with `psalmOverrides` and `psalterScheme` honored); emits `TextReference`-shaped `PsalmAssignment[]` for Phase 3 to dereference.
- `hours/transforms.ts` emitting seasonal + rubric-driven `HourDirective`s (`add-alleluia` / `omit-alleluia` / `add-versicle-alleluia`, Triduum `omit-gloria-patri` + `short-chapter-only`, `preces-feriales`, 1960-always `omit-suffragium`, `dirge-vespers` / `dirge-lauds` from overlay, Ember-Wed `genuflection-at-oration`).
- `hours/apply-rule-set.ts` common skeleton-application pipeline: feast proper → commune fallback (via `comkey`) → psalter (`policy.selectPsalmody`) → Ordinarium default; `hourRules.omit` suppresses as `{ kind: 'empty' }`; `overlay.hymnOverride` attaches typed `HymnOverrideMeta` to the hymn slot.
- Per-Hour structurers: `structureLauds`, `structureVespers`, `structurePrime` / `structureTerce` / `structureSext` / `structureNone`, plus an expanded `buildCompline` that keeps the existing `source` field and now populates real slots.
- Commemoration attachment for Lauds and Vespers (three ordered-ref slots: `commemoration-antiphons` / `-versicles` / `-orations`), consuming the existing `Commemoration.hours` field from Phase 2c/2f; minor hours and Compline never produce commemoration slots under 1960 per RI §107.
- Policy interface gains `selectPsalmody(params)` and `hourDirectives(params)`; `rubrics-1960` wires both; non-1960 stubs throw `UnsupportedPolicyError`.
- Engine integration: Vespers is structured for the concurrence winner (today's Second Vespers or tomorrow's First Vespers) with a uniform §16 input shape; Compline follows the Vespers winner; a missing Ordinarium file is demoted from a throw to a `hour-skeleton-missing` warning so legacy unit fixtures remain compatible.
- New fixture `test/fixtures/hours-1960-2024.json` + `test/integration/phase-2g-upstream.test.ts` assert the full structured Hour inventory and per-date directive flags (Lent omits alleluia; Triduum omits Gloria Patri + short chapter; Paschaltide adds alleluia; 1960 always omits suffragium).

2g-β then completed Matins as a dedicated plan-first pipeline:

- `types/matins.ts` immutable Matins type surface (`MatinsPlan`, `NocturnPlan`, `LessonSource`, `PericopeRef`, `ScriptureCourse`, etc.).
- `hours/matins-plan.ts` pure plan builder (`buildMatinsPlan`) that emits typed references without text dereferencing.
- `hours/matins-lessons.ts` lesson router consuming `celebrationRules.lessonSources` and `commemorated-principal` materialized overrides from Phase 2d.
- `hours/matins-scripture.ts` Directorium scripture-transfer post-pass (`R` / `B` / `A`) over scripture-kind lessons only.
- `hours/matins-alternates.ts` `in N loco` alternate selection with condition gates.
- `hours/matins.ts` structurer that wraps the plan into Matins slot content and reuses `applyRuleSet` only for wrapper slots.
- Policy hooks added for Matins shape, Te Deum resolution, and default scripture course (`resolveMatinsShape`, `resolveTeDeum`, `defaultScriptureCourse`), with non-1960 stubs throwing `UnsupportedPolicyError`.
- New fixture `test/fixtures/matins-1960-2024.json` + `test/integration/phase-2g-beta-upstream.test.ts` asserting Matins shape across the focused date matrix, including Triduum Te Deum omission, Ember Saturday shape, and scripture-transfer application.

442 rubrical-engine tests passing (plus one TODO marker) in full workspace validation, including the new Matins suites, upstream matrix, and review-driven regressions (Psalterium antiphon/psalm/versicle fallback for seasonal/ferial Matins, pre-transfer Te Deum shape, dereferenceable season invitatory references).

Still pending in Phase 2:

- **2h** — 1911 (Divino Afflatu) and 1955 (Reduced) policies.

## License

[GPL-3.0](LICENSE), consistent with the upstream Divinum Officium project.
