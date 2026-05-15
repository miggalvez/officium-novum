# Phase 3 — Composition Engine Design

- **Status:** in progress — sub-phases 3a–3g shipped; 3h (adjudication burn-down) in flight
- **Version:** 1.1
- **Authors:** Officium Novum team
- **Related:**
  - [Modernization spec §3 — Phase 3](./divinum-officium-modernization-spec.md)
  - [File-format specification](./file-format-specification.md)
  - [Phase 2 rubrical engine design](./phase-2-rubrical-engine-design.md)
  - [Rubrical sources](./rubrical-sources.md)
  - ADRs 008, 009, 010, 011, 012
  - [Adjudication log](../packages/compositor/test/divergence/ADJUDICATION_LOG.md)
  - [Upstream Perl issues](./upstream-issues.md)

This document is the authoritative design reference for the Phase 3
Composition Engine (`@officium-novum/compositor`). It mirrors the Phase 2
design doc's shape so the two packages can be read and reviewed in parallel.
Phase 3 is smaller in scope than Phase 2 — the rubrical decisions are made
upstream — so this doc is proportionally shorter.

---

## 1. Purpose

Given a Phase-2 `DayOfficeSummary` and a Phase-1-resolved `TextIndex`, the
Composition Engine assembles the complete ordered text of any Hour in any
supported language. Output is a format-agnostic `ComposedHour` document
tree. **The Composition Engine never produces HTML, EPUB, PDF, or any other
presentation format.** Rendering is Phase 4+.

The engine is a pure function
`composeHour(input: ComposeInput): ComposedHour` with no I/O, no globals,
and no network access. All external data (corpus, calendar tables, transfer
tables, version registry) arrives via its inputs.

## 2. Scope

### 2.1 In scope

1. All eight canonical Hours: Matins, Lauds, Prime, Terce, Sext, None,
   Vespers, Compline.
2. The three headline Roman rubrical policies: Divino Afflatu (1911), Reduced
   (1955), Rubrics 1960.
3. Reference resolution across the Phase-1-resolved corpus, including
   language fallback per ADR-008 and the deferred-node expansion per ADR-009
   (`psalmInclude`, `macroRef`, `formulaRef`).
4. Conditional content flattening (e.g., Paschaltide Alleluias, Lenten
   omissions) via the Phase 2 `conditionMatches()` evaluator.
5. Directive post-transforms — all twelve `HourDirective` variants defined
   by Phase 2.
6. Multilingual composition: one or more languages per `composeHour` call,
   with parallel-column output aligned line by line.
7. Typed warnings surfaced on `ComposedHour` for unhandled selectors,
   missing languages, deferred-depth exhaustion, and other soft failures.

### 2.2 Out of scope

- Non-Roman policies. Tridentine (pre-1911), Monastic, Cistercian, and
  Dominican remain `UnsupportedPolicyError` stubs per Phase 2 §20.5.
- Votive offices (Office of the Dead, Office of Our Lady on Saturdays,
  Office of the Sacred Heart). Phase 4+.
- Missa (the daily Mass). Phase 4+.
- Martyrologium. Phase 4+.
- Chant notation generation. Phase 3 passes `toneHint` metadata through;
  Gregorian-tone generation is Phase 4+.
- HTML / EPUB / PDF / chant image rendering. Phase 4+.

See §19 below for the sub-phase breakdown (3a–3h) currently driving
implementation.

## 3. Architectural Position

```
        ┌────────────┐   ┌──────────────┐   ┌──────────────┐
  DATA  │  Parser    │   │  Rubrical    │   │  Compositor  │   API /
  ────▶ │  (Phase 1) │──▶│  Engine      │──▶│  (Phase 3)   │──▶ Render
        │            │   │  (Phase 2)   │   │              │   (Phase 4+)
        └────────────┘   └──────────────┘   └──────────────┘
          TextIndex         DayOfficeSummary    ComposedHour
```

The engine's only dependencies are `@officium-novum/parser` (for the
`TextIndex`, `TextContent` union, `TextReference` shape, and language
fallback chain helper) and `@officium-novum/rubrical-engine` (for the
`DayOfficeSummary`, `HourStructure`, `HourDirective`, `MatinsPlan`,
`ConditionEvalContext`, and `conditionMatches()`). It does not depend on
any I/O library at runtime.

Per ADR-009, `composeHour` expects a Phase-1-resolved corpus (the default
output of `loadCorpus()`). A raw `@`-reference reaching the compositor is
an abnormal input; Phase 3 surfaces it as an `unresolved-reference` run in
the output rather than attempting to re-resolve it.

## 4. Data Model

### 4.1 Input

```typescript
interface ComposeInput {
  readonly corpus: TextIndex;
  readonly summary: DayOfficeSummary;
  readonly version: ResolvedVersion;
  readonly hour: HourName;
  readonly options: ComposeOptions;
}

interface ComposeOptions {
  readonly languages: readonly string[];
  readonly langfb?: string;
  // Caller-supplied rubric intent, not derivable from DayOfficeSummary.
  // See ADR-010.
  readonly joinLaudsToMatins?: boolean;
}
```

### 4.2 Output

