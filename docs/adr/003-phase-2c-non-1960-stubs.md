# ADR-003: Remaining Out-of-Scope Policy Hooks Throw `UnsupportedPolicyError`

- **Status:** accepted (narrowed by Phase 2h on 2026-04-17)
- **Date:** 2026-04-15
- **Related:** [Phase 2 Rubrical Engine Design §11, §18 (Phase 2c and 2h)](../phase-2-rubrical-engine-design.md)

## Context

Phase 2c added real occurrence resolution for the 1960 rubrics. That required a
strict `RubricalPolicy` contract (`precedenceRow`, `applySeasonPreemption`,
`compareCandidates`, `isPrivilegedFeria`, `octavesEnabled`, and the later
Phase 2d/2g hooks) so the resolver and hour structurers could stay
policy-agnostic.

At the time, only `rubrics-1960` was implemented. Phase 2h has since filled the
Roman pre-1955 families (`divino-afflatu`, `reduced-1955`). The remaining
unsupported families are the ones still explicitly out of scope for this
rollout: `tridentine-1570`, the monastic families, the Cistercian families, and
`dominican-1962`.

We still need clear runtime behavior for engines bound to those still-deferred
families.

## Options Considered

### Option 1 — Keep policy hooks required and throw at runtime for deferred families

Implement all required methods on every policy object now; deferred families
throw a typed `UnsupportedPolicyError` with policy + feature information.

- Pro: Keeps `RubricalPolicy` structurally complete and avoids optional-call
  branching in the resolver.
- Pro: Fails loudly and specifically when unsupported behavior is exercised.
- Pro: Preserves compile-time pressure to implement all hooks for Phase 2h.
- Con: Deferred-family engines construct successfully but fail at resolution time.

### Option 2 — Make policy hooks optional

Mark occurrence hooks optional and have resolver/engine guard each call.

- Pro: Deferred-family policies can omit unimplemented methods without throwing.
- Pro: Smaller short-term policy stubs.
- Con: Spreads `undefined` checks across resolver call-sites.
- Con: Weakens the policy contract and makes later omissions easier to miss.
- Con: Produces less precise runtime diagnostics unless each missing hook is
  independently checked.

## Decision

Use **Option 1**: keep the expanded `RubricalPolicy` interface required and use
`UnsupportedPolicyError`-throwing stubs only for policy families that remain
explicitly out of scope.

This preserves one strict policy contract while making the remaining scope
boundaries explicit. Engines for the deferred families remain constructible
(useful for registry and overlay coverage), but day resolution fails immediately
with a clear, typed message indicating which feature is still deferred.

## Consequences

- Positive: `resolveOccurrence` remains simple and does not branch on optional
  hooks.
- Positive: Completed Phase 2h work was obvious: replace the
  `divino-afflatu`/`reduced-1955` stubs with real policy behavior without
  loosening the interface.
- Positive: Test coverage can assert explicit failure mode for non-1960
  versions.
- Negative: Callers invoking day resolution on the still-deferred families get a
  runtime exception by design.
- Follow-up work: if Tridentine/monastic/Cistercian/Dominican families are
  brought into scope later, replace their stubs with real policy behavior
  rather than weakening the contract.
- Revisit trigger: if a future phase requires partial-resolution behavior for
  unsupported policies rather than fail-fast behavior.

## Notes

- Implementation helpers: `packages/rubrical-engine/src/policy/_shared/unsupported-occurrence.ts`
- Policy wiring: `packages/rubrical-engine/src/version/policy-map.ts`
