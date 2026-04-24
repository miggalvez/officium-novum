# Changelog

Phase-by-phase implementation log for Officium Novum. The README's [Status](README.md#status) section summarizes the current phase state; this file records stable shipped changes by phase and sub-phase rather than live compare metrics.

## Phase 3 — Composition Engine (in progress)

Sub-phases 3a–3g shipped; 3h (Ordo-backed divergence adjudication) remains in flight. The authoritative design is in [`docs/phase-3-composition-engine-design.md`](docs/phase-3-composition-engine-design.md), the tranche protocol is in [`docs/phase-3-session-loop.md`](docs/phase-3-session-loop.md), and the live adjudication surface is maintained in [`packages/compositor/test/divergence/ADJUDICATION_LOG.md`](packages/compositor/test/divergence/ADJUDICATION_LOG.md), [`packages/compositor/test/divergence/adjudications.json`](packages/compositor/test/divergence/adjudications.json), and [`docs/upstream-issues.md`](docs/upstream-issues.md).

The `@officium-novum/compositor` package turns a `DayOfficeSummary` + Phase-1-resolved `CorpusIndex` into a typed, format-agnostic `ComposedHour`. The ADR-008 / ADR-009 boundary remains intact in code: the compositor never re-runs the parser's general `@`-reference resolver, unresolved `reference` nodes surface explicitly as `unresolved-reference` runs, and source-backed disagreements with legacy Perl are closed by adjudication rather than by date-specific compatibility patches.

**Validation.** Per design §19.1, the authority order remains Ordo Recitandi → governing rubrical books (1911 / 1955 / 1960) → legacy Divinum Officium Perl output. The no-throw 2024 sweep, `pnpm -C packages/compositor compare:phase-3-perl`, the generated ledgers, `pnpm -C packages/compositor report:phase-3-progress`, `adjudications.json`, and `ADJUDICATION_LOG.md` are the live Phase 3 operational surface. Exact compare counts and matching-prefix metrics are intentionally kept there instead of in this changelog.

### 3h — Adjudication burn-down (in progress)

Newest tranche first:

- **2026-04-24.** Closed the Reduced 1955 major-hour full-antiphon incipit family as a source-backed `perl-bug` adjudication sweep. A new upstream regression locks the full Lauds opening antiphons across Septuagesima/Lent, Holy Week, Easter week, psalter-major weekdays, and Advent; `adjudications.json` now carries the representative rows plus full-ledger fanout for exact matching major-hour signatures. The Reduced 1955 unadjudicated backlog drops from `282` to `252`, with the same sweep catching three Rubrics 1960 rows from already-adjudicated signatures. The next live frontier is Reduced 1955 Mar `19` Lauds (`Psalmus 92 [1]` vs `Psalmus 50 [1]`) and Rubrics 1960 Ash Wednesday Lauds (`Rom 13:12-13` vs `Ant. Cum jejunátis...`).
- **2026-04-23.** Closed the 1960 Ash Wednesday Lauds Old Testament canticle-heading seam in Phase 3. Psalmorum entries whose source title declares a canticle now emit Perl-compatible headings such as `Canticum Annæ [4]`, preserve the source citation line (`3 Reg 2:1-16`), and suppress the raw parenthesized title line instead of mislabeling the unit as `Psalmus 223 [4]`. The targeted Ash Wednesday Lauds compare now advances to the later chapter/antiphon boundary (`Rom 13:12-13` vs `Ant. Cum jejunátis...`), and the full ledger refresh improves the average matching prefix to `44.4` for `Reduced - 1955` and `46.6` for `Rubrics 1960 - 1960`.
- **2026-04-23.** Removed the Phase 3 compositor file-size sign-off blocker with behavior-preserving helper extractions. `compose.ts`, `compose/matins.ts`, and `resolve/reference-resolver.ts` are now under the 800-line cap enforced by `verify:phase-3-signoff`, with Prime/Martyrology, Lucan canticles, major-hour hymn wrapping, psalmody shaping, Matins psalmody range handling, invitatory resolution, keyed minor-hour psalmody, and language-path helpers split into focused modules. The sign-off verifier now fails only on the remaining unadjudicated policy thresholds.
- **2026-04-23.** Closed the shared Roman Ash Wednesday Matins Psalm `44` split family in Phase 3. The Matins psalm-range slicer now accepts half-verse bounds like `2a-10b` / `11-18b`, so the compositor inserts the Gloria + reopening-antiphon boundary between the two Psalm `44` segments instead of running straight through verse `18`. With that structural seam gone, the remaining Ash Wednesday Matins reopening-antiphon comma difference is now adjudicated as a `perl-bug` from `Psalmi matutinum:Day3` rather than patched into the compositor. The next live frontier now bifurcates: `Reduced - 1955` first surfaces on the Jan `28` Lauds penitential-antiphon family, while `Rubrics 1960 - 1960` first surfaces on the Ash Wednesday Lauds / ferial-minor-hour family.
- **2026-04-23.** Closed the shared Roman Dec `27` Christmas-octave Vespers chapter/hymn boundary family across the owning layers. Phase 2 now lets second Vespers fall back to the office's own `Capitulum Laudes` when no `Capitulum Vespera 3` exists, so St John keeps the proper `Sir 15:1-2` chapter instead of inheriting Christmas's `Heb 1:1-2`. Phase 3 now restores the major-hour hymn wrapper inside the hymn block (`_`, `Hymnus`, pre-1960 doxology label + replacement stanza when the source still carries a replaceable `*`, and the closing `_` before the versicle), which moves both Roman policies past the old `Sir 15:1-2` / `Exsúltet orbis gáudiis:` frontier. A full no-write-docs compare dropped Roman divergent-hour totals to `460/488` for `Reduced - 1955` and `457/488` for `Rubrics 1960 - 1960`. The next shared Roman family is the later major-hour separator before the conclusion block on the same Dec `27` Vespers row (`_` vs `V. Dómine, exáudi oratiónem meam.`).
- **2026-04-22.** Closed the shared Roman Christmas-octave Vespers fifth-psalm precedence seam in Phase 2. Once a major-hour office section yields explicit psalm rows, those source-backed psalm numbers now own the slot even if the psalter fallback had already supplied a concrete fifth psalm. This keeps St John's inherited second-Vespers fifth psalm on `Psalmus 131 [5]` instead of falling back to `Psalmus 116 [5]`. The next shared Roman family is the Dec `27` Christmas-octave Vespers chapter/hymn boundary seam, where Perl expects `Sir 15:1-2` and the compositor currently advances straight to `Exsúltet orbis gáudiis`.
- **2026-04-22.** Closed the shared Roman Christmas-octave Vespers fourth-psalm routing seam in Phase 2. Major-hour psalmody decoration now harvests source-backed psalm numbers from plain `Ant Laudes` / `Ant Vespera` / `Ant Vespera 3` sections, including simple same-header `@Sancti/12-25` reference chains, while deliberately ignoring transformed references that strip the `;;psalm` payload. This fixes the Dec `25`-`27` fourth-slot routing lane and legitimately widens Jan `1/7` Roman Vespers onto deeper source-backed later-block seams. The next shared Roman family should be the Christmas-octave Vespers fifth-slot/later-block split, starting with Dec `27` second-Vespers fifth-psalm precedence (`Psalmus 131 [5]` vs `Psalmus 116 [5]`), with the adjacent Dec `26` `no Psalm5` and Dec `25` chapter/hymn seams beneath it.
- **2026-04-22.** Closed the shared Roman Easter-Octave Prime post-Martyrologium `Pater Noster` guillemet fanout as an adjudication sweep, not a code fix. The compositor already preserved the source-backed guillemets from `Psalterium/Common/Rubricae.txt`; this tranche tightened the Prime upstream test to the late-octave surface and propagated the existing `rendering-difference` classification onto the newly exposed Apr `3` through Apr `5` row keys in both Roman policies. The next repeated shared Roman family is the Christmas-octave Vespers fourth-psalm routing seam on Dec `25` through Dec `27` (`Psalmus 129 [4]` vs `Psalmus 112 [4]`).
- **2026-04-22.** Closed the shared Roman Easter-Octave Lauds Psalm 99 half-verse lane as an adjudication fanout, not a code fix. The compositor already matched the corpus-backed `‡ ... *` structure from `Psalm99.txt`; this tranche locked the newly exposed April Lauds seam with a focused upstream test and propagated the existing `perl-bug` classification onto the Easter-Octave row keys. The next repeated shared Roman family is the Easter-Octave Prime post-Martyrologium `Pater Noster` guillemet fanout on `2024-04-03` through `2024-04-05`.
- **2026-04-22.** Closed the shared Roman Easter-Octave Vespers conclusion seam by teaching Phase 3 to reconstruct the 1955/1960 ordinary post-oratio block from `Psalterium/Common/Prayers` (`Dómine, exáudi`, `Benedicámus Dómino`, `Fidélium ánimæ`) when the inherited Ordinarium `Conclusio` ref resolves empty under those rubrics. The next repeated shared Roman family is the Easter-Octave Lauds Psalm 99 half-verse adjudication/fanout sweep now exposed across the April octave.
- **2026-04-22.** Closed the shared Roman Easter-Octave Vespers oration-prelude seam by teaching Phase 3 to wrap Lauds/Vespers collects with the source-backed `Dómine, exáudi ... / Orémus.` prelude before the office collect. The next repeated unadjudicated family is the shared Roman Easter-Octave Vespers conclusion seam, where Perl still continues with the post-oratio `Dómine, exáudi ... / Benedicámus Dómino ... / Fidélium ánimæ ...` block and the compositor currently stops at `R. Amen.`.
- **2026-04-22.** Closed the shared Roman Easter-Octave Vespers Magnificat/oration boundary seam by adding typed Lucan canticle slots to the Phase 2/Phase 3 boundary. `#Canticum: Benedictus/Magnificat/Nunc dimittis` now maps to paired antiphon + canticle slots, and Phase 3 materializes the Lucan canticle body plus repeated closing antiphon before the later-block collect. The next repeated unadjudicated family is the shared Roman Easter-Octave Vespers `Dómine, exáudi oratiónem meam` oration-prelude seam.
- **2026-04-22.** Closed the shared Roman Easter-Octave major-hour paschal antiphon routing seam by keeping `Minores sine Antiphona` scoped to Prime/Terce/Sext/None instead of stripping Lauds/Vespers proper antiphon refs inherited from `Pasc0-0`. The next repeated unadjudicated family is the shared Roman Easter-Octave Vespers Magnificat/oration boundary seam; Lauds now falls into the already-classified Psalm 99 half-verse Perl-bug lane.
- **2026-04-21.** Closed the shared Roman Prime post-Martyrologium secret `Pater Noster` guillemet seam as a rendering-difference adjudication sweep, backed by a focused Easter-Octave Prime upstream test. The next repeated family is the shared Roman Easter-Octave major-hour paschal antiphon routing seam, first surfacing at Vespers and immediately adjacent at Lauds.
- **2026-04-21.** Closed the shared Roman Easter-Octave Prime `De Officio Capituli` seam by teaching the parser/rubrical-engine/compositor heading path to split conditional Ordinarium headings into real synthetic sections and typed slots. The next repeated family is the shared Roman Prime post-Martyrologium secret `Pater Noster` guillemet seam.
- **2026-04-21.** Closed the shared Roman Easter-Octave opening-antiphon, `Capitulum Versum 2`, one-alone wrapper, Prime ordinary-oration, and Prime Martyrologium handoff/lunar-heading seams. The next repeated family is the Prime Martyrologium body-formatting seam (`_` / `v.` / `r.` / `Mobile.txt`).
- **2026-04-21.** Closed the shared Roman Easter-Octave Prime Martyrologium body-formatting seam (`_` plus the source-backed `v.` / `r.` responsorial stream). The next repeated family is the shared Prime post-Martyrologium `V. Deus in adjutórium meum inténde.` seam.
- **2026-04-20.** Closed the Roman temporal-Sunday minor-antiphon seam, the festal/Quad Sunday Prime psalm-table lanes, Triduum Compline routing, Passiontide Matins invitatory materialization, Triduum `Gloria omittitur`, and `Pater totum secreto`; also ran the first full-ledger fanout sweep and the Roman half-verse adjudication batch.
- **2026-04-19.** Burned down the January Roman frontier: second-Vespers antiphon ownership, January minor-hour and Vespers later-block seams, Matins inherited-omit adjudications, and the first large Divino Afflatu / Roman `perl-bug` and `rendering-difference` batches.
- **2026-04-18.** Opened 3h with the adjudication log + sidecar workflow and the first three engine-bug fixes: hymn doxology `*`, `Psalmus N [M]` headings, and wrapped-psalmody inner-unit composition.

The stable shipped foundation from 3a–3g is recorded below.

Core composition engine implemented (pre-sub-phase breakdown):