```typescript
interface ComposedHour {
  readonly date: string;             // ISO date
  readonly hour: HourName;
  readonly celebration: string;      // winning feast title
  readonly languages: readonly string[];
  readonly sections: readonly Section[];
  // Populated in sub-phase 3f per the completion plan.
  readonly warnings: readonly ComposeWarning[];
}

interface Section {
  readonly type: SectionType;
  readonly slot: string;
  readonly reference?: string;
  readonly lines: readonly ComposedLine[];
  readonly languages: readonly string[];
  readonly heading?: HeadingDescriptor;  // metadata-only; not in lines[]
}

interface ComposedLine {
  readonly marker?: string;  // "V.", "R.", "Ant.", "*", etc.
  readonly texts: Readonly<Record<string, readonly ComposedRun[]>>;
}

type ComposedRun =
  | { type: 'text'; value: string }
  | { type: 'rubric'; value: string }
  | { type: 'citation'; value: string }
  | { type: 'unresolved-macro'; name: string }
  | { type: 'unresolved-formula'; name: string }
  | { type: 'unresolved-reference'; ref: CrossReference };
```

`SectionType` enumerates the classifications the emit layer assigns per
slot (psalm, canticle, antiphon, hymn, versicle, responsory, oration,
rubric, heading, commemoration, preces, suffragium, te-deum,
lectio-brevis, benedictio, invitatory, conclusion, other). The list
grows as 3d adds `benedictio` and the Easter-Octave Vespers tranche adds
typed Lucan canticle sections.

`HeadingDescriptor` is currently metadata-only — it describes Nocturn and
Lesson boundaries in Matins output without materialising a textual line.
The compare harness renders a canonical heading form at normalise time
(sub-phase 3g), so heading fidelity is observable without forcing the
heading into `lines[]`.

## 5. Pipeline

For each slot on the resolved `HourStructure`, the generic pipeline is:

1. **Collect references.** Extract the `TextReference` list from the slot's
   `SlotContent`. Slots with `kind: 'empty'` short-circuit and emit nothing.
2. **Resolve references.** For each reference, look up the target section
   in the Phase-1-resolved corpus per language with the fallback chain
   (`requested → dashed-parent → langfb → langfb-parent → Latin`, per
   ADR-008).
3. **Expand deferred nodes.** Walk the resolved content and expand
   `psalmInclude`, `macroRef`, and `formulaRef` via ADR-009's expander.
   Depth is capped at 8.
4. **Flatten conditionals.** Recursively splice in `conditional` nodes
   whose `when` evaluates true under the Phase 2 `ConditionEvalContext`.
5. **Apply directives.** Run every `HourDirective` on the merged content
   for this slot, in the order the rubrical engine supplied them.
6. **Emit.** Convert the final `TextContent[]` into a `Section` with per-
   language `ComposedLine[]`, aligning languages by line index.

Matins has a parallel plan-driven path (§8) that composes the invitatory,
nocturns, and Te Deum before the generic dispatcher covers the remaining
slots (oration, conclusion, commemorations).

## 6. Preamble Catalog

Per ADR-010, the opening preamble is driven by the Ordinarium's `#Incipit`
sections, which wire `$Pater noster`, `$Ave Maria`, and `$Credo` macros.
Formula expansion resolves them through `Common/Prayers.txt`,
`Common/Rubricae.txt`, and `Revtrans`. No bespoke fallback list.

Per-Hour preamble composition:

| Hour     | Incipit slot source                               | Notes |
|----------|---------------------------------------------------|-------|
| Matins   | `Ordinarium/Matutinum.txt` `#Incipit`             | Incipit emitted first, then nocturns.|
| Lauds    | `Ordinarium/Laudes.txt` `#Incipit`                | `joinLaudsToMatins` gates the secreto variant; see ADR-010.|
| Prime    | `Ordinarium/Prima.txt` `#Incipit`                 | —|
| Terce    | `Ordinarium/Tertia.txt` `#Incipit`                | —|
| Sext     | `Ordinarium/Sexta.txt` `#Incipit`                 | —|
| None     | `Ordinarium/Nona.txt` `#Incipit`                  | —|
| Vespers  | `Ordinarium/Vespera.txt` `#Incipit`               | —|
| Compline | `Ordinarium/Completorium.txt` `#Incipit`          | Examen rubric emitted; guillemet `«Pater Noster»` preserved from corpus.|

`Aperi Dómine` is **not** emitted by default. See ADR-010 §Decision (4).

## 7. Directive Catalog

The text-shaping `HourDirective` variants are implemented in
`packages/compositor/src/directives/apply-directives.ts`. They run over the
slot's flattened `TextContent[]` before emission. Directives that carry
structural or posture metadata may intentionally avoid changing emitted text.

| Directive                     | Purpose                                             | Citation (primary) |
|-------------------------------|-----------------------------------------------------|--------------------|
| `omit-gloria-patri`           | Strip the Gloria Patri couplet                       | Rubricarum §260|
| `omit-alleluia`               | Remove Alleluia verses (Septuagesima/Lent)           | Rubricae §III|
| `add-alleluia`                | Append Alleluia (Paschaltide)                         | Rubricarum §144|
| `add-versicle-alleluia`       | Append to the versicle block                          | Rubricarum §144|
| `preces-dominicales`          | Insert Sunday preces when retained by the policy       | Rubricae §VIII|
| `preces-feriales`             | Insert ferial preces                                   | Rubricae §VIII|
| `suffragium-of-the-saints`    | Insert the Suffragium block                            | Rubricae §IX|
| `omit-suffragium`             | Suppress Suffragium regardless of rank                 | Rubricarum §110|
| `short-chapter-only`          | Truncate chapter at responsory marker                  | Rubricae §V|
| `genuflection-at-oration`     | Preserve Office kneeling posture metadata without adding spoken text | Rubricae §X|
| `dirge-lauds`                 | "Pro defunctis" banner at Lauds                         | Rubricae §XI|
| `dirge-vespers`               | "Pro defunctis" banner at Vespers                       | Rubricae §XI|

A thirteenth variant will not be added lightly. Any new directive requires
an ADR explaining why it cannot be represented by combining the existing
twelve.

## 8. Matins Composition

