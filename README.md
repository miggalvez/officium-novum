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
- **Rubrical Engine** — the target pure function is `(date, versionHandle) → OrdoEntry`. It encodes the calendar, occurrence, concurrence, and commemoration logic for the supported Breviary versions by resolving each `VersionHandle` to a calendar chain plus a rubrical policy family. No I/O.
- **Composition Engine** — resolves text references from the `DayOfficeSummary` against a Phase-1-resolved text index, expands deferred node kinds (`psalmInclude`, `macroRef`, `formulaRef`), flattens seasonal conditionals, applies `HourDirective` post-transforms, and emits a format-agnostic `ComposedHour` tree of typed `Section`s with per-language `ComposedRun[]` lines.
- **API** — stateless, read-only JSON API (`GET /api/v1/office/{date}/{hour}`) with aggressive HTTP caching.
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
│   └── compositor/        # @officium-novum/compositor — Phase 3 implementation
├── upstream/          # Divinum Officium as a Git submodule (source texts + legacy Perl app)
├── docs/              # Specifications and design documents
│   ├── divinum-officium-modernization-spec.md
│   ├── file-format-specification.md
│   ├── phase-2-rubrical-engine-design.md
│   ├── phase-2g-beta-matins-corpus-inventory.md
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
- [Architecture Decision Records](docs/adr/) — implementation ADRs for version binding, rule evaluation, transfer caching, concurrence previews, and hour-structuring architecture

## Status

**Phase 1 — Parser (complete).** The `@officium-novum/parser` package parses the full 34,000+ file corpus across 16 languages, resolves cross-references with language fallback, and builds an in-memory text index. All 64 tests pass, including a spot-check validation of 62 representative feast files across languages against resolved snapshots.

Implemented:

- Section splitter, directive parser, condition parser (recursive descent with `aut`/`et`/`nisi` precedence), rank parser, rule parser
- Cross-reference resolver with path resolution, language fallback chains, line selectors, regex substitutions, cycle detection, and preamble merging
- Corpus walker (horas/, missa/, Tabulae/ with rite variant detection), file loader, file cache
- Calendar parsers (Kalendarium, feast transfers, version registry)
- In-memory text index queryable by path and content directory
- Corpus loader with integrated reference resolution

**Phase 2 — Rubrical Engine (Roman scope complete; non-Roman families deferred by design).** The detailed design is in [`docs/phase-2-rubrical-engine-design.md`](docs/phase-2-rubrical-engine-design.md). Pipeline: Version Resolver → Temporal/Sanctoral → Directorium Overlay → Candidate Assembly → Occurrence Resolver → Celebration Rule Eval → Transfer Computation → Concurrence → Commemoration Assembly → Hour Structuring. The Roman headline policies from design §18 (`divino-afflatu`, `reduced-1955`, `rubrics-1960`) now resolve full `DayOfficeSummary` outputs without throws; the remaining Tridentine/monastic/Cistercian/Dominican families stay on explicit stubs by scope.

**Validation.** Per design §19.1, the authority order is: Ordo Recitandi → governing rubrical books (1911 / 1955 / 1960) → legacy Divinum Officium Perl output. Perl is a comparison target, not an oracle. Divergence ledgers live in `packages/rubrical-engine/test/divergence/`, with the current documented residual state at `rubrics-1960`: `8` mismatches across `7` dates, `divino-afflatu`: `0/62` divergent rows, and `reduced-1955`: `0/61` divergent rows.

**Phase 2a — Foundations (complete).** The end-to-end deliverable from design §18 is in place: `createRubricalEngine(config).resolveDayOfficeSummary(date)` returns temporal + sanctoral candidates with a naive (highest-raw-rank) winner for every date.

Implemented in 2a:

- `@officium-novum/rubrical-engine` package scaffold with build, typecheck, and Vitest setup
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
- Expanded `RubricalPolicy` interface for occurrence hooks; Phase 2c shipped 1960 first, and Phase 2h later filled `divino-afflatu` + `reduced-1955` while leaving the non-Roman families on explicit `UnsupportedPolicyError` stubs
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
- [`docs/adr/008-compositor-conditions-and-latin-rooted-refs.md`](docs/adr/008-compositor-conditions-and-latin-rooted-refs.md)
- [`docs/adr/009-compositor-resolved-corpus-and-deferred-nodes.md`](docs/adr/009-compositor-resolved-corpus-and-deferred-nodes.md)