- `@officium-novum/compositor` package scaffold with build, typecheck, and Vitest setup
- Pure-function entry: `composeHour({ corpus, summary, version, hour, options }) → ComposedHour`; no I/O
- Reference resolver with Latin-rooted path convention (Phase 2 emits `horas/Latin/...` paths) swapped into the requested language, walking the parser's `languageFallbackChain` for graceful fallback
- Selector semantics on `TextReference`: integer selectors (1-based raw content index used by `matins-plan.ts`), `'missing'` sentinel (surfaces a rubric placeholder, not stale text), comma-separated psalm lists on `Psalterium/Psalmorum/PsalmN`, weekday-keyed minor-hour psalmody on `Psalterium/Psalmi/Psalmi minor`, and season-keyed seasonal invitatory injection into the Psalm 94 skeleton — the five structured selector shapes Phase 2 actually emits
- Deferred-node expansion for the residual kinds Phase 1 intentionally leaves in place: `psalmInclude` → `Psalterium/Psalmorum/Psalm{N}` (`__preamble`), `macroRef` → `Common/Prayers` section lookup with alias fallbacks, `formulaRef` → same with rubric-prefix stripping; cycle-safe via per-`(language, path#section)` seen set, depth-limited
- Conditional flattening via `evaluateConditionalBlock` (re-exported from `rubrical-engine` at `condition-eval.ts`) applied to resolved section content using a `ConditionEvalContext` derived from `DayOfficeSummary.temporal` and the `ResolvedVersion`
- Matins plan-aware composer: walks `InvitatoriumSource` / `NocturnPlan[]` / `te-deum` decisions from Phase 2g-β, emits language-neutral structured heading nodes (`{ kind: 'nocturn' | 'lesson', ordinal: N }`) instead of baking English labels into every language column, and resolves commemorated lessons from the commemorated feast's own `[LectioN]` section; orphan-heading guard ensures a heading is only emitted when at least one downstream lesson/responsory actually resolves
- `HourDirective` post-transform pipeline with 12 directive cases: `omit-gloria-patri`, `omit-alleluia`, `add-alleluia`, `add-versicle-alleluia`, `preces-dominicales`, `preces-feriales`, `suffragium-of-the-saints`, `omit-suffragium`, `short-chapter-only`, `genuflection-at-oration`, `dirge-vespers`, `dirge-lauds`. The alleluia / Gloria Patri / `short-chapter-only` / `omit-suffragium` / `genuflection-at-oration` transforms operate on concrete text; `preces-*` and the Roman `suffragium-of-the-saints` path now resolve full corpus-backed text, while `dirge-*` remains banner-only pending Office-of-the-Dead attachments
- Lossless output model: `ComposedRun` discriminated union (`text` / `rubric` / `citation` / `unresolved-macro` / `unresolved-formula` / `unresolved-reference`) on every `Section.lines.texts[lang]`, so rubrics keep their typing and unexpanded artifacts are visible to clients instead of being flattened to strings
- Live Perl comparison harness at `packages/compositor/test/fixtures/officium-content-snapshot.pl` with `pnpm -C packages/compositor compare:phase-3-perl`; the harness composes every Hour across the existing Roman Phase 2h date matrices for `divino-afflatu`, `reduced-1955`, and `rubrics-1960`, compares normalized `ComposedHour` output against the legacy Perl-rendered Hour, and writes divergence ledgers to `packages/compositor/test/divergence/divino-afflatu-2024.md`, `packages/compositor/test/divergence/reduced-1955-2024.md`, and `packages/compositor/test/divergence/rubrics-1960-2024.md`
- Smoke integration test against the upstream corpus composing every Hour on a handful of 1960 dates without throwing, plus a focused Matins shape assertion; gates on `existsSync(UPSTREAM_ROOT)` like the engine's integration suites
- Parser-side section-content preprocessing shared across `parseFile`, `parseDirectiveLines`, and cross-reference resolution: inline `/:rubric:/` segments, leading parenthesized conditions, `sed` alternation / omission lines, and readable conditional snapshot serialization for corpus validation
- `__preamble` preservation plus same-source duplicate conditioned-section coalescing in the parser resolver, so heading-based wrapper files and conditional section variants (for example `benedictio Completorium`) remain available to Phase 3 instead of collapsing to a last-one-wins overwrite
- Heading-backed synthetic section resolution for `horas/Ordinarium/*.txt` plus a new `incipit` slot in `HourStructure`, allowing the compositor to compose `#Incipit` wrapper material from heading-based Ordinarium files rather than starting at the first proper slot
- Conditional-aware keyed selector resolution for `Psalterium/Psalmi/Psalmi minor` and `Psalterium/Special/Matutinum Special`: weekday-keyed minor-hour psalmody, weekday-keyed Compline psalmody under the `Completorium` section, and seasonal / weekday invitatory antiphons now continue to resolve correctly after parser-side conditionalization
- Deferred-node expansion extended to `psalmRef`, `Common/Rubricae` formula lookups, season-aware `Alleluia` macro selection, and separator insertion between expanded psalm blocks so the composed line stream stays aligned with the source corpus
- Compline-specific fallback bundle: `Minor Special` now supplies the short reading, hymn, chapter, responsory, and versicle when no proper/commune override exists, and `lectio-brevis` now composes the special short reading plus the Ordinarium wrapper block instead of only the wrapper material
- Compare-harness canonicalization for repeated `+` signs and lowercase `v.` / `r.` markers so the live Phase 3 compare surface is dominated by structural differences rather than render-equivalent noise

### 3a — Design doc, ADR skeleton, adjudication sidecar (complete)

Laid the groundwork every subsequent sub-phase depends on. Published the authoritative design document [`docs/phase-3-composition-engine-design.md`](docs/phase-3-composition-engine-design.md) with per-sub-phase shipping summaries in §19. Added [ADR-010](docs/adr/010-phase-3-incipit-and-preamble-emission.md) (incipit & preamble emission) and [ADR-011](docs/adr/011-phase-3-divergence-adjudication.md) (divergence adjudication protocol + sidecar key schema).

- `packages/compositor/test/divergence/adjudications.json` — hand-maintained sidecar keyed by stable row identity `<policy>/<date>/<hour>/<hash>` where `hash` is the first 8 hex chars of `sha256(normalized-firstExpected \0 normalized-firstActual)`.
- Compare harness at `packages/compositor/test/fixtures/compare-phase-3-perl.mjs` teaches itself to read the sidecar, merge `Class` + `Citation` into the generated ledger, and never write back — so classifications survive ledger regeneration. The ledger also grew an "Adjudication breakdown" section counting rows by class.

### 3b — Incipit slot composition & `joinLaudsToMatins` (complete)

Investigation showed the incipit slot is already populated for every Hour and dispatched by `composeHour`; the real gap was a caller-intent flag for the Lauds-joined-to-Matins rubric.

- `ComposeOptions.joinLaudsToMatins?: boolean` added at `packages/compositor/src/types/composed-hour.ts`. Default `undefined` means the compositor emits the Ordinarium as-is; `true` suppresses the secreto Pater / Ave block at the head of the Lauds `#Incipit`.
- New helper `stripLaudsSecretoPrayers` at `packages/compositor/src/compose/incipit.ts` recursively walks conditionals and drops `formulaRef` nodes named `Pater noster`, `Ave Maria`, and `rubrica Secreto a Laudibus` (case-insensitive).
- Harness updated to pass `joinLaudsToMatins: false` for Lauds explicitly — matching the per-Hour `command=pray$hour` shape of the Perl snapshot helper and making the assumption reviewable.
- 11 new tests in `packages/compositor/test/compose-incipit.test.ts` covering unset / true / false semantics, case-insensitive matching, conditional recursion, and non-Lauds no-op behaviour.

### 3c — Representation parity (complete)

Closed the dominant representation-level divergences revealed on the Rubrics 1960 ledger.