Matins is plan-driven. The Phase 2 `MatinsPlan`
(`packages/rubrical-engine/src/types/matins.ts`) carries the invitatory
source, hymn source, per-Nocturn plans (psalmody, antiphons, versicle,
lessons, responsories, benedictions), and the Te Deum decision.

`composeMatinsSections` walks the plan in liturgical order:

```
Invitatory → [per Nocturn: heading, antiphons/psalmody, versicle,
              per Lesson: Benedictio, Lectio, Responsorium] → Te Deum
```

`NocturnPlan.benedictions` (sub-phase 3d) feeds the Benedictio emission
before each Lectio. Each benediction is keyed by `lessonIndex` so lessons
without a matching benediction (as can happen for commemorated lessons)
emit without one.

`teDeum: 'say'` emits the canonical Te Deum. `teDeum: 'replace-with-
responsory'` emits the 9th-Nocturn responsory carrying `replacesTeDeum:
true` (populated by the Phase 2 planner for Lent and Septuagesima matins).
`teDeum: 'omit'` emits nothing.

After Matins-specific output, the generic dispatcher emits the remaining
slots (oration, commemorations, conclusion). `isMatinsOwnedSlot` at
`compose.ts:127` prevents double-emission of slots the Matins pass
already covered.

## 9. Reference Resolution & Deferred Nodes

Per ADR-009, Phase 3 consumes a Phase-1-resolved corpus. Reference
resolution in the compositor is limited to:

1. Language fallback (`packages/compositor/src/resolve/reference-resolver.ts`).
2. Selector narrowing — integer, psalm-list, weekday key, season key, and
   synthetic-section selectors. Unhandled selectors are logged as warnings
   (sub-phase 3f) and fall back to full-section content.
3. Deferred-node expansion for `psalmInclude`, `macroRef`, `formulaRef`.

The compositor does not re-resolve `@`-references. An `unresolved-reference`
run appearing in the output indicates a gap in Phase 1's resolver or a
corpus issue, not a Phase 3 responsibility.

## 10. Conditional Flattening

`evaluate-conditionals.ts` delegates to `conditionMatches` from the
rubrical engine. It handles every `ConditionSubject` variant the parser
produces (rubrica, tempore, feria, mense, die, missa, commune, etc.).
Non-matching branches are dropped; matching branches are spliced in-place
with their children recursively flattened.

Conditional evaluation runs after deferred-node expansion so that a macro
or formula that expands into further conditionals is correctly resolved.

## 11. Section Emission

`emit/sections.ts` materialises per-language `TextContent[]` into
`ComposedLine[]`. Languages are aligned by line index. If one language
has more lines than another (e.g., Latin emits two verses, English merges
into one), missing slots are left absent rather than padded — clients can
distinguish an empty line from a missing translation.

Markers surface via `ComposedLine.marker`. The compare harness strips the
`v.` / `r.` markers during normalisation because printed breviaries
typeset those inline; other markers (`Ant.`, `*`, `+`) are preserved.

## 12. Warnings and Observability

`ComposedHour.warnings` carries a flat array of `ComposeWarning` records:

```typescript
interface ComposeWarning {
  readonly severity: 'info' | 'warn' | 'error';
  readonly code: string;           // e.g. 'unhandled-selector'
  readonly reference?: TextReference;
  readonly message: string;
}
```

Sub-phase 3f adds this field and converts the reference resolver's silent
return-undefined paths to warning emissions. The no-throw sweep (sub-phase
3g) asserts zero warnings with `severity === 'error'`.

## 13. Multilingual Composition

`composeHour({ options: { languages: ['Latin', 'English'] } })` returns a
`ComposedHour` with both languages interleaved per line. The fallback
chain per ADR-008 handles language absence by chaining through parent and
regional variants before reaching Latin.

When a language is fully missing after chain exhaustion, the resulting
language bucket is dropped from the `Section.languages` list (and a
`ComposeWarning` is emitted per sub-phase 3f). Clients can detect this by
inspecting `section.languages`.

## 14. Interop with Phase 2

Phase 2 supplies structure; Phase 3 consumes it faithfully. The boundary
is typed and auditable:

- `DayOfficeSummary` — the rubrical outcome for a date.
- `HourStructure.slots` — the per-Hour slot plan.
- `HourStructure.directives` — the ordered post-transform directive list.
- `MatinsPlan` — the Matins-specific plan shape.
- `ConditionEvalContext` — the input used by `conditionMatches()`.

Cross-package schema changes happen in Phase 3 only when Phase 2 itself
carries a gap that blocks composition parity. The two live examples
(sub-phases 3d and 3e) are:

- `NocturnPlan.benedictions` — required field added to Phase 2's
  `MatinsPlan`; populated by a new `selectBenedictions` policy hook.
- Matins-commemoration unblock — the "Lauds/Vespers only" assumption in
  `occurrence/resolver.ts` and the `attachCommemorationSlots` guard in
  `hours/apply-rule-set.ts` lift to a `policy.commemoratesAtHour` hook.
- Lucan canticle slots — `#Canticum: Benedictus/Magnificat/Nunc dimittis`
  now map to paired antiphon + canticle slots so Phase 3 can emit the
  fixed Psalm231 / Psalm232 / Psalm233 bodies before the later-block
  oration boundary.

Any future cross-package edit requires a design-doc update and an ADR.

## 15. Validation Strategy

Validation follows the Phase 2 §19 hierarchy (authority order, Ordo >
rubrical books > Perl). Phase 3's specific surfaces are:

1. **Unit tests.** One per exported module. Current suite at 52 tests
   across reference-resolver, conditionals, directives, compose,
   compose-matins, bug-regressions, and integration/compose-upstream.
