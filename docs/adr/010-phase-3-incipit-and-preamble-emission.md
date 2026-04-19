# ADR-010: Phase 3 incipit and preamble emission

- **Status:** proposed
- **Date:** 2026-04-18
- **Deciders:** Phase 3 composition engine sign-off
- **Related:** `docs/divinum-officium-modernization-spec.md` §3,
  `packages/compositor/src/compose.ts`,
  `packages/compositor/src/compose/matins.ts`,
  `packages/compositor/src/resolve/expand-deferred-nodes.ts`,
  `upstream/web/www/horas/Ordinarium/Matutinum.txt`,
  `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt`,
  `upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt`,
  ADR-011

## Context

The opening of every Hour carries a recognisable structural preamble — some
combination of `Aperi Dómine`, `Pater noster`, `Ave Maria`, `Credo`, and the
Lauds-separated-from-Matins secret-recitation rubric per *Rubricae Generales
Breviarii Romani* §I.III.3 and *Rubricarum Instructum* §269. The divergence
ledgers prior to sub-phase 3b showed the compositor emitting fewer lines than
the legacy Perl renderer at the very top of every Hour, which initially read
as "the preamble is missing."

Deeper investigation (sub-phase 3b, step 1) clarified the picture:

1. **The prayer texts themselves are already wired.** Every Ordinarium file
   under `upstream/web/www/horas/Ordinarium/<Hour>.txt` references the
   prayers via `$Pater noster` / `$Ave Maria` / `$Credo` macros inside its
   `#Incipit` section. Formula expansion at
   `packages/compositor/src/resolve/expand-deferred-nodes.ts:88,185` already
   resolves those macros through `Common/Prayers.txt`, `Common/Rubricae.txt`,
   and `Revtrans`. No additional heading-lookup or fallback-list logic is
   required to find the prayers themselves.

2. **`Aperi Dómine` is a separate concern.** It lives only as `[Ante]` in
   `Common/Prayers.txt:256` and `Common/Rubricae.txt:134`. It is not wired
   from any Ordinarium `#Incipit` block. Emitting it requires a composition
   policy decision, not an incipit-slot fix.

3. **The Lauds-joined-to-Matins rubric is caller intent, not calendar
   state.** `DayOfficeSummary.hours.matins` (`packages/rubrical-engine/src/
   types/model.ts:87`) is populated whenever Matins is *in scope for the
   day*. Its presence does not distinguish "user prays Matins + Lauds
   together" (in which case Pater/Ave at Lauds is said secretly once) from
   "user prays Lauds alone" (in which case the Lauds preamble is said aloud
   in full). The compositor cannot derive this from `DayOfficeSummary`.

Meanwhile, the compare harness's Perl helper at
`packages/compositor/test/fixtures/officium-content-snapshot.pl:30` snapshots
one Hour at a time via `command=pray$hour`. That call inherently produces
Perl's Lauds output in the *separated* form — so any Lauds parity comparison
is comparing against the separated rendering regardless of whether Matins is
in scope.

## Options Considered

### Option A — Derive `isJoinedToMatins` from `DayOfficeSummary`

*The compositor checks whether `summary.hours.matins` is present; if so,
assumes Lauds is joined and emits the secreto form.*

- Pro: No API surface change; "just works" for a full-day pray-through.
- Con: Semantically wrong. `summary.hours.matins` being present means
  Matins is in scope, not that the caller is praying it in this session.
  Equivalent to inferring the user's posture from the liturgical calendar.
- Con: Breaks the compare harness. Perl's per-Hour snapshot helper always
  produces the separated form, so auto-deriving "joined" would make every
  Lauds row perpetually divergent for reasons that have nothing to do with
  correctness.

### Option B — Require the caller to pass `joinLaudsToMatins`

*Add `joinLaudsToMatins?: boolean` to `ComposeOptions`. The rubric fires only
when the option is explicitly set. The compositor makes no inference.*

- Pro: Matches how the Divinum Officium Perl CGI surfaces the choice — via
  an explicit `command=pray$hour` vs. multi-Hour render.
- Pro: Forces the compare harness to state its assumption, which makes the
  assumption reviewable.
