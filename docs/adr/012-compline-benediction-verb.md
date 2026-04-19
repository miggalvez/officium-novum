# ADR-012: Compline benediction verb disposition (`concédat` / `tríbuat`)

- **Status:** accepted
- **Date:** 2026-04-18
- **Deciders:** Phase 3 composition engine sign-off
- **Related:** ADR-011,
  `packages/compositor/test/divergence/adjudications.json`,
  `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:425-450`,
  `docs/upstream-issues.md`

## Context

The Compline opening benediction line

> *Noctem quiétam et finem perféctum concédat nobis Dóminus omnípotens.*

has a Dominican variant that replaces `concédat` with `tríbuat`. In the
legacy Divinum Officium corpus the substitution is expressed as a
conditional section in `horas/Latin/Psalterium/Common/Prayers.txt`:

```
[Benedictio Completorium_]
Benedictio. Noctem quiétam et finem perféctum concédat nobis Dóminus omnípotens.

[benedictio Completorium]
@:Jube domne
@:Benedictio Completorium_

[benedictio Completorium] (rubrica Ordo Praedicatorum)
@:Jube domne
@:Benedictio Completorium_:s/concédat/tríbuat/
```

Two sections share the same header `[benedictio Completorium]`. The
second one is gated on `(rubrica Ordo Praedicatorum)` — the Dominican
rite. Reference resolution against `benedictio Completorium` is supposed
to pick the appropriate branch by evaluating the section's attached
condition against the active version.

Under the three headline Roman policies (Divino Afflatu 1911, Reduced
1955, Rubrics 1960) the condition is **not** satisfied. The expected
rendered output is `concédat`, not `tríbuat`.

A pre-3h verification run (see `/tmp/check-compline.mjs`) against the
upstream 2024 fixtures produced the following:

| Policy | `concédat` emitted | `tríbuat` emitted |
|---|---|---|
| Rubrics 1960 - 1960 | yes | **yes (unexpected)** |
| Divino Afflatu - 1954 | yes | **yes (unexpected)** |
| Reduced - 1955 | yes | **yes (unexpected)** |

Both variants currently render for all Roman policies. The compositor is
**not** correctly gating the Dominican section.

## Options Considered

### Option A — Classify as `perl-bug` and move on

*The original §3f disposition: assume the compositor emits only the
Roman variant and file any Perl mismatch upstream.*

- Pro: Narrow scope.
- Con: Not true of the current engine; would misrepresent the state and
  burn a row of the ledger.

### Option B — Classify as `engine-bug` for 3h adjudication

*Document the double-emission as a real compositor bug. Do not fix in 3f.
Add a `perl-bug` or `engine-bug` row to `adjudications.json` during 3h
once we re-run the ledger and see whether the double-emission collapses
to a single-row divergence at the compare surface.*

- Pro: Honest about the current state.
- Pro: Keeps 3f scoped to observability and lets 3h own the bug-triage.
- Con: Carries the divergence forward.

### Option C — Fix the duplicate-header conditional evaluation in Phase 1

*Trace why Phase 1's resolver selects both sections when one is gated on
a non-matching rubric. Fix the parser or resolver.*

- Pro: Root-cause fix.
- Con: Out of Phase 3 scope. Phase 1 is frozen per CLAUDE.md §"Phase 1".
  The duplicate-header pattern is a broader architectural concern that
  affects every `(rubrica X)` conditional section in the corpus; a
  surgical fix here would paper over a systemic issue.

## Decision

**Option B.**

The compositor is emitting both `concédat` and `tríbuat` for Roman
policies because the reference resolver does not narrow
duplicate-header sections by their attached rubric condition. This is
filed as an `engine-bug` class row in `adjudications.json` during the
3h burn-down, with this ADR as its citation.

**No compositor fix lands in 3f.** The warnings infrastructure shipped
in 3f (`ComposeWarning` surfaced on `ComposedHour`) is the foundation
for future observability — the duplicate-header gap will show up there
once the resolver emits warnings for ambiguous section matches.

## Consequences

- **Positive:** Current state documented honestly. Adjudication protocol
  (ADR-011) has a citation target for the row.
- **Positive:** 3f stays scoped — observability ships without scope
  creep into Phase 1 resolver surgery.
- **Negative:** The Compline rows continue to show `tríbuat` on
  every Roman policy until the duplicate-header issue is fixed.
- **Follow-up:** During 3h adjudication, revisit the duplicate-header
  resolution in Phase 1's reference resolver. The fix likely lives in
  `packages/parser/src/resolver/reference-resolver.ts`'s section-
  selection path; every occurrence of `[Header] (rubrica X)` in the
  corpus is affected, not just Compline.
- **Revisit trigger:** If 3h turns up systemic
  duplicate-header-conditional breakage (e.g. Matins alternate
  lessons, psalmody substitutions under cisterciensis) the fix may
  need to land as a coordinated Phase 1 + Phase 3 edit with its own
  ADR rather than as a single-row adjudication.

## Notes

- The original `perl-bug` framing in the Phase 3 plan §3f has been
  superseded by the finding above. The plan document may still reference
  the earlier characterisation; this ADR is the binding record.
- `docs/upstream-issues.md` is introduced alongside this ADR as the
  catch-all for Perl-side issues surfaced during 3h. The Compline verb
  item lives on the *engine* side, so it does not appear there.