2. **Snapshot goldens (sub-phase 3g).** The 13 Appendix-A dates × 8 hours
   × 3 policies = 312 fixtures via vitest `toMatchFileSnapshot()`. Goldens
   are regenerated only alongside the commit that introduces an intended
   diff, with a CHANGELOG note.
3. **No-throw sweep (sub-phase 3g).** `composeHour` runs exception-free
   for 2024 × 3 policies × 366 days × 8 hours = 8,784 compositions. Gated
   with `describe.skipIf(!HAS_UPSTREAM)`.
4. **Live Perl divergence ledgers.** Generated per-policy at
   `packages/compositor/test/divergence/<policy>-2024.md`. Every row is
   classified per ADR-011 and carries a citation from the primary source
   hierarchy.
5. **Adjudication sidecar.** `adjudications.json` stores the class +
   citation per stable row key, merged into the generated ledger. Phase 2
   §22.9 success criterion is inherited: <10 `unadjudicated` rows per
   policy per year. Perl-bug and ordo-ambiguous classes have no upper
   bound; rendering-difference must be used sparingly.

## 16. Risks

- **Cross-package schema change in 3d.** Mitigated by making
  `NocturnPlan.benedictions` a required field so the type checker
  enumerates every consumer. No external consumers exist yet (Phase 4 not
  started), so the coordination surface is zero.
- **Hidden Phase 2 gaps.** Matins commemorations (sub-phase 3e) run
  through four Phase 2 sites, not one guard. Any further Phase-2-owned
  gaps surfacing during 3h adjudication require coordinated edits, not
  compositor-local patches.
- **Primary-source access for adjudication.** User has confirmed access
  to Rubricae Generales 1911, Cum Nostra 1955, Rubricarum Instructum
  1960, and a current Ordo Recitandi. If an ambiguous case requires a
  source outside this set (e.g., a 1914 *Breviarium Romanum* cross-check
  for ADR-012), procurement is a blocking follow-up.
- **Snapshot golden churn.** 312 fixtures move every time the compositor
  changes. Mitigated by the divergence ledgers being the primary
  correctness signal; goldens are tripwires for unintentional change.
- **Sweep performance.** 8,784 compositions per CI run is non-trivial.
  Budget ~2 min on a modern laptop. If it exceeds 5 min, gate behind
  `CI=1` and run nightly rather than per-PR.

## 17. Open Questions

1. **`Aperi Dómine`.** Does any in-scope policy or caller require the
   auto-emission of the `[Ante]` prayer? If so, reopen ADR-010 with a new
   `emitAperiDomine` option. Currently no such caller exists.
2. **Commemoration hour ordering.** Phase 2 supplies commemoration hours
   but leaves the within-Hour ordering to the compositor's generic
   dispatch. If 3h surfaces ordering inconsistencies across policies, a
   `commemorationOrder` hook may need to migrate into Phase 2.
3. **Language alignment beyond best-effort.** `emit/sections.ts` aligns
   by line index. A typed alignment pass (explicit pairing of Latin
   verse ↔ English translation) is a Phase 4+ concern per §2.2; if
   client feedback surfaces it sooner, reopen.
4. **Votive Office input surface.** Phase 2 carries the same open
   question (§21.3). When Phase 4 resolves it, Phase 3 inherits whatever
   shape Phase 4 chooses — no standalone Phase 3 decision.

## 18. Success Criteria

Phase 3 is "done" when all of the following hold:

1. `@officium-novum/compositor` exposes `composeHour(input): ComposedHour`
   with no `any`, no `@ts-ignore`, and every pipeline stage covered by at
   least one unit test.
2. The no-throw sweep (2024 × 3 policies × 366 days × 8 hours = 8,784
   compositions) runs exception-free on the 2024 upstream pin.
3. The 312 snapshot goldens (13 Appendix-A dates × 3 policies × 8 hours)
   are committed and pass idempotently.
4. Each policy's divergence ledger carries **fewer than 10 `unadjudicated`
   rows** after 3h burn-down. Every other row has a `class` and
   `citation` in `adjudications.json`.
5. `ADJUDICATION_LOG.md` captures every resolution chronologically with
   commit SHA.
6. `docs/phase-3-composition-engine-design.md` (this file) is reviewed.
   ADRs 010 and 011 are accepted; any ADR 013+ produced by 3h is
   accepted or deliberately deferred with justification.
7. `pnpm -r typecheck` and `pnpm -r test` green.
8. Every new compositor source file is under 800 lines (Phase 2 §22.10
   precedent extended to Phase 3), and explicitly grandfathered legacy
   files may not grow beyond their recorded baseline.

Meeting these criteria unblocks Phase 4 (API), which consumes
`ComposedHour` and serialises it.

## 19. Implementation Strategy

This section breaks Phase 3 into eight sub-phases. The table below
summarises where each one landed; detailed sub-sections follow.

| Sub-phase | Status | Summary |
|-----------|--------|---------|
| 3a | shipped | Design doc, ADRs 010/011, adjudication sidecar merged into the harness |
| 3b | shipped | Incipit slot composition verified; `joinLaudsToMatins` option + harness opt-in |
| 3c | shipped | `Ant.` marker, hymn stanza `_`, guillemet disposition — first-divergent lines deepened on every Hour |
| 3d | shipped | `NocturnPlan.benedictions` (required schema field); `selectBenedictions` policy hook; Te Deum replace-with-responsory |
| 3e | shipped | Four-site Matins-commemoration unblock in rubrical-engine; `commemoratesAtHour` + `defaultCommemorationHours` hooks |
| 3f | shipped | ADR-012 records the Compline verb as an engine-bug; `ComposeWarning` surface threaded through the compose pipeline |
| 3g | shipped | 8,784-composition no-throw sweep; `--date __full-year__` harness sentinel; canonical heading rendering for Perl parity |
| 3h | shipped | Adjudication burn-down complete: all three Roman policies at **0 unadjudicated**; engine-bug fixes #1–#3 landed (hymn doxology `*`, `Psalmus N [M]` heading, wrapped-psalmody inner-unit composition); ADRs 012 and 013 accepted; 312 Appendix-A snapshot goldens committed; `verify:phase-3-signoff` green |