- **`Ant.` marker on antiphon lines.** The source corpus carries antiphons as bare text (`Ant Laudes`) or as `psalmRef.antiphon` inline strings; Perl synthesises `Ant. ` at render time. New helper `markAntiphonFirstText` at `packages/compositor/src/emit/antiphon-marker.ts` wraps the first `text` node of resolved antiphon content as `verseMarker('Ant.', ...)`. Applied to every whole-antiphon slot (invitatory, canticle antiphons, commemoration antiphons) and to psalmody's antiphon refs specifically.
- **Hymn stanza separator `_`.** Source hymn files contain literal `_` lines between stanzas which the parser converts to `separator` nodes; `packages/compositor/src/emit/sections.ts` now surfaces them as `_` lines for hymn slots only.
- **Compline guillemets.** Confirmed in corpus at `upstream/.../Common/Rubricae.txt:129`. Classified as `rendering-difference`; no compositor fix.
- 12 new tests in `packages/compositor/test/canonical-lines.test.ts`. Each first-divergent-line on Rubrics 1960 Jan 1 advanced into a later, different pattern.

### 3d — Matins Benedictio + Te Deum replacement (complete)

First cross-package schema change. Added the Benedictio flow that precedes each Matins lesson and implemented the Te Deum `'replace-with-responsory'` decision.

- **Schema.** `NocturnPlan.benedictions` added as a **required** field at `packages/rubrical-engine/src/types/matins.ts` (forces every consumer to populate). New `BenedictioEntry` interface. New `'benedictio'` member on `SlotName` and `'benedictio'` on the compositor's `SectionType`.
- **Policy hook.** `selectBenedictions(params): readonly BenedictioEntry[]` added to `RubricalPolicy` at `packages/rubrical-engine/src/types/policy.ts`. Shared `selectRomanBenedictions` helper in `packages/rubrical-engine/src/policy/_shared/roman.ts` feeds all three Roman policies: 9/12-lesson office → `[Nocturn N]:<offset>`, 3-lesson office → `[Nocturn 3]:<offset>` in `horas/Latin/Psalterium/Benedictions.txt`. Mirrors Perl's `specmatins.pl:get_absolutio_et_benedictiones` simple path.
- **Matins composition.** `packages/compositor/src/compose/matins.ts::composeNocturn` now emits the Benedictio between the per-lesson heading and the Lectio. `composeMatinsSections` handles the three `teDeum.decision` values: `'say'` emits the Te Deum hymn; `'replace-with-responsory'` finds the responsory flagged with `replacesTeDeum: true` and emits it under the `'te-deum'` slot; `'omit'` emits nothing.
- Unsupported-policy stubs and test policy fixture updated. 3 new Matins composition tests; pre-existing mocks extended with empty `benedictions` arrays where needed.

### 3e — Matins commemorations: Phase 2 coordination (complete)

The "Lauds/Vespers only" assumption for commemorations lived across four sites in rubrical-engine. Lifted them all.

- `packages/rubrical-engine/src/occurrence/resolver.ts` — removed the hardcoded `DEFAULT_COMMEMORATION_HOURS` constant; now calls `policy.defaultCommemorationHours()`.
- `packages/rubrical-engine/src/types/policy.ts` — `CommemorationLimitParams.hour` widened from `'lauds' | 'vespers'` to any `HourName`. Two new hooks: `defaultCommemorationHours(): readonly HourName[]` and `commemoratesAtHour(params): boolean`.
- `packages/rubrical-engine/src/hours/apply-rule-set.ts` — `attachCommemorationSlots` early-return replaced with `policy.commemoratesAtHour(...)`. New `commemorationHeaders()` helper returns Matins/Lauds/Vespers-specific antiphon and versicle section names (`Ant 1` / `Versum 1` for Matins, `Ant 2` / `Versum 2` for Lauds, `Ant 3` / `Versum 3` for Vespers).
- Per-policy implementations: **Rubrics 1960** returns `['lauds', 'vespers']` (preserves Rubricarum Instructum §106–109); **Divino Afflatu** returns `['matins', 'lauds', 'vespers']` (opens the previously-blocked Matins commemoration path per Rubricae Generales §IX); **Reduced 1955** returns `['lauds', 'vespers']` (Cum Nostra reduced Matins commemorations to zero).
- 4 new policy-level tests (2 on DA, 2 on 1960) plus one compositor-level integration test verifying the commemoration slots fall through the Matins generic dispatch correctly.

### 3f — Compline verb disposition + resolver observability (complete)

- [ADR-012](docs/adr/012-compline-benediction-verb.md) records the finding that the compositor emits *both* `concédat` *and* `tríbuat` for every Roman policy because the Phase 1 resolver does not gate duplicate-header sections (`[benedictio Completorium] (rubrica Ordo Praedicatorum)`) by their attached rubric condition. Classified as `engine-bug`; root fix is in Phase 1 and affects every `(rubrica X)` conditional section in the corpus. Not fixed in 3f.
- New `ComposeWarning` interface on `packages/compositor/src/types/composed-hour.ts` (mirrors `RubricalWarning` without re-export). `ComposedHour.warnings: readonly ComposeWarning[]` now required.
- `ResolveOptions.onWarning` and `DeferredNodeContext.onWarning` sinks threaded through. Previously-silent failures now emit `resolve-missing-section` (warn) when the fallback chain exhausts, `resolve-unhandled-selector` (info) when a selector has no narrowing path, and `deferred-depth-exhausted` (warn) when expansion hits `maxDepth`.
- `composeHour` aggregates per-slot warnings into the top-level `ComposedHour.warnings`; `composeMatinsSections` does the same.
- [`docs/upstream-issues.md`](docs/upstream-issues.md) created as the forward-tracking file for `perl-bug` classifications.
- 7 new tests in `packages/compositor/test/warnings.test.ts` covering every emission path and the aggregation happy path.

### 3g — Validation harness: no-throw sweep + heading rendering (complete)

Established the Phase-2-equivalent validation surface required by the Phase 3 §18 success criteria.

- **No-throw sweep** at `packages/compositor/test/integration/no-throw-sweep.test.ts` — composes every Hour for every date in 2024 under each of the three Roman policies = **8,784 compositions per run**. Asserts no exceptions, no `severity: 'error'` warnings, no `unresolved-*` run types. Gated with `describe.skipIf(!HAS_UPSTREAM)`; runs in ~14 seconds on the current checkout.
- **Harness `__full-year__` sentinel** — `compare-phase-3-perl.mjs` now accepts `--date __full-year__` and synthesises every 2024 date, enabling full-year adjudication sweeps via `pnpm -C packages/compositor compare:phase-3-perl:full`.
- **Canonical heading rendering** in the harness normaliser — Nocturn sections render as `Nocturnus I/II/III` and lesson sections as `Lectio N`, making the heading-order Matins divergence observable at the compare surface without requiring a data-model change.
- New package scripts: `test:no-throw`, `compare:phase-3-perl:full`.
- **Deferred.** The 312 snapshot goldens (13 Appendix-A dates × 3 policies × 8 hours) were deliberately skipped for 3g because Appendix A in the modernization spec is descriptive (no fixed ISO dates) and the goldens would churn heavily during 3h adjudication. Goldens become a stabilization tripwire after 3h settles.

