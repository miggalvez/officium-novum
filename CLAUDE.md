# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Officium Novum modernizes the [Divinum Officium](https://github.com/DivinumOfficium/divinum-officium) project — a community-maintained application generating the traditional Roman Breviary and Missal texts. The upstream repo is a Git submodule at `upstream/`. The architecture decouples liturgical data, rubrical logic, and presentation into a layered pipeline: Parser → Rubrical Engine → Composition Engine → API → Clients.

**Phase 1 (Parser) and Phase 2 (Rubrical Engine) are complete.** All eight Phase 2 sub-phases (2a–2h) ship; `resolveDayOfficeSummary(date)` works end-to-end for the three headline policies — `divino-afflatu` (1911), `reduced-1955`, and `rubrics-1960`. Tridentine, Monastic, Cistercian, and Dominican policies are explicit `UnsupportedPolicyError` stubs per design §20.5.

**Phase 3 (Composition Engine) is in progress.** The core pipeline (reference resolution → deferred expansion → conditional flattening → directive transforms → section emission) ships and all unit tests pass. `composeHour()` runs end-to-end for every Hour under the three Roman policies. Remaining work follows the sub-phase plan (3a–3h) in `docs/phase-3-composition-engine-design.md` §19: representation parity, Matins Benedictio + Te Deum replacement, Matins commemorations (cross-package edit in rubrical-engine), no-throw sweep, snapshot goldens, and divergence adjudication against primary rubrical sources. Per ADR-011, every adjudicated ledger row carries a class + citation in `packages/compositor/test/divergence/adjudications.json`; no divergence is ever resolved by "matching the Perl" alone.

## Build and test

```bash
pnpm install
pnpm -r typecheck      # type-check all packages
pnpm -r test           # run all tests (vitest)
```

Single package:

```bash
cd packages/parser
pnpm typecheck
pnpm test
pnpm test -- --reporter=verbose             # see individual test names
pnpm test -- test/directive-parser.test.ts  # run a single test file
```

Workspace: pnpm monorepo (`pnpm-workspace.yaml` → `packages/*`). TypeScript strict mode, ESM, Node 22+.

Integration tests that need the upstream corpus (e.g., `corpus-loader.test.ts`, `spot-check-validation.test.ts`) auto-skip when `upstream/web/www` is absent.

## Key specs

- `docs/divinum-officium-modernization-spec.md` — authoritative design document, phased roadmap, rubrical engine interface, validation strategy
- `docs/file-format-specification.md` — the parser's input contract: section headers, directives, conditional system, rank format, calendar tables
- `docs/phase-2-rubrical-engine-design.md` — the engine's detailed design: pipeline stages, version/policy model, occurrence/concurrence/transfer algorithms, Matins planning, §18 sub-phase plan, §19 validation strategy, §22 success criteria
- `docs/phase-3-composition-engine-design.md` — the compositor's detailed design: pipeline stages, data model (`ComposedHour`/`Section`/`ComposedLine`/`ComposedRun`), preamble catalog, directive catalog, Matins composition, §15 validation strategy, §18 success criteria, §19 sub-phase plan (3a–3h)
- `docs/adr/` — Architecture Decision Records. Phase 2 covers 001–007; Phase 3 covers 008–011 (and 012+ as adjudication produces them). Any non-obvious architectural choice should either reference an existing ADR or add a new one.

## Parser architecture

The parser package (`packages/parser/`) reads ~34,000 legacy `.txt` files from a base directory at runtime — it does **not** depend on `upstream/` at build time.

### Pipeline

```
.txt files on disk
  → FsCorpusWalker (walks horas/, missa/, Tabulae/)
  → FsFileLoader (reads UTF-8, normalizes line endings)
  → FileCache (memoizes parsed + raw section forms)
  → splitSections → parseRawSections → ParsedFile (unresolved)
  → CrossReferenceResolver.resolveFile() → ParsedFile (resolved)
  → InMemoryTextIndex (queryable by path, section, content path suffix)
```

`loadCorpus(basePath)` orchestrates this entire pipeline, including reference resolution (enabled by default).

### Key modules