Sub-phases 3a–3c landed before 3d–3e (the latter two required
coordinated Phase 2 edits). 3f and 3g interleaved cleanly; 3h closed
the loop with the adjudication burn-down and the Appendix-A goldens.

### 19.1 Sub-phase 3a — Design doc, ADR skeleton, adjudication sidecar

Laid the groundwork every subsequent sub-phase depends on:

- Published this design document ([phase-3-composition-engine-design.md](./phase-3-composition-engine-design.md)) and [ADR-010](./adr/010-phase-3-incipit-and-preamble-emission.md) + [ADR-011](./adr/011-phase-3-divergence-adjudication.md).
- Introduced the durable **adjudication sidecar** at
  `packages/compositor/test/divergence/adjudications.json`. The compare
  harness (`packages/compositor/test/fixtures/compare-phase-3-perl.mjs`)
  reads it, merges its `class` / `citation` into the generated ledgers,
  and never writes back — so classifications survive ledger
  regeneration.
- Stable row-key schema: `<policy>/<date>/<hour>/<hash>` where `hash`
  is the first 8 hex chars of `sha256(normalized-firstExpected \0
  normalized-firstActual)`. Defined in ADR-011 so future harness changes
  do not silently break the merge.
- Harness ledger now carries `Class` + `Citation` columns and an
  "Adjudication breakdown" section counting rows by class.

### 19.2 Sub-phase 3b — Incipit slot composition & `joinLaudsToMatins`

Investigation showed the incipit slot is already populated for every
Hour and dispatched by `composeHour`; the prayers themselves resolve
correctly. The real gap was a caller-intent flag for the Lauds-joined-
to-Matins rubric.

- Added `ComposeOptions.joinLaudsToMatins?: boolean` at
  `packages/compositor/src/types/composed-hour.ts`. Default `undefined`
  means the compositor emits the Ordinarium as-is; `true` suppresses
  the secreto Pater / Ave block at the head of the Lauds `#Incipit`.
- New helper `stripLaudsSecretoPrayers` at
  `packages/compositor/src/compose/incipit.ts` recursively walks
  conditionals and drops `formulaRef` nodes named `Pater noster`,
  `Ave Maria`, and `rubrica Secreto a Laudibus` (case-insensitive).
- Harness updated to pass `joinLaudsToMatins: false` for Lauds
  explicitly — matching the per-Hour `command=pray$hour` shape of the
  Perl snapshot helper and making the assumption reviewable.
- 11 new tests in `packages/compositor/test/compose-incipit.test.ts`
  covering unset / true / false semantics, case-insensitive matching,
  conditional recursion, and non-Lauds no-op behaviour.

### 19.3 Sub-phase 3c — Representation parity

Closed the dominant representation-level divergences revealed on the
Rubrics 1960 ledger:

- **`Ant.` marker on antiphon lines** — the source corpus carries
  antiphons as bare text (`Ant Laudes`) or as `psalmRef.antiphon`
  inline strings; Perl synthesises `Ant. ` at render time. New helper
  `markAntiphonFirstText` at
  `packages/compositor/src/emit/antiphon-marker.ts` wraps the first
  `text` node of resolved antiphon content as
  `verseMarker('Ant.', ...)`. Applied to every whole-antiphon slot
  (invitatory, canticle antiphons, commemoration antiphons) and to
  psalmody's antiphon refs specifically.
- **Hymn stanza separator `_`** — source hymn files contain literal
  `_` lines between stanzas which the parser converts to `separator`
  nodes; `packages/compositor/src/emit/sections.ts` now surfaces them
  as `_` lines for hymn slots only.
- **Compline guillemets** — confirmed in corpus at
  `upstream/.../Common/Rubricae.txt:129`. Classified as
  `rendering-difference`; no compositor fix.
- **Common-backed commemoration names** — commemoration antiphon,
  versicle, and oration refs may render from an inherited commune while
  still carrying `TextReference.nameSourcePath` for the commemorated
  proper. The compositor uses that owner for `Commemoratio ...` headings
  and `N.` / `N. et N.` substitution.
- 12 new tests in `packages/compositor/test/canonical-lines.test.ts`.
- Harness impact: every first-divergent-line on Rubrics 1960 Jan 1
  advanced into a later, different pattern. No regression on 52
  existing tests.

### 19.4 Sub-phase 3d — Matins Benedictio + Te Deum replacement

First cross-package schema change. Added the **Benedictio** flow that
precedes each Matins lesson and implemented the Te Deum
`'replace-with-responsory'` decision.

- **Schema**: `NocturnPlan.benedictions` added as a **required** field
  at `packages/rubrical-engine/src/types/matins.ts` (forces every
  consumer to populate). New `BenedictioEntry` interface. New
  `'benedictio'` member on `SlotName` and `'benedictio'` on the
  compositor's `SectionType`.