### 3h — Divergence adjudication burn-down (in progress)

Opening-session work ships the infrastructure, three documented engine-bug fixes, and a ledger-metric upgrade that makes forward progress visible even when row counts stay flat.

- **Duplicate-header reference narrowing in Phase 1.** The parser's cross-reference resolver now coalesces duplicate same-header raw sections when a reference targets them, preserving rubric-gated conditional branches instead of reading only the first raw section. Ambiguous unconditional duplicates now surface an `ambiguous-section` warning. This is the root fix ADR-012 needed for Compline's `concédat` / `tríbuat` split and other `(rubrica X)` duplicate-header cases.
- **Policy-wide compositor smoke matrix.** `packages/compositor/test/integration/compose-upstream.test.ts` now walks the canonical 13-date Roman Phase 3 matrix across `Divino Afflatu - 1954`, `Reduced - 1955`, and `Rubrics 1960 - 1960`, rather than a 1960-only handful of smoke dates. The shared date list lives in `packages/compositor/test/fixtures/phase-3-golden-dates.ts` and is the pinned interpretation of the illustrative Appendix-A categories until the 312 goldens land.
- **Maintenance scripts.** Added `pnpm -C packages/compositor adjudications:fanout` to bulk-populate row-level adjudications from representative entries against the current generated ledgers, plus `pnpm -C packages/compositor verify:phase-3-signoff` to fail on `src/` files over 800 lines or any `adjudications.json` entries still carrying `commitSha: "pending"`.
- **Ledger progress metrics.** The generated ledgers now carry a `Matching prefix` column and a `First divergence line` column on every row, plus per-policy `Best matching prefix` and `Average matching prefix` summary lines. First published values: Rubrics 1960 best 39 / avg 13.5 lines, Reduced 1955 best 30 / avg 12.4, Divino Afflatu best 4 / avg 2.9. This is the progress signal that the row count alone could not show.
- [ADJUDICATION_LOG.md](packages/compositor/test/divergence/ADJUDICATION_LOG.md) — chronological audit trail per ADR-011. Captures every pattern-level resolution with citation and commit context.
- **Directive-backed preces insertion.** `preces-dominicales` and `preces-feriales` no longer act as banner-only hints. The compositor now resolves the real corpus-backed sections from `horas/Latin/Psalterium/Special/Preces.txt` even when the Hour's `preces` slot is empty because the Ordinarium heading was rubric-suppressed. Sunday/ferial Compline rows now carry the actual prayer body instead of silently skipping it.
- **Directive-backed Roman suffragium insertion.** When pre-1955 Roman Hours carry `suffragium-of-the-saints`, the compositor now resolves the real `Psalterium/Special/Major Special.txt` sections (`Suffragium` or `Suffragium Paschale`) even if the Hour's `suffragium` slot is otherwise empty. This closes the largest remaining non-dirge directive gap without changing the public Phase 3 API.
- **January Roman antiphon routing fixed at the Phase 2 seam.** `hours/apply-rule-set.ts` now lets January Lauds/Vespers proper antiphons replace generic psalter-wrapper antiphons slot-by-slot, including inherited `vide` / `ex` proper files and commune fallback when the winner lacks its own section. The same pass now replaces the `1960` `proper-minor-hours` generic `Tridentinum#antiphon` lead antiphon with the winning office's `Ant Laudes` selector while preserving the already-correct `Tridentinum` psalm refs and split Psalm 118 ranges.
- **Roman January second-Vespers ownership fixed at the Phase 2 seam.** Vespers structuring now threads an internal first/second-Vespers side into the hour-decoration path, so a day's own second Vespers prefers `Ant Vespera 3` over `Ant Vespera` when the source office supplies that Roman second-Vespers set. This fixes the Jan `7` `Reduced - 1955` / `Rubrics 1960 - 1960` Holy Family ownership bug without disturbing first-Vespers selection.
- **January fallback hymn doxologies now flow end-to-end.** Pre-1955 fallback minor-hour hymns (`Prima Special` / `Minor Special`) now receive a real `doxology-variant` slot from either the winning office's local `[Doxology]` section or the generic `Psalterium/Doxologies` variants (`Nat`, `Epi`). The compositor consumes that slot by replacing the final default doxology stanza instead of emitting a second hymn block.
- **Wrapped psalmody no longer re-injects generic closing antiphons when a proper antiphon was already selected.** This lets the January major-hour proper-antiphon selections actually surface at Phase 3 instead of being overwritten by the psalter-wrapper's trailing inline antiphon.
- **Roman temporal Sundays now keep their explicit minor-hour antiphons at the Phase 2 seam.** `hours/apply-rule-set.ts` no longer requires `Antiphonas horas` before replacing the generic Sunday lead antiphons on Prime, Terce, Sext, and None. Explicit unconditional `Ant Prima` / `Ant Tertia` / `Ant Sexta` / `Ant Nona` headers now win on temporal Sundays such as `Quadp1-0` and `Quadp3-0`, with a focused integration regression covering `2024-01-28` and `2024-02-11` for both Roman policies.
- **January Roman non-bugs are now classified instead of chased as more engine work.** The remaining `Reduced - 1955` Jan `1/13` minor-hour antiphon rows and `Rubrics 1960 - 1960` Jan `6` Vespers row are now source-backed `perl-bug` adjudications, with citations in `adjudications.json`, pattern reasoning in `ADJUDICATION_LOG.md`, and upstream-facing summaries in `docs/upstream-issues.md`.
- **Engine-bug fix #1 — hymn doxology `*` prefix** (in `packages/compositor/src/emit/sections.ts::stripHymnDoxologyMarker`). The DO corpus prefixes the doxology stanza of metrical hymns with `* ` as an editorial convention; Perl strips it at render. We now do too.
- **Engine-bug fix #2 — `Psalmus N [M]` heading emission** (in `packages/compositor/src/compose.ts::buildPsalmHeading`). Perl emits `Psalmus 92 [1]`, `Psalmus 118(1-16) [2]`, etc. before each psalm at every non-Matins Hour. Three psalm-number extraction strategies (path match, selector range, verse-prefix scan on resolved content) handle both direct Psalmorum references and the `Psalmi major:Day0 Laudes1` wrapper style used under 1960.
- **Engine-bug fix #3 — wrapped-psalmody inner-unit composition.** Explicit psalmody antiphon refs no longer expand an entire psalm, and wrapped psalms (via `Psalmi major/minor:<Day> <Hour>N` sections) now render in the live corpus as `Ant. -> Psalmus N [M] -> verses` instead of leaking the whole first psalm before the heading. Wrapper-shape coverage added in `packages/compositor/test/canonical-lines.test.ts`.
- **Engine-bug fix #4 — Paschaltide `add-alleluia` no longer mutates the Gloria response tail.** `applyDirectives()` now treats `psalmody` as an antiphon-targeted transform surface for `add-alleluia` instead of a generic "append to last line" slot. Paschaltide Alleluia is now appended to `Ant.` lines only, while `R. Sicut erat ... Amen.` remains source-faithful. Regression coverage added in `packages/compositor/test/apply-directives.test.ts`.
- **Representative adjudications** landed in `adjudications.json`, with bulk fan-out into the current ledgers for repeated live patterns: Compline guillemets under 1960, Divino Afflatu's single-reciter `Jube, Dómine` guillemets, Reduced 1955's Compline cross glyph, and the psalm-heading `engine-bug` pattern.
- **Divino Afflatu rubric-prose adjudication batch.** The repeated `Deinde, clara voce, dicitur Versus:` / `Secus absolute incipiuntur, ut sequitur:` divergences are now classified as source-backed `perl-bug` rows rather than treated as unknown compositor failures. The citations point to `Psalterium/Common/Rubricae.txt`, where those rubric sentences are present verbatim.
- **Pattern catalogue** documented for follow-up sessions: Matins Invitatorium Psalm 94 responsorial structure, `Ant. 109:1a` verse-prefix leak on Vespers psalmRef, wrong-psalm selection under 1960 for Christmas Octave (Phase 2 psalter-selection).

