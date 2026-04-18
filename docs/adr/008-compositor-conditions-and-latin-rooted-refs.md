# ADR-008: Public `conditionMatches` surface and Latin-rooted `TextReference` paths for the compositor

- **Status:** accepted
- **Date:** 2026-04-17
- **Deciders:** Phase 3 composition engine scaffold
- **Related:** `docs/phase-2-rubrical-engine-design.md` §3 (composition contract),
  §16.3 (plan-first Matins), ADR-007 (plan/structure split),
  `packages/rubrical-engine/src/internal/conditions.ts`,
  `packages/compositor/src/resolve/reference-resolver.ts`

## Context

Phase 3 (composition) consumes `DayOfficeSummary.hours[hour]` from Phase 2 and
turns its `SlotContent` / `HourDirective` shape into a language-aware document.
Two concrete questions surfaced while scaffolding `packages/compositor`:

1. **Conditional text flattening.** Corpus text carries
   `{type: 'conditional'}` nodes that gate on Latin subjects like
   `tempore paschali`, `rubrica innovata`, and `feria ii`. These need to be
   evaluated against the same date/season/version context the engine already
   built. The engine owns that logic in `internal/conditions.ts`
   (`conditionMatches(condition, context)`), but `internal/` is intentionally
   private; the published surface is `DayOfficeSummary`.

   The compositor must not reimplement season-token or rubric-tag matching —
   that would drift from the engine and quietly ship contradictory rules.
   Equally, it must not need to construct a full `RuleEvaluationContext`
   (feast file, commemorations, corpus pointer), because at flatten time it
   only needs the day-shape context.

2. **Language-parametric path swaps.** The engine always emits
   `TextReference.path` anchored at `horas/Latin/…` (or `missa/Latin/…`),
   regardless of what language the caller will render. The compositor has to
   walk the parser's fallback chain across languages (Latin → langfb →
   Latin root) for each reference. Concretely: is Phase 2 contractually
   Latin-rooted, or should the compositor accept whatever segment the engine
   happens to emit?

## Options Considered

### Option 1A — Re-implement condition evaluation inside the compositor

*A local copy of the season/rubric matchers in `packages/compositor`.*

- Pro: no engine surface changes.
- Con: two sources of truth; subject to silent divergence every time a new
  rubric tag lands (1960 newcalendar, Praedicatorum, upcoming policies).
- Con: the compositor would need to reconstruct `version.handle` rubric-tag
  derivation, which is a policy concern.

### Option 1B — Promote `RuleEvaluationContext` to public and build one in the compositor

*Expose the full rule-eval context; compositor stitches one together.*

- Pro: single evaluator entry-point.
- Con: `RuleEvaluationContext` carries live feast files and commemoration
  state that the compositor does not have without re-running resolver logic.
- Con: over-promotes internal types into the public API.

### Option 1C — Publish `conditionMatches` + `ConditionEvalContext` as a narrow public re-export

*Lift only the date/season/version predicates into the public barrel.*

- Pro: the narrow contract is exactly what text flattening needs.
- Pro: keeps `RuleEvaluationContext` and feast-file plumbing private.
- Con: one extra public symbol to version. Low surface area.

### Option 2A — Let Phase 2 emit per-language `TextReference.path`

*Each reference carries the language segment the client asked for.*

- Pro: no swap logic needed in the compositor.
- Con: references would duplicate across languages; fallback-chain logic has
  to live in both phases.
- Con: breaks the engine's current purity (no language config on engine
  config).

### Option 2B — Standardize on Latin-rooted `TextReference.path`

*Phase 2 always emits `horas/Latin/…` / `missa/Latin/…`. Phase 3 swaps the
language segment when resolving per requested language.*

- Pro: the engine stays language-agnostic; references are stable identifiers.
- Pro: the parser's existing `languageFallbackChain` composes cleanly — swap
  segment, then try Latin as final fallback.
- Con: the compositor owns a path-munging helper (`swapLanguageSegment`).

## Decision

Adopt **Option 1C** for condition evaluation and **Option 2B** for path
rooting.

For (1), `packages/rubrical-engine/src/condition-eval.ts` re-exports
`conditionMatches` and the `ConditionEvalContext` type. The compositor's
`flattenConditionals` accepts a `ConditionEvalContext` assembled from
`DayOfficeSummary` fields (`date`, `temporal.dayOfWeek`, `temporal.season`)
and the caller-supplied `ResolvedVersion`. The rule-evaluation context stays
private.

For (2), all `TextReference.path` values produced by Phase 2 are Latin-rooted.
The compositor's `swapLanguageSegment` handles `horas/Latin/` and
`missa/Latin/` (and a bare `Latin/` prefix used by older engine internals).
When the requested language's file is not present, `resolveReference` falls
back through `languageFallbackChain`, which terminates at Latin — matching the
parser's existing convention.

## Consequences

- Positive: the compositor can compose texts without a feast file, a
  commemoration list, or the engine's internal rule state — it needs only
  the summary, the corpus index, and the resolved version.
- Positive: references remain stable identifiers regardless of client
  language. Multi-language output is a loop, not a recomputation.
- Positive: adding a new rubric tag or season predicate only requires
  changing the engine's `internal/conditions.ts`; the compositor picks it up
  automatically.
- Negative: `conditionMatches` is now part of the engine's public contract
  and subject to semver. New condition subjects must preserve the existing
  `ConditionEvalContext` shape or extend it additively.
- Negative: engine authors must remember the Latin-rooted invariant when
  introducing new `TextReference`-producing code paths. A lint-level check
  (or a pure assertion in a dev build) may be worth adding later.
- Follow-up: once an API layer lands (Phase 4), `composeHour` will likely
  grow a higher-level input that wraps `(summary, version, options)` and
  provides language negotiation. The contract here does not block that.
- Revisit trigger: a future policy that needs feast-level gating inside
  text flattening (e.g., a conditional that asks "is this lesson a
  commemoration?"). At that point we re-open whether to promote
  `RuleEvaluationContext` or to push more work up to the structurer.

## Notes

- Public re-export: `packages/rubrical-engine/src/condition-eval.ts`
- Composition entry point: `packages/compositor/src/compose.ts`
- Reference resolution + path swap:
  `packages/compositor/src/resolve/reference-resolver.ts`
- Deferred-node expansion (uses the same swap rule for macro/formula lookups):
  `packages/compositor/src/resolve/expand-deferred-nodes.ts`
- Shared path utilities (published from the parser):
  `packages/parser/src/utils/path.ts` (`ensureTxtSuffix`,
  `normalizeRelativePath`), also surfaced from the parser barrel.