- **Policy hook**: `selectBenedictions(params): readonly
  BenedictioEntry[]` added to `RubricalPolicy` at
  `packages/rubrical-engine/src/types/policy.ts`. Shared
  `selectRomanBenedictions` helper in
  `packages/rubrical-engine/src/policy/_shared/roman.ts` feeds all
  three Roman policies: 9/12-lesson office → `[Nocturn N]:<offset>`,
  3-lesson Gospel-homily offices → `[Evangelica]:1` for the first
  lesson and then `[Nocturn 3]:<offset>`, ordinary temporal ferias →
  weekday rotation, other 3-lesson offices → `[Nocturn 3]:<offset>` in
  `horas/Latin/Psalterium/Benedictions.txt`. Mirrors Perl's
  `specmatins.pl:get_absolutio_et_benedictiones` simple path.
- **Matins composition**:
  `packages/compositor/src/compose/matins.ts::composeNocturn` now
  emits the Benedictio between the per-lesson heading and the Lectio.
  `composeMatinsSections` handles the three `teDeum.decision` values:
  `'say'` emits the Te Deum hymn; `'replace-with-responsory'` finds the
  responsory flagged with `replacesTeDeum: true` and emits it under
  the `'te-deum'` slot; `'omit'` emits nothing.
- Unsupported-policy stubs and test policy fixture updated.
- Tests: 3 new Matins composition tests (Benedictio emission,
  Te Deum replacement, `omit` path). Pre-existing mocks extended with
  empty `benedictions` arrays where needed.

### 19.5 Sub-phase 3e — Matins commemorations (Phase 2 coordination)

The "Lauds/Vespers only" assumption for commemorations lived across
four sites in rubrical-engine. Lifted them all.

- `packages/rubrical-engine/src/occurrence/resolver.ts` — removed the
  hardcoded `DEFAULT_COMMEMORATION_HOURS` constant; now calls
  `policy.defaultCommemorationHours()`.
- `packages/rubrical-engine/src/types/policy.ts` —
  `CommemorationLimitParams.hour` widened from `'lauds' | 'vespers'`
  to any `HourName`. Two new hooks:
  `defaultCommemorationHours(): readonly HourName[]` and
  `commemoratesAtHour(params): boolean`.
- `packages/rubrical-engine/src/hours/apply-rule-set.ts` —
  `attachCommemorationSlots` early-return replaced with
  `policy.commemoratesAtHour(...)`. New `commemorationHeaders()` helper
  returns Matins/Lauds/Vespers-specific antiphon and versicle section
  names (`Ant 1` / `Versum 1` for Matins, `Ant 2` / `Versum 2` for
  Lauds, `Ant 3` / `Versum 3` for Vespers).
- Per-policy implementations:
  - **Rubrics 1960** — `['lauds', 'vespers']`; preserves existing
    behaviour per Rubricarum Instructum §106–109.
  - **Divino Afflatu (1911)** — `['matins', 'lauds', 'vespers']`;
    opens the previously-blocked Matins commemoration path per
    Rubricae Generales §IX.
  - **Reduced 1955** — `['lauds', 'vespers']`; Cum Nostra reduced
    Matins commemorations to zero (`matinsLimit = 0` in the existing
    `limitCommemorationsByHour` helper).
- Tests: 4 new policy-level tests (2 on DA, 2 on 1960) plus one
  compositor-level integration test verifying the commemoration slots
  fall through the Matins generic dispatch correctly.

### 19.6 Sub-phase 3f — Compline verb + resolver observability

Two concerns bundled:

- **ADR-012** ([Compline benediction verb](./adr/012-compline-benediction-verb.md))
  records the finding that the compositor emits *both* `concédat`
  *and* `tríbuat` for every Roman policy because the Phase 1 resolver
  does not gate duplicate-header sections (`[benedictio Completorium]
  (rubrica Ordo Praedicatorum)`) by their attached rubric condition.
  Classified as `engine-bug`; root fix is in Phase 1 and affects every
  `(rubrica X)` conditional section in the corpus. Not fixed in 3f.
- **Observability refactor**:
  - New `ComposeWarning` interface on
    `packages/compositor/src/types/composed-hour.ts` (mirrors
    `RubricalWarning` without re-export).
  - `ComposedHour.warnings: readonly ComposeWarning[]` now required.
  - `ResolveOptions.onWarning` and `DeferredNodeContext.onWarning`
    sinks threaded through. Previously-silent failures now emit:
    - `resolve-missing-section` (warn) — fallback chain exhausted.
    - `resolve-unhandled-selector` (info) — selector present but no
      narrowing path.
    - `deferred-depth-exhausted` (warn) — expansion hit `maxDepth`.
  - `composeHour` aggregates per-slot warnings into the top-level
    `ComposedHour.warnings`; `composeMatinsSections` does the same.
- `docs/upstream-issues.md` created as the forward-tracking file for
  `perl-bug` classifications.
- Tests: 7 new tests in `packages/compositor/test/warnings.test.ts`
  covering every emission path and the aggregation happy path.

### 19.7 Sub-phase 3g — Validation harness (no-throw sweep + heading rendering)

Established the Phase-2-equivalent validation surface required by §18:

- **No-throw sweep** at
  `packages/compositor/test/integration/no-throw-sweep.test.ts` —
  composes every Hour for every date in 2024 under each of the three
  Roman policies = **8,784 compositions per run**. Asserts no
  exceptions and no `severity: 'error'` warnings; unresolved-run cleanup
  is enforced on the frozen Appendix-A golden surface. Gated with
  `describe.skipIf(!HAS_UPSTREAM)`; runs in ~14 seconds on the current
  checkout.
- **Harness `__full-year__` sentinel** — `compare-phase-3-perl.mjs`
  now accepts `--date __full-year__` and synthesises every 2024 date,
  enabling full-year adjudication sweeps via
  `pnpm -C packages/compositor compare:phase-3-perl:full`.