Open:

- **Liturgically complete dirge directive implementations.** `preces-dominicales`, `preces-feriales`, and the Roman `suffragium-of-the-saints` path now splice in real corpus-backed text. The remaining directive work is the Office-of-the-Dead attachment path for `dirge-lauds` / `dirge-vespers`.
- **Matins Invitatorium Psalm 94 responsorial structure.** Perl interleaves the invitatory antiphon with each section of Psalm 94 at Matins. The compositor emits the antiphon once and moves on. Biggest remaining Matins row-count gap.
- **Compline verb duplicate-header resolution (ADR-012).** Root fix in Phase 1's reference resolver; affects every `(rubrica X)` conditional section in the corpus, not just Compline.
- **Compline tail-order and wording / punctuation parity.** The final sequencing from `Adjutorium nostrum` onward and a few wording / punctuation differences still diverge from the legacy renderer.
- **Perl-comparison divergence burn-down and Ordo-backed adjudication.** The remaining 488 / 496 / 488 rows need to be triaged against the published *Ordo* and governing rubrics, with each pattern classified as `engine-bug` / `perl-bug` / `ordo-ambiguous` / `rendering-difference` per ADR-011. Progress is now visible via the matching-prefix metric; row-count collapse follows pattern-level fixes.
- **312 snapshot goldens.** Deferred from 3g until 3h stabilises enough patterns to make golden churn acceptable.

## Phase 2 — Rubrical Engine

Roman scope complete; non-Roman families deferred by design. The detailed design is in [`docs/phase-2-rubrical-engine-design.md`](docs/phase-2-rubrical-engine-design.md). Pipeline: Version Resolver → Temporal/Sanctoral → Directorium Overlay → Candidate Assembly → Occurrence Resolver → Celebration Rule Eval → Transfer Computation → Concurrence → Commemoration Assembly → Hour Structuring. The Roman headline policies from design §18 (`divino-afflatu`, `reduced-1955`, `rubrics-1960`) now resolve full `DayOfficeSummary` outputs without throws; the remaining Tridentine/monastic/Cistercian/Dominican families stay on explicit stubs by scope.

**Validation.** Per design §19.1, the authority order is: Ordo Recitandi → governing rubrical books (1911 / 1955 / 1960) → legacy Divinum Officium Perl output. Perl is a comparison target, not an oracle. Divergence ledgers live in `packages/rubrical-engine/test/divergence/`, with the current documented residual state at `rubrics-1960`: `8` mismatches across `7` dates, `divino-afflatu`: `0/62` divergent rows, and `reduced-1955`: `0/61` divergent rows.

477 rubrical-engine tests passing (plus one TODO marker) in package validation, including the 1911/1955 suites, the year-wide supported-handle no-throw matrix, the refreshed 1960 upstream fixtures, and the upstream-backed Phase 2h regression fixtures.

### 2h — 1911 and 1955 Policies (complete)

The pre-1955 Roman policy families from design §18 now resolve end-to-end without fallback throws: `Divino Afflatu - 1939`, `Divino Afflatu - 1954`, `Reduced - 1955`, and the two existing 1960 handles all complete `resolveDayOfficeSummary(date)` with policy-owned occurrence, concurrence, transfer, commemoration limiting, hour directives, psalter selection, and Matins shaping.

- Real `policy/divino-afflatu.ts` and `policy/reduced-1955.ts` objects plus their own precedence and concurrence tables; `version/policy-map.ts` now binds those policies to the existing 1939/1954/1955 handles without changing the public API
- Shared policy-contract expansion for pre-1955 behavior: typed octave metadata, candidate/celebration/commemoration octave-vigil provenance, and policy-owned commemoration limiting reused by both the engine summary and per-Hour structuring
- Pre-1955 hour generalization for seasonal directives, suffragium/preces behavior, Matins shape, Te Deum outcome, scripture-course routing, transfer search, and Compline source selection while preserving the existing 1960 behavior
- New unit coverage for both pre-1955 policies and both new precedence tables, plus upstream-backed 2024 fixture coverage for occurrence, concurrence, hours, and Matins in `test/fixtures/phase-2h-roman-2024.json`, now including Easter/Pentecost octave Matins and representative Christmas / SS Peter & Paul octave dates
- Perl comparison tooling is now available at `packages/rubrical-engine/test/fixtures/officium-snapshot.pl` with `pnpm -C packages/rubrical-engine generate:phase-2h-perl-fixtures` and `pnpm -C packages/rubrical-engine compare:phase-2h-perl-fixtures` for divergence reporting against the legacy engine without making Perl an unconditional CI oracle
- Full-year 2024 no-throw integration sweep across every handle bound to `divino-afflatu`, `reduced-1955`, and `rubrics-1960`, plus explicit edge-case coverage for `2024-03-25`, `2024-12-08`, `2025-01-05`, and `2062-03-19`
- Post-Phase-2h 1960 cleanup aligned the focused 1960 occurrence / Vespers / Matins fixtures with the governing 1960 rubrics and fixed the remaining engine-side 1960 bugs around fourth-class feria commemorations and Saturday BVM synthesis on non-free Saturdays
- Residual Perl-snapshot disagreements are now tracked explicitly in `packages/rubrical-engine/test/divergence/rubrics-1960-2024.md`, `packages/rubrical-engine/test/divergence/divino-afflatu-2024.md`, and `packages/rubrical-engine/test/divergence/reduced-1955-2024.md`; the 1960 rows are still documented as adjudicated divergences or comparison-surface differences, while the Divino Afflatu and 1955 ledgers now record full 2024 fixture parity rather than adjudication backlog

