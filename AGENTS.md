# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

Officium Novum modernizes the [Divinum Officium](https://github.com/DivinumOfficium/divinum-officium) project — a community-maintained application generating the traditional Roman Breviary and Missal texts. The upstream repo is a Git submodule at `upstream/`. The architecture decouples liturgical data, rubrical logic, and presentation into a layered pipeline: Parser → Rubrical Engine → Composition Engine → API → Clients.

**Phase 1 (Parser) is complete. Phase 2 (Rubrical Engine) is complete for the Roman scope (`divino-afflatu`, `reduced-1955`, `rubrics-1960`); the remaining non-Roman families stay deferred by design.**

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

Rubrical engine package:

```bash
cd packages/rubrical-engine
pnpm build
pnpm typecheck
pnpm test
pnpm compare:phase-2h-perl-fixtures         # DA / 1955 comparison harness
```

Workspace: pnpm monorepo (`pnpm-workspace.yaml` → `packages/*`). TypeScript strict mode, ESM, Node 22+.

Integration tests that need the upstream corpus auto-skip when `upstream/web/www` is absent. This applies to parser corpus tests and the rubrical-engine upstream fixture suites.

## Key specs

- `docs/divinum-officium-modernization-spec.md` — authoritative design document, phased roadmap, rubrical engine interface, validation strategy
- `docs/file-format-specification.md` — the parser's input contract: section headers, directives, conditional system, rank format, calendar tables
- `docs/rubrical-sources.md` — canonical external source index for the implemented and deferred ordo families, with the repo's current `VersionHandle` mapping
- `docs/phase-2-rubrical-engine-design.md` — authoritative Phase 2 design: pipeline stages, policy model, occurrence/concurrence/transfer logic, hour structuring, validation protocol

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

The rubrical engine package (`packages/rubrical-engine/`) is a pure decision layer. Its public entrypoint is `createRubricalEngine(config).resolveDayOfficeSummary(date)`.

### Pipeline

```
VersionHandle
  → version resolver + policy map
  → temporal context + sanctoral lookup
  → Directorium overlay
  → candidate assembly
  → occurrence
  → celebration rule evaluation
  → transfer computation
  → concurrence + Compline source
  → commemoration limiting/assembly
  → hour structuring
  → DayOfficeSummary
```

### Supported policy families

- `divino-afflatu` — used by the Roman 1911/Divino Afflatu handles
- `reduced-1955` — used by the Roman 1955 handle
- `rubrics-1960` — used by the Roman 1960 handles
- Tridentine / monastic / Cistercian / Dominican families remain explicit stubs by scope

### Key modules

**Version / policy**:
- `src/version/resolver.ts` — resolves `VersionHandle` into a version descriptor
- `src/version/policy-map.ts` — binds concrete handles to policy families; this is the truth for support mapping
- `src/policy/*.ts` — policy-owned rank normalization, precedence, concurrence, commemoration limits, Matins shape, psalter/hour directives

**Calendar assembly**:
- `src/temporal/` — Easter/date/season/day-name logic
- `src/sanctoral/` — Kalendarium lookup and rank normalization
- `src/directorium/` — transfer/scripture/office substitutions and hymn overrides
- `src/candidates/` — merged day candidates, vigils, octave metadata

**Decision stages**:
- `src/occurrence/` — celebration and commemoration resolution
- `src/rules/` — typed `[Rule]` evaluation into celebration/hour rule sets
- `src/transfer/` — computed transfer destinations plus overlay reconciliation
- `src/concurrence/` — Vespers boundary resolution and Compline source
- `src/hours/` — typed `HourStructure` output for Matins through Compline

## Conventions

- **Liturgical correctness is non-negotiable.** When in doubt, consult the spec's validation strategy and the published *Ordo*. One misplaced commemoration is a shipping bug that people will pray incorrectly from.
- For Phase 2 work, the authority order is: **Ordo Recitandi → governing rubrical books → legacy Divinum Officium Perl output**. Do not resolve a divergence by "matching Perl" alone.
- Keep the named Phase 2 scope boundary intact. The Roman 1911/1955/1960 families are implemented; the non-Roman families are intentionally still stubs and should not be silently expanded without an explicit scope change.
- The parser is side-effect-free and idempotent. No I/O in core parsing modules — I/O lives in `corpus/` and `resolver/`.
- The rubrical engine is also pure domain logic: no rendering, no filesystem I/O, no text fetching inside decision stages. It consumes pre-built corpus/calendar data and returns typed structures.
- Discriminated unions for all parsed content types (`TextContent`, `RuleDirective`, `ConditionExpression`, `TransferEntry`).
- Warnings are collected in arrays, never thrown. The resolver and loader both continue past missing files and broken references.
- Tests use vitest with snapshot testing for complex parse results. Integration tests gate on `existsSync(UPSTREAM_ROOT)`.
- After rubrical-engine changes, finish with `pnpm -r typecheck` and `pnpm -r test`. When touching Divino Afflatu / 1955 policy behavior or their fixtures, also run `pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures`.
