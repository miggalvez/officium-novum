# Officium Nova

Modernization of the Divinum Officium project — decoupling liturgical data, rubrical logic, and presentation into discrete, testable layers. The upstream Divinum Officium repo is a Git submodule at `upstream/`.

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
```

## Project structure

```
packages/parser/     @officium-nova/parser — reads legacy .txt files, emits typed objects
docs/                Specifications (modernization spec, file format spec)
upstream/            Divinum Officium git submodule (source texts, legacy Perl app)
```

Workspace: pnpm monorepo (`pnpm-workspace.yaml` points to `packages/*`).

## Key specs

- `docs/divinum-officium-modernization-spec.md` — authoritative design document, phased roadmap, rubrical engine interface, validation strategy
- `docs/file-format-specification.md` — the parser's input contract: section headers, directives, conditional system, rank format, calendar tables

## Parser package

TypeScript, strict mode, ESM. Node 22+.

The parser reads `.txt` files from a base directory passed at runtime — it does **not** depend on `upstream/` at build time.

Implemented: section splitter, directive parser, condition parser, rank parser, rule parser.
Stubbed (interface only): reference resolver, corpus walker, file loader, calendar parsers, text index.

### Condition system

The conditional system is the most complex part of the file format. The parser uses recursive descent with operator precedence: `aut` (OR) binds loosest, then `et` (AND), then `nisi` (NOT). Match the Perl engine's behavior, not the prose documentation, when they diverge (see file format spec section 4.2 on operator precedence).

### Rank field

Rank lines use `;;` as delimiter. The title field can be empty (very common in the corpus). Interleaved condition lines `(sed rubrica ...)` attach to the following rank line.

## Conventions

- Liturgical correctness is non-negotiable. When in doubt, consult the spec's validation strategy and the published Ordo.
- The parser is side-effect-free and idempotent. No I/O in the core parsing modules.
- Discriminated unions for parsed content types (`TextContent`, `RuleDirective`).
- Preserve source file paths and line numbers in parsed objects for traceability.
- Tests use vitest with snapshot testing for complex parse results.
