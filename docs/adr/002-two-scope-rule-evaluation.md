# ADR-002: Two-Scope Rule Evaluation (`CelebrationRuleSet` + `HourRuleSet`)

- **Status:** accepted
- **Date:** 2026-04-14
- **Related:** [Phase 2 Rubrical Engine Design §12, §16](../phase-2-rubrical-engine-design.md), [File Format Specification §6](../file-format-specification.md)

## Context

A feast's `[Rule]` section is a compact DSL that encodes structural
decisions: how many Matins lessons, which psalm scheme applies, which slots
to suppress, whether the feast has first and second Vespers, where lessons
come from, doxology variants, papal-name binding, and so on. File-format
spec §6 catalogues the vocabulary.

Some directives are **celebration-scoped** — they describe the feast as a
whole. Examples: `Festum Domini`, `9 lectiones`, `ex C5`, papal-name
binding, `sub unica conclusione`, `Antiphonas horas`.

Other directives are **hour-scoped** — they describe what happens at a
specific hour, and their meaning depends on which hour is being composed.
Examples: `omit hymnus`, `omit preces`, `omit tedeum`, `ferial psalter`
(minor hours only), the capitulum variant at Compline.

The first Phase 2 draft collapsed both into a single `RuleSet` record
attached to the celebration. That worked syntactically but produced two
structural problems:

1. **Unclear ownership.** A field like `omit: Set<'tedeum' | 'hymnus'>`
   couldn't answer "omit from which hour?" without context. Callers pushed
   the resolution into ad-hoc logic at every consumption site.
2. **Merge ordering.** Preces suppression and ferial psalter apply at the
   *hour* level (only at minor hours, only at Vespers, etc.). A flat rule
   set forced the merge of celebration rules + overrides to happen at
   celebration time, which is too early — the hour context hasn't been
   established yet.

## Options Considered

### Option A — Single flat `RuleSet`

Everything lives on one record attached to the `Celebration`.

- Pro: Simpler data model.
- Pro: One place to look for any rule.
- Con: Hour-scoped fields (`omit`, `psalterScheme`, `capitulumVariant`)
  lack a natural owner and leak into every hour consumer.
- Con: Forces premature merging of hour-specific overrides at celebration
  time.

### Option B — One rule set per hour

Drop the celebration-level record entirely; attach an independent `RuleSet`
to each hour.

- Pro: Perfect fit for hour-scoped directives.
- Con: Celebration-scoped directives duplicate across all eight hours.
- Con: Inheritance becomes confusing — how does the celebration's `Festum
  Domini` flag propagate to every hour without copy-paste?
- Con: Papal-name binding, doxology variant, etc. have no natural home.

### Option C — Two-scope split

`CelebrationRuleSet` for directives that describe the feast; `HourRuleSet`
derived per-hour inside the Hour Structuring stage for directives that
describe the hour.

- Pro: Each directive lives in exactly one place.
- Pro: Hour-scoped overrides apply at the right time — when the engine
  knows which hour it is building.
- Pro: The Hour Structurer has a clean input: celebration skeleton +
  `CelebrationRuleSet` → derive `HourRuleSet` → produce `HourStructure`.
- Con: Two types where one was sufficient in the early draft.
- Con: Directives that feel borderline — antiphon scheme, doxology variant —
  need a judgement call on where they belong.

## Decision

Rule evaluation runs in two scopes. The `CelebrationRuleSet`, produced
once per celebration in the `Celebration Rule Eval` stage (§12), carries
all directives that describe the feast as a whole. The `HourRuleSet`,
derived per-hour inside Hour Structuring (§16), carries directives scoped
to a single hour.

The dividing line:

- **Celebration scope:** number of Matins lessons, `Festum Domini`, papal
  bindings, conclusion mode (`sub unica conclusione`), first/second
  Vespers presence, lesson source overrides, Te Deum forced/suppressed,
  `Antiphonas horas`, doxology variant, global commemoration suppression.
- **Hour scope:** per-hour slot omissions (`hymnus`, `preces`, `suffragium`,
  `invitatorium`, `tedeum`, `gloria-patri`), psalter scheme, psalm
  overrides, minor-hours `sine antiphona`, minor-hours ferial psalter,
  Compline capitulum variant.

Commemoration suppression lives on `CelebrationRuleSet.omitCommemoration:
boolean`, not on `OmittableSlot`, because it applies to the celebration as
a whole rather than selectively per hour.

`OmittableSlot` is a closed union of the six per-hour slot names above.

## Consequences

- **Positive.** Two typed records with disjoint fields. Every directive has
  exactly one owner; no field appears in both sets.
- **Positive.** Hour Structuring is a clean two-input function: the
  celebration skeleton (which already carries `CelebrationRuleSet`) plus
  the hour name. `HourRuleSet` is computed locally inside that stage.
- **Positive.** Ordinarium overrides (ferial psalter, minor-hours sine
  antiphona) apply at exactly the right moment — when the engine knows the
  hour it is building.
- **Negative.** Two types to understand instead of one. The §12/§16 split
  in the design document makes the boundary explicit, so this cost is
  documentation rather than confusion in code.
- **Negative.** Borderline directives forced a decision. Antiphon scheme
  and doxology variant were initially placed on `HourRuleSet`; design
  review moved them to `CelebrationRuleSet` because they apply uniformly
  across the feast's hours. Future directives will face the same call.
- **Follow-up.** Phase 2d (`rules/evaluate.ts`) accumulates unmapped
  directives into `CelebrationRuleSet.unmapped: readonly RuleDirective[]`.
  Weekly triage during implementation will promote each to a typed field
  on one of the two rule sets or formally classify it as "affects only
  Phase 3 rendering."
- **Revisit trigger.** If a directive turns out to need mid-hour context
  (i.e., the value depends on which slot within an hour is being built),
  we may need a third scope. Current inventory has no such case.

## Notes

- Design §12 specifies the `CelebrationRuleSet` shape; §16 specifies how
  `HourRuleSet` is derived.
- The pipeline diagram in §3.1 shows `Celebration Rule Eval` as a distinct
  stage between `Occurrence Resolver` and `Transfer Computation`; the
  `Hour Structurer` box explicitly states "derive `HourRuleSet` →
  `HourStructure`."