### 2g (α + β) — Hour Structuring (complete)

`summary.hours` is now populated with typed `HourStructure` values for all eight Hours (`matins`, `lauds`, `prime`, `terce`, `sext`, `none`, `vespers`, `compline`) per design §16.

2g-α delivered the non-Matins infrastructure:

- `hours/skeleton.ts` with `OrdinariumSkeletonCache` (per-engine, keyed on `(version.handle, hour)`); walks the legacy `#Heading` markers inside the `__preamble` of `horas/Ordinarium/*.txt` and maps each to a typed `SlotName`.
- `hours/psalter.ts` implementing the §16.2 psalter-selection decision tree for Roman 1960 (ferial / dominica / festal / proper, with `psalmOverrides` and `psalterScheme` honored); emits `TextReference`-shaped `PsalmAssignment[]` for Phase 3 to dereference.
- `hours/transforms.ts` emitting seasonal + rubric-driven `HourDirective`s (`add-alleluia` / `omit-alleluia` / `add-versicle-alleluia`, Triduum `omit-gloria-patri` + `short-chapter-only`, `preces-feriales`, 1960-always `omit-suffragium`, `dirge-vespers` / `dirge-lauds` from overlay, Ember-Wed `genuflection-at-oration`).
- `hours/apply-rule-set.ts` common skeleton-application pipeline: feast proper → commune fallback (via `comkey`) → psalter (`policy.selectPsalmody`) → Ordinarium default; `hourRules.omit` suppresses as `{ kind: 'empty' }`; `overlay.hymnOverride` attaches typed `HymnOverrideMeta` to the hymn slot.
- Per-Hour structurers: `structureLauds`, `structureVespers`, `structurePrime` / `structureTerce` / `structureSext` / `structureNone`, plus an expanded `buildCompline` that keeps the existing `source` field and now populates real slots.
- Commemoration attachment for Lauds and Vespers (three ordered-ref slots: `commemoration-antiphons` / `-versicles` / `-orations`), consuming the existing `Commemoration.hours` field from Phase 2c/2f; minor hours and Compline never produce commemoration slots under 1960 per RI §107.
- Policy interface gains `selectPsalmody(params)` and `hourDirectives(params)`; 1960 shipped first, and Phase 2h later generalized both hooks across the Roman 1911/1955/1960 policies while leaving the explicitly deferred non-Roman families stubbed.
- Engine integration: Vespers is structured for the concurrence winner (today's Second Vespers or tomorrow's First Vespers) with a uniform §16 input shape; Compline follows the Vespers winner; a missing Ordinarium file is demoted from a throw to a `hour-skeleton-missing` warning so legacy unit fixtures remain compatible.
- New fixture `test/fixtures/hours-1960-2024.json` + `test/integration/phase-2g-upstream.test.ts` assert the full structured Hour inventory and per-date directive flags (Lent omits alleluia; Triduum omits Gloria Patri + short chapter; Paschaltide adds alleluia; 1960 always omits suffragium).

2g-β then completed Matins as a dedicated plan-first pipeline:

- `types/matins.ts` immutable Matins type surface (`MatinsPlan`, `NocturnPlan`, `LessonSource`, `PericopeRef`, `ScriptureCourse`, etc.).
- `hours/matins-plan.ts` pure plan builder (`buildMatinsPlan`) that emits typed references without text dereferencing.
- `hours/matins-lessons.ts` lesson router consuming `celebrationRules.lessonSources` and `commemorated-principal` materialized overrides from Phase 2d.
- `hours/matins-scripture.ts` Directorium scripture-transfer post-pass (`R` / `B` / `A`) over scripture-kind lessons only.
- `hours/matins-alternates.ts` `in N loco` alternate selection with condition gates.
- `hours/matins.ts` structurer that wraps the plan into Matins slot content and reuses `applyRuleSet` only for wrapper slots.
- Policy hooks added for Matins shape, Te Deum resolution, and default scripture course (`resolveMatinsShape`, `resolveTeDeum`, `defaultScriptureCourse`); Phase 2h later filled those hooks for `divino-afflatu` and `reduced-1955`.
- New fixture `test/fixtures/matins-1960-2024.json` + `test/integration/phase-2g-beta-upstream.test.ts` asserting Matins shape across the focused date matrix, including Triduum Te Deum omission, Ember Saturday shape, and scripture-transfer application.

### 2f — Concurrence and Compline (complete)

`resolveDayOfficeSummary(date)` now computes the Vespers boundary between today and tomorrow using cached per-date `DayConcurrencePreview` materialization, honors `hasFirstVespers` / `hasSecondVespers` veto flags before rank-matrix comparison, and emits typed concurrence outputs (`winner`, source celebration, Vespers-only concurrence commemorations, reason tags, warnings). The 1960 policy now provides explicit concurrence-table resolution (`concurrence/tables/vespers-1960.ts`) plus Compline-source selection (`vespers-winner` / `ordinary` / `triduum-special`), and `hours/compline.ts` ships the Phase 2f minimal `HourStructure` (source + directives, empty slots by design). Upstream fixture coverage now includes a focused 2024 concurrence/Compline matrix (`test/fixtures/vespers-1960-2024.json`).

### 2e — Transfer Computation and Vigils (complete)

Transfer-flagged losers are now fully resolved into concrete target dates through a cached year-map (`(version, year)`), reconciled against the Directorium transfer table (overlay wins on disagreement), and surfaced back into daily candidate assembly as `source: 'transferred-in'` with `transferredFrom` metadata. Candidate assembly also tags vigils (`vigilOf`) and wires celebration-level vigil/transfer metadata through occurrence into `DayOfficeSummary`. New transfer diagnostics are emitted as data (`transfer-rule-agrees-with-overlay`, `transfer-table-overrides-rule`, `transfer-perpetually-impeded`, `transfer-bounded-search-exceeded`), and upstream integration coverage now includes transfer matrices plus vigil behavior.

### 2d — Rule Evaluation (complete)

The dedicated rule-evaluation stage from design §12/§18 is now wired after occurrence: every winning celebration now carries a typed `CelebrationRuleSet`, with tested per-hour derivation via `deriveHourRuleSet`.

- New `types/rule-set.ts` contract (`CelebrationRuleSet`, `HourRuleSet`, `MatinsRuleSpec`, `HourScopedDirective`, supporting unions)
- New `rules/` module:
  - `evaluate.ts` (`buildCelebrationRuleSet`) for policy defaults + feast directives + commemorated lesson routing
  - `classify.ts` vocabulary mapper (`celebration` / `hour` / `missa` / `unmapped`)
  - `resolve-vide-ex.ts` chained `vide`/`ex` inheritance with missing-target, cycle, and depth-limit warnings
  - `merge.ts` pure merges plus tested `deriveHourRuleSet`
  - `apply-conditionals.ts` paragraph-scoped conditional evaluation primitive for Phase 2g wiring
