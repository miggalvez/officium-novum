# ADR-009: Require a Phase-1-resolved corpus in the compositor and keep Phase 3 to deferred-node expansion

- **Status:** accepted
- **Date:** 2026-04-17
- **Deciders:** Phase 3 composition engine follow-up
- **Related:** `docs/divinum-officium-modernization-spec.md` §3,
  `docs/file-format-specification.md` §3.1/§3.4/§3.5,
  ADR-008,
  `packages/parser/src/corpus/corpus-loader.ts`,
  `packages/parser/src/resolver/reference-resolver.ts`,
  `packages/compositor/src/compose.ts`,
  `packages/compositor/src/resolve/expand-deferred-nodes.ts`

## Context

Phase 1 already has a full `@`-reference resolver:

- section-local `@:Section` references
- path-only `@Path/File` references that inherit the enclosing section name
- line selectors and regex substitutions
- language fallback
- cycle detection and depth limits
- preamble (`__preamble`) whole-file includes

Phase 3 originally carried a helper that attempted to expand `reference` nodes
again inside the compositor. That blurred the package boundary in two ways:

1. It duplicated only a *subset* of the parser's semantics, so unresolved/raw
   corpora could appear to work while silently dropping selector, substitution,
   or current-file behaviors.
2. It made the Composition Engine partially responsible for Phase 1 parsing
   concerns instead of consuming the parser's output contract.

At the same time, Phase 1 intentionally leaves several *non-`@`* node kinds in
the parsed corpus because they are not filesystem cross-references:

- `psalmInclude`
- `macroRef`
- `formulaRef`

These still need Phase 3 handling to produce complete Office text.

## Decision

The compositor's happy-path input is a **Phase-1-resolved corpus**:

- callers should pass the default output of `loadCorpus()` with eager
  reference resolution enabled;
- integration tests for the compositor should exercise that contract;
- a bare `reference` node reaching Phase 3 is treated as an **abnormal but
  surfaced artifact**, not as a normal input to be re-resolved.

Phase 3 owns only **deferred-node expansion**:

- `psalmInclude` -> the referenced psalm section
- `macroRef` -> a named fragment from `Psalterium/Common/Prayers.txt` (with
  `Revtrans.txt` as an alias table fallback)
- `formulaRef` -> a named prayer/rubric formula from the same source

If a deferred node cannot be expanded, the compositor must **surface it
losslessly** in `ComposedRun[]` rather than dropping it.

## Consequences

- Positive: the Parser -> Rubrical Engine -> Compositor boundary stays clean.
  Phase 1 owns all `@` semantics; Phase 3 consumes already-resolved sections.
- Positive: the compositor no longer needs to re-implement selector,
  substitution, current-file, or preamble behavior.
- Positive: residual unresolved artifacts remain visible in the composed output,
  which is safer for liturgical correctness and debugging than silent omission.
- Negative: callers that manually construct a raw `TextIndex` can still feed it
  to the compositor; those cases are tolerated only as surfaced fallback, not as
  a supported composition mode.
- Follow-up: if a future API needs a stronger runtime guard, `composeHour()`
  can grow an explicit `CorpusResolutionMode` assertion or accept a branded
  resolved-corpus wrapper instead of a plain `TextIndex`.
