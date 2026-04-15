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

**Phase 2 — Rubrical Engine (in progress).** The detailed design is in [`docs/phase-2-rubrical-engine-design.md`](docs/phase-2-rubrical-engine-design.md), and implementation has started in [`packages/rubrical-engine`](packages/rubrical-engine). The target pipeline is still the same — Version Resolver → Temporal/Sanctoral → Directorium Overlay → Candidate Assembly → Occurrence Resolver → Celebration Rule Eval → Transfer Computation → Concurrence → Commemoration Assembly → Hour Structuring — but Phase 2a is now underway rather than merely planned.

Implemented so far:

- `@officium-nova/rubrical-engine` package scaffold with build, typecheck, and Vitest setup
- Version-layer foundations: branded `VersionHandle`, `ResolvedVersion`, `VersionDescriptor`, and immutable `VersionRegistry`
- `data.txt` registry builder and version resolver
- Policy binding map covering all 15 Breviary rows in `Tabulae/data.txt`
- Clear rejection of missa-only identifiers, with Breviary-handle hints where upstream aliases make that possible
- ADRs for the two key architectural decisions so far:
  - [`docs/adr/001-version-handle-primary-binding.md`](docs/adr/001-version-handle-primary-binding.md)
  - [`docs/adr/002-two-scope-rule-evaluation.md`](docs/adr/002-two-scope-rule-evaluation.md)
- 53 rubrical-engine tests passing, including live integration against upstream `Tabulae/data.txt`

Still pending in Phase 2:

- Temporal/day-name/season logic
- Sanctoral lookup and candidate assembly
- Directorium overlay handling
- Occurrence, concurrence, transfer, and commemoration resolution
- Hour structuring and the final `resolveDayOfficeSummary()` / `OrdoEntry` pipeline

## License

[GPL-3.0](LICENSE), consistent with the upstream Divinum Officium project.