**Phase 2d — Rule Evaluation (complete).** The dedicated rule-evaluation stage from design §12/§18 is now wired after occurrence: every winning celebration now carries a typed `CelebrationRuleSet`, with tested per-hour derivation via `deriveHourRuleSet`.

Implemented in 2d:

- New `types/rule-set.ts` contract (`CelebrationRuleSet`, `HourRuleSet`, `MatinsRuleSpec`, `HourScopedDirective`, supporting unions)
- New `rules/` module:
  - `evaluate.ts` (`buildCelebrationRuleSet`) for policy defaults + feast directives + commemorated lesson routing
  - `classify.ts` vocabulary mapper (`celebration` / `hour` / `missa` / `unmapped`)
  - `resolve-vide-ex.ts` chained `vide`/`ex` inheritance with missing-target, cycle, and depth-limit warnings
  - `merge.ts` pure merges plus tested `deriveHourRuleSet`
  - `apply-conditionals.ts` paragraph-scoped conditional evaluation primitive for Phase 2g wiring
- Policy hook expansion: `RubricalPolicy.buildCelebrationRuleSet`; 1960 shipped first, and Phase 2h later wired the same typed evaluation path for `divino-afflatu` and `reduced-1955`
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
- Policy interface gains `selectPsalmody(params)` and `hourDirectives(params)`; 1960 shipped first, and Phase 2h later generalized both hooks across the Roman 1911/1955/1960 policies while leaving the explicitly deferred non-Roman families stubbed.
- Engine integration: Vespers is structured for the concurrence winner (today's Second Vespers or tomorrow's First Vespers) with a uniform §16 input shape; Compline follows the Vespers winner; a missing Ordinarium file is demoted from a throw to a `hour-skeleton-missing` warning so legacy unit fixtures remain compatible.
- New fixture `test/fixtures/hours-1960-2024.json` + `test/integration/phase-2g-upstream.test.ts` assert the full structured Hour inventory and per-date directive flags (Lent omits alleluia; Triduum omits Gloria Patri + short chapter; Paschaltide adds alleluia; 1960 always omits suffragium).

2g-β then completed Matins as a dedicated plan-first pipeline:

- `types/matins.ts` immutable Matins type surface (`MatinsPlan`, `NocturnPlan`, `LessonSource`, `PericopeRef`, `ScriptureCourse`, etc.).
- `hours/matins-plan.ts` pure plan builder (`buildMatinsPlan`) that emits typed references without text dereferencing.
- `hours/matins-lessons.ts` lesson router consuming `celebrationRules.lessonSources` and `commemorated-principal` materialized overrides from Phase 2d.
- `hours/matins-scripture.ts` Directorium scripture-transfer post-pass (`R` / `B` / `A`) over scripture-kind lessons only.
- `hours/matins-alternates.ts` `in N loco` alternate selection with condition gates.
- `hours/matins.ts` structurer that wraps the plan into Matins slot content and reuses `applyRuleSet` only for wrapper slots.
- Policy hooks added for Matins shape, Te Deum resolution, and default scripture course (`resolveMatinsShape`, `resolveTeDeum`, `defaultScriptureCourse`); Phase 2h later filled those hooks for `divino-afflatu` and `reduced-1955`.
- New fixture `test/fixtures/matins-1960-2024.json` + `test/integration/phase-2g-beta-upstream.test.ts` asserting Matins shape across the focused date matrix, including Triduum Te Deum omission, Ember Saturday shape, and scripture-transfer application.

**Phase 2h — 1911 and 1955 Policies (complete).** The pre-1955 Roman policy families from design §18 now resolve end-to-end without fallback throws: `Divino Afflatu - 1939`, `Divino Afflatu - 1954`, `Reduced - 1955`, and the two existing 1960 handles all complete `resolveDayOfficeSummary(date)` with policy-owned occurrence, concurrence, transfer, commemoration limiting, hour directives, psalter selection, and Matins shaping.