- Pro: Phase 4 (API) and frontend callers can make the decision per request.
- Con: Four characters of API surface. The comparator now has to remember to
  set it.

### Option C — Extend `HourStructure` / `DayOfficeSummary` with a rubric flag

*The rubrical engine decides joined vs. separated during Phase 2 and carries
the decision into the hour structure.*

- Pro: Compositor stays parameterless.
- Con: Still wrong — Phase 2 does not know caller intent. Would require
  Phase 2 to accept caller intent as input, which just moves the boundary
  without simplifying it.

### Option D — Emit `Aperi Dómine` at every Hour opening

*Because `[Ante]` exists in the corpus, extend the incipit pipeline to
always emit it ahead of the Pater/Ave/Credo block.*

- Pro: Matches some printed breviary practice.
- Con: The Ordinarium files deliberately do not wire `[Ante]` into their
  `#Incipit` blocks, which is a positive signal. Emitting it speculatively
  would add text not backed by the machine-readable corpus.
- Con: Different rubrical editions treat it differently; auto-emission
  would lock in one edition's practice.

## Decision

**Accept Option B for the joined/separated rubric. Do not accept Option D.**

1. Add `joinLaudsToMatins?: boolean` to `ComposeOptions` in
   `packages/compositor/src/types/composed-hour.ts`. Default `undefined`:
   the compositor emits no joined- or separated-specific preamble material.
   Callers that want one variant opt in explicitly.
2. The compare harness at
   `packages/compositor/test/fixtures/compare-phase-3-perl.mjs:149` passes
   `joinLaudsToMatins: false` for the Lauds invocation (mirroring Perl's
   per-Hour snapshot) and omits the option for every other Hour.
3. The Ordinarium `#Incipit` blocks remain the single source of incipit
   truth. Formula expansion already resolves the `$Pater noster` / `$Ave
   Maria` / `$Credo` macros inside them; no reference-resolver fallback-list
   change is required.
4. `Aperi Dómine` is **not** emitted by default. It stays out of scope for
   Phase 3 incipit composition. If any policy — or any future caller —
   needs it, it will be surfaced as its own option (tentatively
   `emitAperiDomine?: boolean` on `ComposeOptions`) backed by a follow-up
   ADR, not wedged into the incipit slot here.
5. If sub-phase 3b's investigation shows a non-Matins Hour whose
   `HourStructure.slots.incipit` is missing at the rubrical-engine layer,
   that is a Phase 2 wiring gap, not an incipit-composition gap. Fix it by
   teaching the per-Hour structurer under `packages/rubrical-engine/src/
   hours/` to populate the slot, following the existing pattern from
   `hours/matins.ts`.

## Consequences

- **Positive:** No hidden rubric inference. Composition behaviour is a
  deterministic function of the inputs the caller supplied.
- **Positive:** The compare harness's per-Hour Perl snapshot compares
  apples-to-apples (separated Lauds on both sides).
- **Positive:** Adding future opening-preamble variants (e.g.
  `emitAperiDomine`, per-community preferences) follows the same pattern:
  opt-in `ComposeOptions` field + ADR.
- **Negative:** Callers that want full-day pray-through semantics (secreto
  Pater/Ave at each subsequent Hour) must track state themselves and set
  `joinLaudsToMatins: true` on Lauds explicitly. Acceptable — that tracking
  belongs to the client, not the composition engine.
- **Follow-up:** Sub-phase 3b ships the `ComposeOptions` extension, threads
  it into the incipit composition context, and adds the harness opt-in.
  `packages/compositor/test/compose-incipit.test.ts` covers the joined /
  separated / unset / default-for-minor-Hour / Compline-with-examen cases.
- **Revisit trigger:** If a future policy (e.g. a restored Tridentine
  pre-1911 workflow) requires auto-emitted `Aperi Dómine` ahead of the
  Pater/Ave/Credo block, reopen this ADR and introduce the corresponding
  option.

## Notes

The ADR deliberately keeps the incipit pipeline minimal. Every addition to
it should pass through this document or a superseding ADR, because the
opening preamble is one of the most visible surfaces in the rendered Office
and has strong aesthetic pull toward over-specification.