- **Canonical heading rendering** in the harness normaliser — Nocturn
  sections render as `Nocturnus I/II/III` and lesson sections as
  `Lectio N`, making the heading-order Matins divergence observable at
  the compare surface without requiring a data-model change.
- New package scripts: `test:no-throw`, `compare:phase-3-perl:full`.
- The 312 snapshot goldens (13 Appendix-A dates × 3 policies × 8 hours)
  were deliberately deferred at 3g because Appendix A in the
  modernization spec is descriptive (no fixed ISO dates) and the goldens
  would churn heavily during 3h adjudication. They landed in 3h once
  the ledgers stabilised at zero `unadjudicated` rows; see §19.8.

### 19.8 Sub-phase 3h — Divergence adjudication burn-down

Shipped. The burn-down landed the infrastructure, three engine-bug
fixes, ADR-012 and ADR-013, and the 312 Appendix-A snapshot goldens.
At sign-off all three Roman policy ledgers report **0 unadjudicated**;
`pnpm -C packages/compositor verify:phase-3-signoff` is green:

- **[ADJUDICATION_LOG.md](../packages/compositor/test/divergence/ADJUDICATION_LOG.md)** — chronological audit trail per ADR-011. Captures every
  pattern-level resolution with citation and commit context. Initial
  entries cover the 3h kickoff baseline, the hymn doxology `*` fix,
  the `Psalmus N [M]` heading fix, and the wrapped-psalmody
  inner-unit fix.
- **Engine-bug fix #1 — hymn doxology `*` prefix** (in
  `packages/compositor/src/emit/sections.ts::stripHymnDoxologyMarker`).
  The DO corpus prefixes the doxology stanza of metrical hymns with
  `* ` as an editorial convention; Perl strips it at render. We now
  do too. Citation:
  `upstream/web/www/horas/Latin/Psalterium/Special/Prima Special.txt:107`.
  Impacts ~732 rows across Prime/Terce/Sext/None × 61 dates × 3
  policies.
- **Engine-bug fix #2 — `Psalmus N [M]` heading emission** (in
  `packages/compositor/src/compose.ts::buildPsalmHeading`). Perl emits
  `Psalmus 92 [1]`, `Psalmus 118(1-16) [2]`, etc. before each psalm at
  every non-Matins Hour. The compositor now emits the matching
  heading. Three psalm-number extraction strategies (path match,
  selector range, verse-prefix scan on resolved content) handle both
  direct Psalmorum references and the `Psalmi major:Day0 Laudes1`
  wrapper style used under 1960.
- **Engine-bug fix #3 — wrapped-psalmody inner-unit composition** (in
  `packages/compositor/src/compose.ts`, with the same wrapper-aware
  handling mirrored in `packages/compositor/src/compose/matins.ts`).
  Explicit psalmody antiphon refs no longer expand an entire psalm, and
  wrapped `Psalmi major/minor:<Day> <Hour>N` sections now render as
  `Ant. -> Psalmus N [M] -> verses` instead of leaking the first psalm's
  verse content before the heading. Wrapper-shape coverage lives in
  `packages/compositor/test/canonical-lines.test.ts`.
- **Representative adjudications** landed in `adjudications.json`:
  the live sidecar carries 943 `perl-bug`, 280 `rendering-difference`,
  and 0 `engine-bug` rows — every prior engine bug was either fixed or
  reclassified.
- **Progress reporting** lives in
  `pnpm -C packages/compositor report:phase-3-progress`, which reads the
  three generated divergence ledgers and prints the current per-policy
  `unadjudicated` / adjudicated counts together with the matching-prefix
  metrics.
- **312 Appendix-A snapshot goldens** committed at
  `packages/compositor/test/__goldens__/<policy>/<date>/<hour>.golden.txt`
  and exercised by
  `packages/compositor/test/integration/appendix-a-snapshots.test.ts`.
  The serialization is line-oriented text so reviewers can read goldens
  as Office text rather than as opaque structured snapshots; vitest's
  `toMatchFileSnapshot` writes one file per cell. To regenerate
  intentionally:
  `pnpm -C packages/compositor test -u -- test/integration/appendix-a-snapshots.test.ts`.

**Exit state:** the <10-unadjudicated-rows-per-policy threshold is met
(0/0/0). Phase 3 §18 success criteria all hold; sign-off verification
is automated via `verify:phase-3-signoff`.

### 19.9 Finish strategy for 3h

This is the discipline that 3h followed to closure; it is preserved here
as the operating record. The endgame for Phase 3 was **not** "match
every 2024 ledger row by hand" and it was **not** "fix one civil year at
a time." The 2024 ledgers were the sign-off surface because they
provided a stable, source-backed comparison matrix. The implementation
strategy stayed architecture-first throughout:

- **Phase 2 owns year-specific structure.** Date-specific overlays,
  `Transfer/<year-key>.txt`, `Stransfer/<year-key>.txt`, and other
  Directorium effects stay in the rubrical-engine. If a mismatch is truly
  caused by a year map or office substitution, the fix belongs there.
- **Phase 3 owns faithful composition.** Once `DayOfficeSummary` is
  source-correct, the compositor must emit it without policy-name branching
  or date-specific patches.
- **Adjudication is completion, not deferral.** When the compositor agrees
  with the source and Perl does not, the right move is `perl-bug` or
  `rendering-difference`, not another engine change.

The remaining 3h burn-down therefore proceeds by **family**, not by date.
The ledger rows are discovery aids; they are not the unit of work.

#### 19.9.1 Family-first operating rules

Every remaining divergence is triaged under the same loop:

1. **Identify a reusable family.** Group by repeated first-divergence lines,
   repeated slot/hour shape, and shared code seam. Good families are things
   like "Matins invitatory suppression," "wrapped psalmody heading drift," or
   "pre-lesson guillemet rendering," not "2024-01-13 Matins."