**Parsing** (`src/parser/`):
- `section-splitter.ts` — splits raw text into `[Header]`-delimited sections
- `directive-parser.ts` — dispatches lines by prefix: `@` (references), `;;` (psalm refs), `&` (macros), `$` (formulas), `!` (citations/rubrics), `~` (contractions), `#` (headings), verse markers, GABC notation. Entry point: `parseDirectiveLine(line) → TextContent`
- `condition-parser.ts` — recursive descent parser for the Latin conditional system. Operator precedence: `aut` (OR) loosest → `et` (AND) → `nisi` (NOT) tightest. **Match the Perl engine's behavior, not the prose documentation, when they diverge** (see file format spec section 4.2).
- `rank-parser.ts` — parses `;;`-delimited rank lines. Title field can be empty (very common). Interleaved condition lines `(sed rubrica ...)` attach to the following rank line.
- `rule-parser.ts` — classifies rule lines as action, assignment, or reference directives

**Resolution** (`src/resolver/`):
- `reference-resolver.ts` — resolves `@path:Section:selector s/pat/repl/flags` cross-references recursively. Handles language fallback, line selectors (single/range/inverse), chained regex substitutions, cycle detection, depth limiting. Preamble (`__preamble`) sections trigger recursive file merging with overlay semantics (file's own sections override preamble-sourced sections).
- `file-cache.ts` — memoizes both parsed and raw section forms; tracks known-missing paths to avoid repeated I/O

**Corpus** (`src/corpus/`):
- `corpus-walker.ts` — walks `horas/`, `missa/`, `Tabulae/` directories. Detects rite variants from directory suffixes (`SanctiM` → rite `M`, contentDir `Sancti`). Emits `CorpusFile` with `relativePath`, `language`, `domain`, `contentDir`, `rite?`.
- `corpus-loader.ts` — full pipeline: walk → parse → resolve → index. Creates resolvers keyed by `domain::language::rite`. Falls back to unresolved parse on resolution failure. Returns `{ index, fileCount, errors, warningCount }`.
- `language.ts` — language fallback chain: requested → dashed-parent (e.g., `Latin-Bea` → `Latin`) → langfb → langfb-parent → Latin

**Calendar** (`src/calendar/`):
- `kalendarium.ts` — parses Kalendaria date files (`*Month*` headers, `XXXXX` suppression, `~` alternates)
- `transfer.ts` — parses feast transfer entries and scripture transfers with `~R`/`~B`/`~A` operation codes
- `version-registry.ts` — parses `data.txt` CSV version definitions

**Types** (`src/types/`):
- `schema.ts` — `TextContent` discriminated union (13+ variants), `Feast`, `Rank`, `TextBlock`
- `directives.ts` — `CrossReference`, `RuleDirective` (action/assignment/reference), `LineSelector`, `Substitution`
- `conditions.ts` — `Condition`, `ConditionExpression` (match/not/and/or), 14 Latin subjects, `Stopword`, `ScopeDescriptor`, `Instruction`
- `sections.ts` — `RawSection`, `ParsedFile`, `ParsedSection`
- `calendar.ts` — `KalendariumEntry`, `TransferEntry` (transfer/dirge/hymn), `ScriptureTransferEntry`

### Shared utilities

`src/utils/path.ts` exports `normalizeRelativePath` and `ensureTxtSuffix` — the single source of truth for path normalization. All modules import from here; do not duplicate.

## Rubrical engine architecture

The rubrical-engine package (`packages/rubrical-engine/`) is a pure-domain library: given a date and a `VersionHandle`, it produces a typed `DayOfficeSummary`. It has no I/O; it consumes Phase 1's pre-built `CorpusIndex`, `KalendariumTable`, `YearTransferTable`, `ScriptureTransferTable`, and `VersionRegistry` as constructor input.

### Pipeline

```
(date, version) → resolveDayOfficeSummary
  → Version Resolver           (version/policy-map.ts)
  → Temporal + Sanctoral       (temporal/, sanctoral/)
  → Directorium Overlay        (directorium/)
  → Candidate Assembly         (candidates/)  — incl. title-driven vigil/octave annotation
  → Occurrence Resolution      (occurrence/)  — picks winner, classifies losers
  → Celebration Rule Eval      (rules/)       — consumes [Rule] sections
  → Transfer Computation       (transfer/)    — cached per (version, year)
  → Concurrence Resolution     (concurrence/) — today's Vespers vs tomorrow's first Vespers
  → Hour Structuring           (hours/)       — Matins + Lauds/Prime/Terce/Sext/None/Vespers/Compline
  → DayOfficeSummary
```

Each stage is a pure function. Contrast with the Perl engine, which uses ~40 `our` globals passed implicitly between `occurrence`/`concurrence`/`precedence`; in Phase 2 those become explicit typed structures flowing between stages.

### Key modules

**Policy** (`src/policy/`):
- `rubrics-1960.ts` — 1960 *Rubricarum Instructum* policy, shipped first (Phase 2c–2g)
- `divino-afflatu.ts` — 1911 *Rubricae Generales* policy
- `reduced-1955.ts` — 1955 *Cum Nostra* simplified policy
- `_shared/roman.ts` — shared helpers for the pre-1955 Roman policies (seasonal directive derivation, Compline source, scripture course, privileged-temporal comparison callback, Christmas-octave transfer suppression, Paschal/Pentecost Matins carve-outs). 1960 does **not** import from here — it uses its own policy file end-to-end.
- `_shared/unsupported-occurrence.ts` — `UnsupportedPolicyError`-throwing stubs for deferred non-Roman policies (Tridentine, Monastic, Cistercian, Dominican)

No `if policy.name === '...'` outside `policy/` and `version/policy-map.ts`. Policy differences are encoded via typed contract (`RubricalPolicy` in `types/policy.ts`), not via branching in resolvers.

**Occurrence** (`src/occurrence/`):
- `resolver.ts` — policy-agnostic winner/commemoration/omit/transfer decision walking the policy's precedence table
- `tables/precedence-1960.ts`, `tables/precedence-divino-afflatu.ts`, `tables/precedence-1955.ts` — per-policy precedence rows with citations to the governing document

**Concurrence** (`src/concurrence/`):
- `resolver.ts` — Vespers-boundary decision between today and tomorrow
- `day-preview.ts` — `DayConcurrencePreview` cached per `(version, date)` to break the cross-date recursion
- `vespers-class.ts` — derives `'totum' | 'capitulum' | 'nihil'` from feast content signals
- `tables/vespers-1960.ts`, `vespers-divino-afflatu.ts`, `vespers-1955.ts` — per-policy concurrence matrices

**Candidates** (`src/candidates/`):
- `assemble.ts` — assembles temporal + sanctoral + transferred-in + overlay-substitution candidates
- `metadata.ts` — reads Latin-ordinal patterns in feast titles (`in octava`, `quinta die infra octavam`, `vigilia`) and annotates candidates with `kind: 'vigil' | 'octave'` + `octaveDay: 1..8`. This replaces hardcoded octave-projection tables; octave metadata is derived from the Kalendaria text, not duplicated in engine code.

**Rules** (`src/rules/`):
- `evaluate.ts` — `buildCelebrationRuleSet` consumes `[Rule]` section directives, walks `vide`/`ex` inheritance, produces a typed `CelebrationRuleSet`
- `merge.ts` — `deriveHourRuleSet` produces per-hour `HourRuleSet` from celebration rules + Ordinarium skeleton
- `apply-conditionals.ts` — paragraph-scoped conditional evaluation for Phase 2g hour wiring

**Hours** (`src/hours/`):
- `skeleton.ts` — `OrdinariumSkeletonCache` (per-engine, per `(version.handle, hour)`) walking `#Heading` markers in `horas/Ordinarium/*.txt`
- `psalter.ts` — §16.2 psalter selection decision tree (Roman and Pian paths)
- `transforms.ts` — seasonal + rubric-driven `HourDirective` derivation
- `apply-rule-set.ts` — common skeleton-application pipeline (feast proper → commune fallback → psalter → Ordinarium default), honoring `hourRules.omit` and `overlay.hymnOverride`
- `lauds.ts`, `vespers.ts`, `minor-hours.ts`, `compline.ts` — per-Hour structurers
- `matins.ts`, `matins-plan.ts`, `matins-lessons.ts`, `matins-scripture.ts`, `matins-alternates.ts` — Matins is plan-first (see ADR-007): `buildMatinsPlan` produces immutable `MatinsPlan`, post-passes apply scripture-transfer + alternates, then `structureMatins` wraps it into `HourStructure`

**Types** (`src/types/`):
- `policy.ts` — `RubricalPolicy` contract, `OctaveRule`, precedence/concurrence row shapes
- `model.ts` — `Candidate`, `TemporalContext`, `DayOfficeSummary`, `SanctoralCandidate`
- `ordo.ts` — `Celebration`, `Commemoration`, `HourName`
- `concurrence.ts` — `ConcurrenceResult`, `VespersSideView`, `DayConcurrencePreview`, `VespersClass`
- `rule-set.ts` — `CelebrationRuleSet`, `HourRuleSet`, `MatinsRuleSpec`
- `hour-structure.ts` — `HourStructure`, `SlotName`, `SlotContent`, `HourDirective`
- `matins.ts` — `MatinsPlan`, `NocturnPlan`, `LessonSource`, `PericopeRef`, `ScriptureCourse`
- `directorium.ts` — `DirectoriumOverlay`, `RubricalWarning`

## Validation

The engine validates against a hierarchy of authorities per design §19.1. In descending order:

1. **Ordo Recitandi** (annual diocesan/community directives) — primary. For 1960, acquire a current FSSP/SSPX/ICKSP Ordo.
2. **Governing rubrical books** — *Rubricae Generales Breviarii* (1911), *Cum Nostra* (1955), *Codex Rubricarum* (1960). Authoritative for the rule itself.
3. **Perl `horas.pl`** — tertiary comparison target. Not an oracle; when Perl disagrees with an Ordo, the Ordo wins and Perl is filed as an upstream bug (§19.4).

### Perl comparison harness

Location: `packages/rubrical-engine/test/fixtures/`
- `officium-snapshot.pl` — runs `upstream/web/cgi-bin/horas/officium.pl` and captures `$main::winner`/`@commemoentries`/etc. as JSON
- `generate-phase-2h-perl-fixtures.mjs` — produces per-version Perl fixture files
- `compare-phase-2h-perl-fixtures.mjs` — diffs engine output against the Perl fixtures

Commands:
```bash
pnpm -C packages/rubrical-engine generate:phase-2h-perl-fixtures
pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures
```

Divergence reports: `packages/rubrical-engine/test/divergence/<policy>-2024.md`. Each row either cites an Ordo/rubric resolving the disagreement in the engine's favor (Perl bug), identifies an engine bug to fix, or documents a known representation difference. Zero Perl-divergence is not a goal and would be wrong (it would lock in Perl's bugs); §22.9's target is <10 divergences per policy per year.