- Policy hook expansion: `RubricalPolicy.buildCelebrationRuleSet`; 1960 shipped first, and Phase 2h later wired the same typed evaluation path for `divino-afflatu` and `reduced-1955`
- Engine integration: `DayOfficeSummary` now includes `celebrationRules`, and rule-evaluation warnings are merged into `summary.warnings`
- Upstream regression harness for `horas/Latin/Sancti` + `horas/Latin/Tempora` with stable unmapped/missa-pass-through totals

### 2c — Occurrence for 1960 (complete)

The 1960 occurrence stage from design §18 is now wired end-to-end: `resolveDayOfficeSummary(date)` returns a resolved `celebration` and raw `commemorations`, with deferred transfer signaling for Phase 2e.

- `PRECEDENCE_1960` plus class-symbol registry with explicit Rubricarum Instructum/Tabella citations
- `rubrics1960Policy` with precedence lookup, seasonal preemption, deterministic candidate comparison, privileged-feria detection, and deferred octave hook
- Pure `resolveOccurrence(candidates, temporal, policy)` outputting `celebration`, `commemorations`, `omitted`, `transferQueue`, and typed warnings (`occurrence-season-preemption`, `occurrence-transfer-deferred`, `occurrence-omitted`)
- Expanded `RubricalPolicy` interface for occurrence hooks; Phase 2c shipped 1960 first, and Phase 2h later filled `divino-afflatu` + `reduced-1955` while leaving the non-Roman families on explicit `UnsupportedPolicyError` stubs
- `DayOfficeSummary` evolution to include `celebration` + `commemorations` while preserving `winner` as a deprecated compatibility mirror
- 1960-specific rank normalization (`rubrics1960ResolveRank`) mapped to precedence class symbols with a weight-consistency invariant against the precedence table
- Edge-case coverage for design §10.4 (Annunciation/Holy Week, St Joseph/Palm Sunday, bisextile St Matthias remap semantics, Dec 8 vs Advent II, Vigil of Epiphany clash, Ember Saturday clash, dual sanctoral collision, Triduum suppression)
- Focused upstream integration matrix (`test/fixtures/ordo-1960-2024.json`) validated against a real 1960 engine build

### 2b — Directorium Overlay (complete)

The per-date `DirectoriumOverlay` is computed from the version's `Transfer`/`Stransfer` tables, surfaced on `DayOfficeSummary` (as `undefined` when empty), and threaded back into candidate assembly with resolved replacement ranks and typed warnings.

- `DirectoriumOverlay` type: `officeSubstitution?`, `dirgeAtVespers?`, `dirgeAtLauds?`, `hymnOverride?`, `scriptureTransfer?` — the split-Hour dirge shape reflects that `dirge1`/`dirge2`/`dirge3` are a month partition, not an Hour partition (per `Directorium.pm:229-237` and `horas/Help/technical.html`)
- `computeYearKey(year)` — Sunday-letter + Easter-MMDD derivation mirroring Perl's `load_transfer`, including the leap-year companion pair with the `332 → 401` wrap
- `YearTransferTable` / `ScriptureTransferTable` with inheritance-chain lookup via `ResolvedVersion.transferBase`, leap-chunk filtering equivalent to Perl's `load_transfer_file` `regexp`/`regexp2`, and a runtime guard that rejects mixed wildcard/named-handle inputs at construction
- `matchesVersionFilter` — Perl-shape regex match (version name as pattern, filter as string) with a tokenized-substring fallback; agreement with Perl semantics validated on every `(filter × transfer-name)` pair from the live `Tabulae` files
- Dirge extraction as a union scan over all three buckets, keyed on today's sday for Lauds and tomorrow's sday for Vespers — independently, so a single civil date can carry both attachments
- Office-substitution extraction with `Tempora/<path>` and bare-`MM-DD` canonicalization, plus an `overlay-alternates-deferred` info warning when tilde-chained targets are seen (consumed in Phase 2e)
- Candidate-assembly substitution: `resolveOverlayCandidate` callback resolves both `feastRef` and `rank` for the replacement against the corpus, so the substituted candidate carries its own rank rather than inheriting the displaced one; resolver failures surface as `severity: 'error'` warnings and fall back to the displaced rank
- Integration harness that loads every real `Tabulae/Transfer/*.txt` and `Tabulae/Stransfer/*.txt` file and asserts overlay directives for a focused matrix (leap-year companion substitution on 2024-01-08, hymn-merge on 2025-05-18, simultaneous dirge pair on 2025-11-02/2025-11-03, and `~R`/`~B`/`~A` scripture operations)

### 2a — Foundations (complete)

The end-to-end deliverable from design §18 is in place: `createRubricalEngine(config).resolveDayOfficeSummary(date)` returns temporal + sanctoral candidates with a naive (highest-raw-rank) winner for every date.

- `@officium-novum/rubrical-engine` package scaffold with build, typecheck, and Vitest setup
- Version-layer foundations: branded `VersionHandle`, `ResolvedVersion`, `VersionDescriptor`, and immutable `VersionRegistry`
- `data.txt` registry builder and version resolver with four-way error dispatch (unknown / missa-with-hint / missa-without-hint / unbound Breviary)
- Policy binding map covering all 15 Breviary rows in `Tabulae/data.txt` across 10 distinct policy families
- Temporal cycle: Meeus/Jones/Butcher Gregorian computus; `dayNameForDate`/`weekStemForDate` cross-checked against the upstream Perl `getweek` on a 550+ date matrix spanning 2020–2030; `LiturgicalSeason` classifier
- Sanctoral kalendarium lookup that walks the inheritance chain via `ResolvedVersion.base`, replicating upstream `Directorium.pm`'s date-level override semantics and the bisextile Feb 24 remap
- Policy-hookable rank normalization (`defaultResolveRank` for Phase 2a; pluggable for Phase 2c+)
- Conditional evaluation for `aut`/`et`/`nisi` expressions against `rubrica`/`tempore`/`mense`/`die`/`feria` subjects
- Canonical content-dir routing (`Tempora`, `TemporaM`, `TemporaCist`, `TemporaOP`, same for `Sancti`)
- Candidate assembly with equal-rank tie-breaking in favor of the temporal cycle
- `policyOverride` composite pattern: overrides augment the configured policy map rather than replacing it

## Phase 1 — Parser (complete)

The `@officium-novum/parser` package parses the full 34,000+ file corpus across 16 languages, resolves cross-references with language fallback, and builds an in-memory text index. All 82 tests pass, including a spot-check validation of 62 representative feast files across languages against resolved snapshots.

- Section splitter, directive parser, condition parser (recursive descent with `aut`/`et`/`nisi` precedence), rank parser, rule parser
- Cross-reference resolver with path resolution, language fallback chains, line selectors, regex substitutions, cycle detection, and preamble merging
- Corpus walker (horas/, missa/, Tabulae/ with rite variant detection), file loader, file cache
- Calendar parsers (Kalendarium, feast transfers, version registry)
- In-memory text index queryable by path and content directory
- Corpus loader with integrated reference resolution