2. **Lock the source seam before coding.** Add or tighten the smallest
   upstream-backed tests that prove whether the source is currently wrong in
   Phase 2 or only emitted wrongly in Phase 3.
3. **Fix only the owning layer.** If the resolved structure is wrong, patch
   Phase 2. If the structure is right but the emitted sequence is wrong,
   patch Phase 3. If both are right, adjudicate.
4. **Reclassify immediately.** After every family fix, rerun the targeted
   compare and the full compare, then convert any newly source-backed rows
   into adjudications in the same tranche.
5. **Do not leave mixed-status families behind.** A family is only "done"
   when it is no longer sitting in the ledgers as "maybe source, maybe
   compositor."

The anti-pattern to avoid is a date-led patch such as "if Jan 13 then emit
X." If the fix cannot be described as a reusable structural rule, it needs
another pass of source/ownership analysis before landing.

#### 19.9.2 Ordered finish lanes

The remainder of Phase 3 should run in four lanes, in this order:

1. **Shared Roman structural families (`reduced-1955`, `rubrics-1960`).**
   These still offer the highest leverage because one fix often collapses
   multiple dates in both Roman ledgers and verifies the core Phase 2/Phase 3
   seam.
2. **Roman adjudication sweeps.** Once a Roman family is source-backed and
   no longer ambiguous, classify it immediately with representative entries
   plus `adjudications:fanout` rather than carrying it as pseudo-code work.
3. **Divino Afflatu family burn-down.** DA should use the same family-first
   loop, but only after the shared Roman structural seams stop exposing new
   architecture gaps. Its lower matching-prefix metrics suggest more shallow
   families remain, so it should be approached as a separate lane rather than
   interleaved randomly with Roman work.
4. **Stabilization and sign-off.** When the ledgers are mostly adjudication
   work and row churn has slowed materially, commit the 312 Appendix-A
   snapshots, run `verify:phase-3-signoff` (which now enforces the
   per-policy <10 `unadjudicated` threshold as well as the source-file
   no-growth and adjudication hygiene checks), prune stale sidecar entries if needed, and
   drive each policy below the <10 `unadjudicated` threshold.

#### 19.9.3 Definition of done for a family

Each family burn-down should end with all of the following:

- a source-backed test proving the ownership seam;
- a narrow fix in the correct layer, or an explicit adjudication instead of a
  fix;
- targeted compare evidence showing the first divergence moved deeper or
  disappeared;
- a full-ledger regeneration;
- updates to `ADJUDICATION_LOG.md`, `adjudications.json`, and
  `docs/upstream-issues.md` when applicable.

#### 19.9.4 Definition of done for Phase 3 — final state

The four-step closure sequence ran as planned:

1. The remaining large shared structural families were eliminated by the
   engine-bug fixes #1–#3 in §19.8 plus the family-first burn-down on
   each Roman ledger.
2. Source-backed residual rows were converted into adjudications until
   each policy sits at 0 `unadjudicated`.
3. The output surface is stabilised by the 312 Appendix-A snapshot
   goldens (§19.8) wired into the standard test suite.
4. The §18 success criteria are met without any date-specific
   compositor behaviour. `pnpm -C packages/compositor verify:phase-3-signoff`
   is the automated gate.

---

## Appendix A — Legacy Perl Cross-Reference

| Perl (file:subroutine)         | Phase 3 equivalent                                                  |
|--------------------------------|----------------------------------------------------------------------|
| `horas.pl:horas`               | `packages/compositor/src/compose.ts::composeHour`                    |
| `horas.pl:getpsalmorder`       | `packages/rubrical-engine/src/hours/psalter.ts` (Phase 2)             |
| `horas.pl:get_matutinum`       | `packages/compositor/src/compose/matins.ts::composeMatinsSections`   |
| `horas.pl:get_pater` (and kin) | `packages/compositor/src/resolve/expand-deferred-nodes.ts`           |
| `horas.pl:get_blessings`       | `packages/rubrical-engine/src/hours/matins-plan.ts::selectBenedictions` (sub-phase 3d) |
| `specials.pl:setfont` + family | `packages/compositor/src/directives/apply-directives.ts`             |
| `regex.pl:setcommand` (subset) | `packages/compositor/src/flatten/evaluate-conditionals.ts`           |
| `specials.pl:translate`        | `packages/compositor/src/resolve/reference-resolver.ts` (language fallback) |

Where Perl uses mutation-heavy globals, Phase 3 returns a fresh
`ComposedHour` per call with no hidden state.

## Appendix B — Glossary Extensions

| Term | Definition |
|------|------------|
| `ComposedHour` | The top-level Phase 3 output. See §4.2. |
| `Section` | A slot-level group of rendered lines with a single `SectionType`. |
| `ComposedLine` | A single rendered line with optional marker and per-language run arrays. |
| `ComposedRun` | The minimum typed fragment of a rendered line (text, rubric, citation, or unresolved-* placeholder). |
| `SlotName` | Phase 2 slot identifier (e.g., `hymn`, `psalmody`, `antiphon-ad-benedictus`, `canticle-ad-magnificat`). |
| `HourDirective` | Phase 2 post-transform directive (e.g., `omit-alleluia`). See §7. |
| `Divergence ledger` | Auto-generated `.md` file listing per-row mismatches vs Perl. See ADR-011. |
| `Adjudications sidecar` | Hand-maintained `adjudications.json` storing per-row classifications. See ADR-011. |
| `Unadjudicated row` | A ledger row with no matching entry in the sidecar. Counted against Phase 3 §18.4. |
