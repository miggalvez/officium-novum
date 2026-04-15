# ADR-001: `VersionHandle` as the Primary Engine Binding

- **Status:** accepted
- **Date:** 2026-04-14
- **Related:** [Phase 2 Rubrical Engine Design §4.3, §5, §11](../phase-2-rubrical-engine-design.md), [File Format Specification §7.1](../file-format-specification.md)

## Context

The modernization spec and early Phase 2 drafts framed the engine's primary
input as a `RubricSystem` enum — `DivinoAfflatu | Reduced1955 | Rubrics1960`.
That framing is intuitive: three rubrical codes, three branches of behaviour.

But the upstream corpus does not carry a `RubricSystem` field. It carries a
**version**: a row in `Tabulae/data.txt` with five columns — `version`,
`kalendar`, `transfer`, `stransfer`, `base`, `transferBase`. A version is a
distinct identity. Two versions may run the same rubrical code while
indexing into different sanctoral calendars:

- `"Rubrics 1960 - 1960"` — 1960 rubrics, 1960 Roman calendar
- `"Rubrics 1960 - 2020 USA"` — 1960 rubrics, USA localised calendar

And inheritance is at the version level, not the policy level. The Kalendaria
merge chain (`Rubrics 1960 - 1960` ← `Reduced - 1955` ← `Divino Afflatu - 1954`
...) is discovered by walking the `base` column in `data.txt`. A policy-centric
model loses this chain.

An enum also closes the registry: adding a diocesan particular calendar would
require an engine release. The upstream registry is already extending in
practice (`"Rubrics 1960 - 2020 USA"` is a recent addition), and we expect
more.

## Options Considered

### Option A — `RubricSystem` enum as primary input

Engine receives `{ rubricSystem: 'rubrics-1960', ... }`. Calendar selection
is a secondary inference.

- Pro: Simple. Matches how users describe their tradition.
- Pro: Type-safe — the enum can be exhaustively matched.
- Con: Loses the `version → kalendar → base` chain. Calendar localisation
  (USA, diocesan) requires out-of-band input.
- Con: Closed set. Adding a new localised calendar means editing the enum
  and shipping a release.
- Con: Doesn't match how upstream indexes its own tables.

### Option B — `VersionHandle` branded string as primary input

Engine receives `{ version: 'Rubrics 1960 - 1960' as VersionHandle, ... }`.
Policy and calendar chain are both derived from the handle.

- Pro: Mirrors upstream's own indexing.
- Pro: Open set — adding a new handle is a row in `data.txt` plus one row in
  the policy map. No engine code change.
- Pro: Preserves the inheritance chain used by kalendarium merging and
  transfer fallback.
- Con: Branded string is less type-safe than an enum; unknown handles are
  caught at resolution time, not compile time.
- Con: Callers must know the exact upstream string (`"Rubrics 1960 - 1960"`,
  whitespace and all). This can be mitigated with helper constants.

### Option C — Enum plus optional calendar override

Engine receives `{ rubricSystem: 'rubrics-1960', calendar?: 'USA', ... }`.

- Pro: Retains enum ergonomics for the common case.
- Con: Two-dimensional API surface. Invalid combinations (`rubricSystem:
  'divino-afflatu', calendar: 'USA'`) must be validated.
- Con: Still closes the enum; still requires engine changes for novel
  rubrical-code-plus-calendar pairings.
- Con: Diverges from upstream's one-dimensional registry.

## Decision

The engine accepts a branded `VersionHandle` as its primary input. Policy is
derived from the handle via a separate `VERSION_POLICY` map.

`VersionHandle` is a branded string type:

```typescript
export type VersionHandle = string & { readonly __brand: 'VersionHandle' };
```

This gives us compile-time distinction from `string` without forcing a closed
enum. Unknown handles produce a fatal error at engine construction time
(one call to `resolveVersion`), not silently at resolution time. Adding a
new version is two edits: a row in `data.txt` and a row in the policy map.

## Consequences

- **Positive.** The engine indexes the same way upstream does. The
  `kalendar / base / transferBase` chains come through cleanly. Localised
  calendars are cheap.
- **Positive.** Policy bindings live in data (`version/policy-map.ts`), not
  in switch statements. Multiple versions sharing a policy — common for the
  1960 family — point to the same policy instance.
- **Negative.** The type system doesn't catch unknown handles. We rely on
  fail-fast at `resolveVersion` instead. This is acceptable because engines
  are instantiated once per version at process start; the failure surface
  is tiny.
- **Negative.** Callers must carry handles as strings across process
  boundaries (API query params, test fixtures). The branded type erases at
  runtime, so string-to-handle lifting is an `asVersionHandle(x)` call.
- **Follow-up (resolved in review).** The first draft of `VERSION_POLICY`
  bound only 12 of the 15 Breviary handles in `data.txt`, leaving three —
  `Monastic Tridentinum 1617`, `Monastic Divino 1930`, and `Monastic
  Tridentinum Cisterciensis Altovadensis` — deliberately unbound with a
  Phase-2c-deferred TODO. Review correctly flagged this as a contract break:
  these rows are first-class Breviary versions, not Mass-only identifiers,
  and rejecting them at resolution time would silently narrow the engine's
  accepted input surface without that narrowing being documented in the
  type. The `PolicyName` union was expanded from 7 to 10 members
  (`monastic-tridentine`, `monastic-divino`, `cistercian-altovadense`
  added) so every Breviary handle binds to a distinct policy. The three
  new policies are declared but not yet implemented — their stub records
  carry only `name`, identical to the six other Phase 2a stubs. Phase 2c
  implements all ten.
- **Follow-up (error messages).** Missa-only rows in `data.txt` (below the
  `# - missa still uses old names` comment) are semantically distinct
  identities that upstream's Perl code indexes for Mass lookups. They
  continue to be rejected by the Breviary engine, but the error message
  now distinguishes (a) handle absent from registry, (b) handle present
  with a known Breviary-side alias (`"Rubrics 1960"` →
  `"Rubrics 1960 - 1960"`), (c) handle present with no alias hint. The
  `MISSA_ALIAS_HINTS` table in `version/policy-map.ts` carries the nine
  mappings that fit case (b).
- **Revisit trigger.** If we ever need to make `RubricalPolicy` itself a
  first-class input (dependency-injected by the caller, say for testing a
  proposed policy against production data), we may want to split the API
  into `(handle, policy)` pairs rather than deriving policy from handle.
  Design §4.3 already carves out `policyOverride` as a test-only escape
  hatch for this.

## Notes

- Implementation: [`packages/rubrical-engine/src/types/version.ts`](../../packages/rubrical-engine/src/types/version.ts),
  [`packages/rubrical-engine/src/version/resolver.ts`](../../packages/rubrical-engine/src/version/resolver.ts)
- Policy bindings: [`packages/rubrical-engine/src/version/policy-map.ts`](../../packages/rubrical-engine/src/version/policy-map.ts)
- Design §21 question 2 leaves the per-call vs. per-engine question open; this
  ADR does not prejudge it. We key the current engine on one resolved version
  at construction, which is compatible with either strategy.