### Test gating

Integration tests requiring the upstream corpus gate on `existsSync(UPSTREAM_ROOT)` and auto-skip otherwise. Perl-comparison tests additionally require the Perl fixtures to exist. The full-year no-throw sweep (2024 × 5 handles × 366 days = ~1,830 invocations) runs against the upstream corpus only.

## Conventions

- **Liturgical correctness is non-negotiable.** When in doubt, consult the spec's validation strategy and the published *Ordo*. One misplaced commemoration is a shipping bug that people will pray incorrectly from.
- The parser is side-effect-free and idempotent. No I/O in core parsing modules — I/O lives in `corpus/` and `resolver/`.
- The rubrical engine is side-effect-free and idempotent. No I/O at all; all external data arrives via constructor.
- Discriminated unions for all parsed content types (`TextContent`, `RuleDirective`, `ConditionExpression`, `TransferEntry`) and for engine outputs (`HourStructure.slots`, `ComplineSource`, `LessonSource`).
- Warnings are collected in arrays, never thrown. The resolver and loader both continue past missing files and broken references. The engine emits warnings as typed data (`RubricalWarning`) alongside its output.
- Tests use vitest with snapshot testing for complex parse results. Integration tests gate on `existsSync(UPSTREAM_ROOT)`.
- Every policy-specific rubrical decision cites the governing document inline (e.g., `citation: 'Codex Rubricarum (1960) §91'` on precedence rows).
- Policy implementations stay under 800 lines per design §22.10. Shared helpers go in `policy/_shared/`.
- When the engine diverges from Perl, follow design §19.4: consult the Ordo, cite the resolution in `test/divergence/<policy>-2024.md`, and either fix the engine or file the Perl bug upstream. Never resolve a divergence by "matching the Perl" alone.