Implemented in 2h:

- Real `policy/divino-afflatu.ts` and `policy/reduced-1955.ts` objects plus their own precedence and concurrence tables; `version/policy-map.ts` now binds those policies to the existing 1939/1954/1955 handles without changing the public API
- Shared policy-contract expansion for pre-1955 behavior: typed octave metadata, candidate/celebration/commemoration octave-vigil provenance, and policy-owned commemoration limiting reused by both the engine summary and per-Hour structuring
- Pre-1955 hour generalization for seasonal directives, suffragium/preces behavior, Matins shape, Te Deum outcome, scripture-course routing, transfer search, and Compline source selection while preserving the existing 1960 behavior
- New unit coverage for both pre-1955 policies and both new precedence tables, plus upstream-backed 2024 fixture coverage for occurrence, concurrence, hours, and Matins in `test/fixtures/phase-2h-roman-2024.json`, now including Easter/Pentecost octave Matins and representative Christmas / SS Peter & Paul octave dates
- Perl comparison tooling is now available at `packages/rubrical-engine/test/fixtures/officium-snapshot.pl` with `pnpm -C packages/rubrical-engine generate:phase-2h-perl-fixtures` and `pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures` for divergence reporting against the legacy engine without making Perl an unconditional CI oracle
- Full-year 2024 no-throw integration sweep across every handle bound to `divino-afflatu`, `reduced-1955`, and `rubrics-1960`, plus explicit edge-case coverage for `2024-03-25`, `2024-12-08`, `2025-01-05`, and `2062-03-19`
- Post-Phase-2h 1960 cleanup aligned the focused 1960 occurrence / Vespers / Matins fixtures with the governing 1960 rubrics and fixed the remaining engine-side 1960 bugs around fourth-class feria commemorations and Saturday BVM synthesis on non-free Saturdays
- Residual Perl-snapshot disagreements are now tracked explicitly in `packages/rubrical-engine/test/divergence/rubrics-1960-2024.md`, `packages/rubrical-engine/test/divergence/divino-afflatu-2024.md`, and `packages/rubrical-engine/test/divergence/reduced-1955-2024.md`; the 1960 rows are still documented as adjudicated divergences or comparison-surface differences, while the Divino Afflatu and 1955 ledgers now record full 2024 fixture parity rather than adjudication backlog

475 rubrical-engine tests passing (plus one TODO marker) in package validation, including the 1911/1955 suites, the year-wide supported-handle no-throw matrix, the refreshed 1960 upstream fixtures, and the upstream-backed Phase 2h regression fixtures.

**Phase 3 — Composition Engine (core pipeline shipped; liturgical directives and Perl/Ordo comparison still open).** The `@officium-novum/compositor` package now turns a `DayOfficeSummary` + Phase-1-resolved `CorpusIndex` into a typed, format-agnostic `ComposedHour`. The architectural boundary from ADR-008 / ADR-009 is enforced in code: the compositor never re-runs the parser's `@`-reference resolver, and unresolved `reference` nodes are surfaced as `unresolved-reference` runs rather than silently dropped.

Implemented in Phase 3:

- `@officium-novum/compositor` package scaffold with build, typecheck, and Vitest setup
- Pure-function entry: `composeHour({ corpus, summary, version, hour, options }) → ComposedHour`; no I/O
- Reference resolver with Latin-rooted path convention (Phase 2 emits `horas/Latin/...` paths) swapped into the requested language, walking the parser's `languageFallbackChain` for graceful fallback
- Selector semantics on `TextReference`: integer selectors (1-based raw content index used by `matins-plan.ts`), `'missing'` sentinel (surfaces a rubric placeholder, not stale text), comma-separated psalm lists on `Psalterium/Psalmorum/PsalmN`, weekday-keyed minor-hour psalmody on `Psalterium/Psalmi/Psalmi minor`, and season-keyed seasonal invitatory injection into the Psalm 94 skeleton — the five structured selector shapes Phase 2 actually emits
- Deferred-node expansion for the residual kinds Phase 1 intentionally leaves in place: `psalmInclude` → `Psalterium/Psalmorum/Psalm{N}` (`__preamble`), `macroRef` → `Common/Prayers` section lookup with alias fallbacks, `formulaRef` → same with rubric-prefix stripping; cycle-safe via per-`(language, path#section)` seen set, depth-limited
- Conditional flattening via `evaluateConditionalBlock` (re-exported from `rubrical-engine` at `condition-eval.ts`) applied to resolved section content using a `ConditionEvalContext` derived from `DayOfficeSummary.temporal` and the `ResolvedVersion`
- Matins plan-aware composer: walks `InvitatoriumSource` / `NocturnPlan[]` / `te-deum` decisions from Phase 2g-β, emits language-neutral structured heading nodes (`{ kind: 'nocturn' | 'lesson', ordinal: N }`) instead of baking English labels into every language column, and resolves commemorated lessons from the commemorated feast's own `[LectioN]` section; orphan-heading guard ensures a heading is only emitted when at least one downstream lesson/responsory actually resolves
- `HourDirective` post-transform pipeline with 12 directive cases: `omit-gloria-patri`, `omit-alleluia`, `add-alleluia`, `add-versicle-alleluia`, `preces-dominicales`, `preces-feriales`, `suffragium-of-the-saints`, `omit-suffragium`, `short-chapter-only`, `genuflection-at-oration`, `dirge-vespers`, `dirge-lauds`. The alleluia / Gloria Patri / `short-chapter-only` / `omit-suffragium` / `genuflection-at-oration` transforms operate on concrete text; `preces-*`, `suffragium-of-the-saints`, and `dirge-*` currently emit MVP banner rubrics rather than the full liturgical substitutions
- Lossless output model: `ComposedRun` discriminated union (`text` / `rubric` / `citation` / `unresolved-macro` / `unresolved-formula` / `unresolved-reference`) on every `Section.lines.texts[lang]`, so rubrics keep their typing and unexpanded artifacts are visible to clients instead of being flattened to strings
- Smoke integration test against the upstream corpus composing every Hour on a handful of 1960 dates without throwing, plus a focused Matins shape assertion; gates on `existsSync(UPSTREAM_ROOT)` like the engine's integration suites

What remains open for Phase 3:

- **Liturgically complete preces / suffragium / dirge directive implementations.** The current MVP emits a banner rubric; the full implementations need to splice in the real preces block from `Psalterium/Special/Preces.txt`, the suffragium from the corresponding common, and the Office-of-the-Dead skeletons for the dirge directives.
- **Perl/Ordo comparison harness for the composed text layer.** Phase 2 hit spec §3's validation bar via `compare:phase-2h-perl-fixtures`; Phase 3 still needs an equivalent end-to-end harness that compares `ComposedHour` outputs against the legacy Perl-rendered Hour and maintains a divergence ledger per policy (`packages/compositor/test/divergence/<policy>-2024.md`).
- **`selectorUnhandled` warning wiring.** The resolver sets the flag structurally for novel selector shapes, but callers currently only branch on `selectorMissing`; novel selectors fall through to full-section output without surfacing a warning.
- **DA / 1955 integration coverage.** The compositor integration suite exercises 1960 only; `divino-afflatu` and `reduced-1955` engine outputs should flow through the compositor under matching fixtures.
- **Upstream engine gap: Matins commemorations.** `rubrical-engine/src/hours/apply-rule-set.ts:attachCommemorationSlots` currently early-returns for any hour other than Lauds or Vespers, so Matins commemorations never reach `HourStructure.slots`. The compositor can't emit what the engine doesn't produce; lifting that guard (where rubrically correct for the given policy) is a prerequisite for fully-commemorated Matins output.

Workspace validation currently passes with `pnpm -r typecheck` and `pnpm -r test` (parser + rubrical-engine + compositor).

## License

[GPL-3.0](LICENSE), consistent with the upstream Divinum Officium project.
