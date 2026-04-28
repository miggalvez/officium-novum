# ADR-014: HTTP API version, language, and DTO boundary

- **Status:** accepted
- **Date:** 2026-04-28
- **Deciders:** Phase 4 API implementation
- **Related:** [Phase 4 API Design](../phase-4-API-design.md), [ADR-001](001-version-handle-primary-binding.md), [ADR-009](009-compositor-resolved-corpus-and-deferred-nodes.md), [`packages/api`](../../packages/api)

## Context

Phase 4 exposes the existing Parser -> Rubrical Engine -> Composition Engine
pipeline over HTTP. That boundary is not allowed to become a second rubrical
engine or compositor, but it must still make public contract choices that the
internal packages deliberately avoid:

- request parameters use public strings, not branded TypeScript types;
- users expect familiar language tags such as `la` and `en`, while the corpus
  and compositor use names such as `Latin` and `English`;
- `ResolvedVersion` carries a live policy object and is not safe to serialize;
- `ComposedHour` is format-agnostic and uses arbitrary internal language keys;
- the version registry contains supported Roman Breviary handles, deferred
  Breviary handles, and Mass/Missa-only identifiers.

ADR-001 already makes `VersionHandle` the primary engine binding. ADR-009
already requires API callers to feed the compositor a Phase-1-resolved corpus
instead of re-resolving raw `@` references at composition time. Phase 4 needs
to preserve those boundaries while publishing stable JSON.

## Options Considered

### Option A — expose raw internal types

Return `ResolvedVersion` and `ComposedHour` directly from route handlers.

- Pro: Fastest to implement.
- Pro: Minimal adapter code.
- Con: Leaks live policy objects, corpus language names, and internal warning
  details as the permanent public API.
- Con: Makes future compositor refactors breaking HTTP changes.

### Option B — public aliases as the real contract

Use `rubrics=1960` and language names directly throughout the route and engine
boundary.

- Pro: Familiar for users coming from legacy Divinum Officium options.
- Con: Loses the `VersionHandle` distinction between policy and calendar.
- Con: Cannot distinguish `"Rubrics 1960 - 1960"` from localized handles such
  as `"Rubrics 1960 - 2020 USA"`.
- Con: Reopens a problem ADR-001 already settled.

### Option C — adapter-backed DTOs

Normalize request values into current internal types, then project internal
results into public DTOs with stable language tags and serialization-safe
version descriptors.

- Pro: Keeps `VersionHandle` as the canonical binding.
- Pro: Keeps `ResolvedVersion` internal and exposes `VersionDescriptor`.
- Pro: Prevents `Latin` / `English` corpus names from becoming response keys.
- Pro: Lets Phase 4 own display profiles, cache keys, and response shape
  without mutating Phase 1-3 packages.
- Con: More adapter code and tests.

## Decision

The HTTP API uses adapter-backed DTOs: `version` is canonical, `rubrics` is a
compatibility alias, public language tags map to corpus language names at the
API boundary, and responses expose serialization-safe DTOs rather than raw
engine or compositor objects.

The initial public language map is:

```typescript
la -> Latin
en -> English
```

The initial version status model is:

```typescript
supported | deferred | missa-only
```

Known deferred Breviary versions return an unsupported-version error when a
servable endpoint is requested. Known Mass/Missa-only identifiers return a
missa-only-version error with a hint when `MISSA_ALIAS_HINTS` has an equivalent
Breviary handle.

Text orthography is also an explicit API adapter option:

```typescript
orthography=version | source
```

The source profile preserves the composed corpus spelling. The version profile
is the public display profile for later text-run adaptation.

## Consequences

- Positive: Phase 4 can publish stable JSON without freezing Phase 3's internal
  `ComposedHour` shape as the wire contract.
- Positive: clients discover canonical handles through `/api/v1/versions`
  instead of guessing legacy short names.
- Positive: language-name leakage is testable: public routes should use `la`
  and `en` in public response fields while keeping corpus names in metadata.
- Positive: Mass/Missa-only handles are not flattened into generic unknown
  version errors.
- Negative: the API package owns a non-trivial DTO/adaptation layer.
- Follow-up work: finish the contract-test and release-gate tranche described
  in the Phase 4 design.
- Revisit trigger: if Phase 4 adds more corpus languages or versioned display
  profiles, the language and orthography registries must become data-backed
  rather than hard-coded pairs.

## Notes

- Initial implementation: [`packages/api/src/services/version-registry.ts`](../../packages/api/src/services/version-registry.ts),
  [`packages/api/src/services/language-map.ts`](../../packages/api/src/services/language-map.ts),
  [`packages/api/src/services/orthography-profile.ts`](../../packages/api/src/services/orthography-profile.ts)
- Metadata routes: [`packages/api/src/routes/metadata.ts`](../../packages/api/src/routes/metadata.ts)
