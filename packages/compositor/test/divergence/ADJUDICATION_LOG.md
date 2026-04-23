# Phase 3 Divergence Adjudication Log

Chronological audit trail for divergence-ledger adjudications per
[ADR-011](../../../../docs/adr/011-phase-3-divergence-adjudication.md).
Every row resolved in `adjudications.json` appears here with its class,
citation, and the commit SHA that landed the resolution.

## Protocol

Entries are appended in chronological order. Each entry names the
*pattern* being resolved (not individual ledger rows) since most
adjudications collapse many rows at once by sharing a citation.

A single pattern entry may span multiple policies and many dates;
`adjudications.json` holds the per-row mapping, and this log holds the
pattern-level reasoning.

The `**Commit.**` field records the repo commit where that pattern
resolution was first recorded in the adjudication materials. Later
wording-only or citation-only touch-ups do not change the historical
anchor.

## Entries

### 2026-04-18 — 3h kickoff: baseline regeneration

**Commit.** `8cc3de1`

**Context.** First re-run of `compare:phase-3-perl` post-3a–3g with the
harness enhancements from 3g (sidecar merge, heading canonicalisation,
`__full-year__` sentinel).

Baseline row counts:

| Policy | Divergent hours | Compared hours |
|---|---|---|
| Divino Afflatu - 1954 | 496 | 496 |
| Reduced - 1955 | 488 | 488 |
| Rubrics 1960 - 1960 | 488 | 488 |

Every row is `unadjudicated`. The remainder of this log records pattern
adjudications that classify rows into `engine-bug`, `perl-bug`,
`ordo-ambiguous`, or `rendering-difference`.

### 2026-04-18 — Pattern: hymn doxology `*` prefix (engine-bug, fixed)

**Commit.** `8cc3de1`

**Ledger signal.** Prime / Terce / Sext / None on every date, every
policy: the compositor emits `* Deo Patri sit glória,` (or similar `*
Præsta, Pater piíssime,`) on the first line of the hymn doxology;
Perl emits the bare text without the `*`.

**Root cause.** The Divinum Officium corpus marks the doxology stanza
of metrical hymns with a leading `* ` prefix as an editorial
convention — e.g. `upstream/.../Psalterium/Special/Prima Special.txt:107`
contains `* Deo Patri sit glória,`. The prefix is not part of the
liturgical text; the legacy Perl renderer strips it. The compositor
was emitting the raw corpus text.

**Resolution.** Class `engine-bug`. Fixed in
`packages/compositor/src/emit/sections.ts::stripHymnDoxologyMarker`
(3h fix #1): for the `hymn` slot only, a leading `* ` is stripped from
the first rendered line of each hymn-text node. A mid-line `*` (which
appears as a legitimate stanza separator in some traditions) is
preserved.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Special/Prima Special.txt:107`
(and parallel lines in the other hour-special files).

**Impact.** Collapses ~732 ledger rows across 4 minor hours × 61 dates
× 3 policies. First-divergent-line moves from the doxology to the next
pattern (missing `Psalmus N [M]` heading at line 32).

### 2026-04-18 — Pattern: missing `Psalmus N [M]` heading (engine-bug, fixed)

**Commit.** `8cc3de1`

**Ledger signal.** Every Hour with a `psalmody` slot (Lauds, Prime,
Terce, Sext, None, Vespers, Compline — i.e. every non-Matins Hour)
showed the first psalm's content without the `Psalmus N [M]` header
line that Perl emits before each psalm. First-divergent-line on
Rubrics 1960 / 2024-01-01 / Lauds was line 7: expected `Psalmus 92 [1]`,
actual was the antiphon immediately.

**Root cause.** The compositor's generic slot-composition path
(`packages/compositor/src/compose.ts::composeSlot`) resolved and
emitted each `PsalmAssignment` but did not prepend the Perl-style
heading. Perl emits one heading per psalm in the order of the Hour's
psalmody, indexed `[1]`, `[2]`, ... (counting every assignment
including canticles, so the label `[5]` can appear on the 5th slot
while `[4]` is occupied by a canticle).

**Resolution.** Class `engine-bug`. Fixed in
`packages/compositor/src/compose.ts`:

- `TaggedRef` now carries an optional `psalmIndex` field (1-based
  position within the psalmody slot).
- `taggedReferencesFrom` sets `psalmIndex` on every `PsalmAssignment`.
- In the per-ref loop, when `slot === 'psalmody'` and the ref is not
  the antiphon, `buildPsalmHeading(ref, expandedContent, psalmIndex)`
  computes the heading and `appendContentWithBoundary` inserts it
  with the correct text-boundary separator so the preceding psalm's
  last verse does not concatenate with the new heading.

The heading function tries three ways to extract the psalm number:
1. Path match `/Psalm<N>` on the reference itself.
2. Selector-embedded range when the path is Psalmorum-anchored.
3. Verse-prefix scan on the expanded content — the wrapper case
   (`Psalmi major:Day0 Laudes1` etc.) where the psalm number only
   appears as `N:M` prefixes inside the resolved psalm verses.

If no psalm number is recoverable, no heading is emitted (better
than a broken one).

**Citation.** Perl's `horas.pl` emits the heading via its psalm
printer; the format `Psalmus N [index]` is observable on every
non-Matins Hour. Our emission mirrors it faithfully, including the
`N(start-end) [index]` form when the reference carries a verse-range
selector (e.g. Prime's `Psalmus 118(1-16) [2]`).

**Impact.** First-divergent-lines advance on every non-Matins Hour.
Rubrics 1960 Jan 1 Lauds now diverges at line 8 (where an upstream
wrapper-antiphon bug surfaces) instead of line 7. Other Hours show
similar forward progress. Total row counts are unchanged because
subsequent pattern divergences remain; individual-row collapse comes
with the next engine-bug fix in the pattern catalogue.

### 2026-04-18 — Pattern: wrapped-psalmody inner-unit composition (engine-bug, fixed)

**Commit.** `4bdfe47`

**Ledger signal.** Wrapper-backed psalmody rows were still diverging
immediately after the new `Psalmus N [M]` heading landed because the
compositor could leak inner psalm material directly after the antiphon.
The live symptom was output like `Ant. 109:1a Dixit Dóminus...` or a
whole first psalm appearing before the heading instead of the expected
`Ant. ...` followed by `Psalmus N [M]`.

**Root cause.** The generic psalmody compose path flattened wrapper
sections such as `Psalmi major/minor:<Day> <Hour>N` as if they were
ordinary expanded content. That lost the wrapper's inner-unit boundary
between the explicit antiphon reference and the first psalm, so inline
psalm refs could surface verse tokens before the per-psalm heading and
separator were inserted.

**Resolution.** Class `engine-bug`. Fixed in
`packages/compositor/src/compose.ts` (with the same wrapper-aware path
mirrored in `packages/compositor/src/compose/matins.ts`) by detecting
wrapper-backed psalmody (`containsInlinePsalmRefs`), routing it through
`appendExpandedPsalmWrapper`, and separating verse lines before
emission. Explicit psalmody antiphon refs no longer expand an entire
psalm, and wrapped psalms now render as `Ant. -> Psalmus N [M] ->
verses`.

**Citation.** The wrapper-backed Roman psalmody sections in the live
corpus (`Psalmi major/minor:<Day> <Hour>N`) are meant to emit an
antiphon unit followed by distinct psalm units; Perl's rendered surface
on the same rows makes that boundary observable.

**Impact.** Removes the shallow wrapper-shape / antiphon-leak
divergence class, pushing first divergences later and making the
remaining mismatches more specific. Coverage for this shape lives in
`packages/compositor/test/canonical-lines.test.ts`.

### 2026-04-19 — Pattern: Divino Afflatu opening rubric prose (perl-bug)

**Commit.** `d1961b8`

**Ledger signal.** Divino Afflatu rows still diverge almost immediately
across nearly every Hour because the compositor emits rubric prose like
`Deinde, clara voce, dicitur Versus:` and `Secus absolute incipiuntur,
ut sequitur:` while the Perl comparison surface often shows a blank line
or jumps straight to `Nocturnus I`.

**Root cause.** These lines are not compositor inventions. They are
present verbatim in the upstream Latin corpus at
`Psalterium/Common/Rubricae.txt` under the `Clara voce`,
`Secus absolute`, and `Secus absolute Parvum` sections. The compositor
is preserving source-backed rubric prose; the legacy Perl rendering
surface elides it before comparison.

**Resolution.** Class `perl-bug`. Representative row-level entries were
added to `adjudications.json` for the three repeated live signatures:

- `_` → `Deinde, clara voce, dicitur Versus:`
- `_` → `Secus absolute incipiuntur, ut sequitur:`
- `Nocturnus I` → `Deinde, clara voce, dicitur Versus:`

These are fanned out across the current Divino Afflatu ledger rather
than fixed in code, because the compositor output matches the corpus and
no governing Divino Afflatu rubric has been found that suppresses these
rubric sentences.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:50-65`.

**Impact.** This is the first large non-code burn-down batch for the DA
ledger: dozens of shallow `unadjudicated` rows become source-backed
`perl-bug` rows immediately, making the remaining real engine work
easier to see.

### 2026-04-19 — Pattern: Roman Matins pre-lesson guillemets (rendering-difference)

**Commit.** `4bdfe47`

**Ledger signal.** Under both `Reduced - 1955` and `Rubrics 1960 - 1960`,
some Matins rows now first diverge at the synthetic pre-lesson bundle:
Perl shows `Pater Noster dicitur secreto usque ad Et ne nos indúcas in
tentatiónem:`, while the compositor emits `« Pater Noster » dicitur
secreto usque ad « Et ne nos indúcas in tentatiónem: »`.

**Root cause.** This is not a new Matins composition bug. The upstream
corpus itself carries the guillemeted rubric sentence in
`Psalterium/Common/Rubricae.txt` under `[Pater secreto]`. Perl strips
the guillemets for its rendered comparison surface; the compositor
preserves the corpus author's punctuation verbatim.

**Resolution.** Class `rendering-difference`. Representative row-level
entries were added for the stable Roman Matins key-hash `29ec2a3d`
under both `Reduced - 1955` and `Rubrics 1960 - 1960`, then fanned out
across the current ledger. No compositor change is needed because both
renderings represent the same rubric sentence.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:1-2`.

**Impact.** The Roman Matins frontier moves past this punctuation-only
family and leaves the remaining January rows concentrated in the real
selection / ordering seams instead of another corpus-formatting dispute.

### 2026-04-19 — Pattern: Rubrics 1960 January fallback-hymn doxology substitution (perl-bug)

**Commit.** `6bf7746`

**Ledger signal.** After the January Roman antiphon and hymn-routing
pass, the remaining `Rubrics 1960 - 1960` minor-hour January rows no
longer fail on selection. They now fail on the final hymn stanza only:
Perl keeps the unsubstituted fallback closes (`Deo Patri sit glória,`
or `Præsta, Pater piíssime,`), while the compositor emits the January
seasonal or local office doxology (`Jesu, tibi sit glória,` for the
Nativity / Epiphany family and `Jesu, tuis obédiens` for Holy Family).

**Root cause.** This is not an engine overreach. The upstream Roman
corpus explicitly requests these substitutions:

- `Sancti/01-06.txt` carries `Doxology=Epi` in `[Rule]`.
- `Tempora/Epi1-0.txt` carries a local `[Doxology]` stanza for Holy
  Family.
- The fallback hymn sources in `Psalterium/Special/Prima Special.txt`
  and `Psalterium/Special/Minor Special.txt` still end with the default
  closes (`Deo Patri sit glória,` / `Præsta, Pater piíssime,`), so the
  seasonal or local doxology must be substituted at composition time.
- Phase 2 design §16.3.5 explicitly says hymn resolution uses
  `celebrationRules.doxologyVariant` when present.

The compositor now follows that source-backed rule. The legacy Perl
comparison surface still shows the unsubstituted fallback stanza on
these January `1960` rows.

**Resolution.** Class `perl-bug`. Representative row-level entries were
added for the four stable Rubrics 1960 key-hashes:

- `c52cc2ef` — `Deo Patri sit glória,` → `Jesu, tibi sit glória,`
- `318cf47a` — `Præsta, Pater piíssime,` → `Jesu, tibi sit glória,`
- `6b019b6f` — `Deo Patri sit glória,` → `Jesu, tuis obédiens`
- `274511e7` — `Præsta, Pater piíssime,` → `Jesu, tuis obédiens`

These are then fanned out across the January `1960` Prime / Terce /
Sext / None rows where the first divergence is the fallback hymn
doxology line.

**Citation.**

- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-8`
- `upstream/web/www/horas/Latin/Tempora/Epi1-0.txt:56-67`
- `upstream/web/www/horas/Latin/Psalterium/Doxologies.txt:1-20`
- `upstream/web/www/horas/Latin/Psalterium/Special/Prima Special.txt:100-109`
- `upstream/web/www/horas/Latin/Psalterium/Special/Minor Special.txt:664-672`
- `docs/phase-2-rubrical-engine-design.md:1469`

**Impact.** The January `1960` minor-hour doxology family stops blocking
the ledger as `unadjudicated` code work. What remains after this batch
is narrower: genuine Roman January antiphon / verse-shape / ordering
families, not another unresolved doxology decision.

### 2026-04-19 — Pattern: Roman Lauds Psalm 99 half-verse structure (perl-bug)

**Commit.** `7508fb4`

**Ledger signal.** Under both `Reduced - 1955` and
`Rubrics 1960 - 1960`, the January Roman Lauds rows for Jan `1`, `6`,
`7`, and `13` now first diverge at Psalm 99 line `99:3b`. Perl flattens
the line to `... * introíte ...`, while the compositor emits
`... ‡ introíte ... * ...`. After the Jan `14` Sunday psalter work, the
same Rubrics 1960 Jan `14` Lauds row also lands in this family.

**Root cause.** The compositor is now preserving the corpus half-verse
shape, not inventing a new marker rule. `Psalm99.txt` encodes the source
as `Pópulus ejus, et oves páscuæ ejus: ‡ (4a) introíte portas ejus in
confessióne, * átria ejus in hymnis: confitémini illi.` The numeric
carry marker is normalized away, but the `‡ ... *` structure remains.
The Perl comparison surface flattens that same source line to a single
`*` split.

**Resolution.** Class `perl-bug`. Representative row-level entries were
added for the stable Roman Lauds key-hash `2af868c1` under both
`Reduced - 1955` and `Rubrics 1960 - 1960`, then fanned out across the
matching current January ledger rows.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm99.txt:3-5`.

**Impact.** Converts the remaining shared Roman Lauds continuation-marker
family from `unadjudicated` to source-backed `perl-bug`, dropping the
current unadjudicated totals to `462` for `Reduced - 1955` and `457` for
`Rubrics 1960 - 1960`.

### 2026-04-19 — Pattern: Roman Jan 14 Sunday Prime psalm table begins with Psalm 53 (perl-bug)

**Commit.** `7508fb4`

**Ledger signal.** Under both `Reduced - 1955` and
`Rubrics 1960 - 1960`, Jan `14` Prime now first diverges at the opening
heading: Perl expects `Psalmus 117 [1]`, while the compositor emits the
source-backed `Psalmus 53 [1]`.

**Root cause.** This is not a routing regression. The Roman Sunday Prime
`Tridentinum` row in `Psalmi minor.txt` explicitly lists the psalm order
`53,117,118(1-16),118(17-32)`. Once the Jan `14` explicit-antiphon
materialization stopped collapsing the wrapper surface, the compositor
correctly exposed Psalm 53 as the first heading. The Perl comparison
surface skips directly to Psalm 117.

**Resolution.** Class `perl-bug`. Representative row-level entries were
added for the stable Jan `14` Prime key-hash `5531f29c` under both Roman
policies.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:218`.

**Impact.** Removes Jan `14` Prime from the Roman engine backlog; the
remaining Jan `14` Roman rows are now either source-backed surface
families or later-block seams.

### 2026-04-19 — Pattern: Reduced 1955 Jan 14 Sunday psalter antiphon surface is flattened by the Perl render surface (perl-bug)

**Commit.** `7508fb4`

**Ledger signal.** Under `Reduced - 1955`, Jan `14` `Lauds`, `Terce`,
`Sext`, `None`, and `Vespers` no longer fail on generic `Allelúja`
leakage or wrapper duplication. They now fail because Perl abbreviates
the Sunday psalter antiphons to `Ant. Allelúja.` or `Ant. Dixit
Dóminus. ‡`, while the compositor emits the full source-backed psalter
surface.

**Root cause.** The Jan `14` Phase 3 fix now materializes the Roman
Sunday psalter exactly where the source stores it:

- `Psalmi major.txt` `Day0 Laudes1` / `Day0 Vespera` carry the full
  Sunday Lauds and Vespers antiphons.
- `Psalmi minor.txt` keyed Sunday sections `[Tertia]`, `[Sexta]`, and
  `[Nona]` carry the full minor-hour antiphons `deduc me...`, `tuus sum
  ego...`, and `fáciem tuam...`, while the `Tridentinum` rows remain the
  psalm-table source only.

The compositor now emits that corpus-backed Sunday surface. The legacy
Perl rendering continues to collapse these rows to incipit-only or
generic `Allelúja` openings.

**Resolution.** Class `perl-bug`. Row-level entries were added for the
stable key-hashes `a4224c0e`, `50fad344`, `5e2b4bef`, `f178bdcc`, and
`557f2156`.

**Citation.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:1-6`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:17-19,33-35,49-51,227-231`

**Impact.** Closes the exposed `Reduced - 1955` Jan `14` Sunday
antiphon-surface family as adjudicated source-backed disagreement rather
than more compositor work.

### 2026-04-19 — Pattern: Rubrics 1960 Jan 14 Vespers adds an unsupported trailing continuation marker (perl-bug)

**Commit.** `7508fb4`

**Ledger signal.** After the Sunday psalter-major fix, the remaining
`Rubrics 1960 - 1960` Jan `14` `Vespers` opening divergence is
punctuation-only: Perl expects `Ant. Dixit Dóminus * Dómino meo: Sede a
dextris meis. ‡`, while the compositor emits the same source text
without the trailing `‡`.

**Root cause.** The Sunday Day0 `Vespera` source carries the full
opening antiphon without a trailing continuation marker. The compositor
preserves that source-backed text. The Perl comparison surface appends
an unsupported trailing `‡`.

**Resolution.** Class `perl-bug`. A row-level entry was added for the
stable key-hash `019555e4`.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`.

**Impact.** Removes the last Jan `14` Rubrics 1960 opening-antiphon
surface row from the engine backlog; the remaining Jan `14` `1960`
minor-hour rows now fail later at the oration / later-block seam.

### 2026-04-19 — Pattern: Roman January second-Vespers antiphon ownership (engine-bug, fixed)

**Commit.** `5b5211b`

**Ledger signal.** `Reduced - 1955` and `Rubrics 1960 - 1960` both
showed Jan `7` Vespers diverging immediately on the opening antiphon:
Perl expected `Post tríduum...`, while the engine/compositor were still
selecting `Jacob autem...`.

**Root cause.** This was a real Phase 2 routing bug. The concurrence
winner was already the day's own office (`Tempora/Epi1-0`), but the
Vespers psalmody selection path treated every winning office as if it
should read only `[Ant Vespera]`. For a day's own **second** Vespers,
the Roman source file instead provides the psalmody antiphons under
`[Ant Vespera 3]`.

**Resolution.** Class `engine-bug`. Fixed in the rubrical engine by
threading an internal Vespers-side signal from concurrence/hour
structuring into `applyRuleSet`, then preferring `Ant Vespera 3` over
`Ant Vespera` when the composed Vespers is the day's own second
Vespers. First-Vespers selection stays on `Ant Vespera`.

**Citation.** `upstream/web/www/horas/Latin/Tempora/Epi1-0.txt:11-21`.

**Impact.** The Jan `7` Roman Vespers rows no longer diverge on antiphon
ownership. Their first divergence now moves later to the psalm-heading /
later Phase 3 surface, which confirms the Phase 2 routing seam is fixed
rather than merely shifted.

### 2026-04-19 — Pattern: Reduced 1955 January minor-hour antiphons fall back to weekday psalter in Perl (perl-bug)

**Commit.** `5b5211b`

**Ledger signal.** `Reduced - 1955` Jan `1` and Jan `13` Prime / Terce /
Sext / None still diverged on the opening antiphon after the January
Roman routing pass. Perl expected weekday psalter antiphons such as
`Ínnocens mánibus.` or `Exaltáre, Dómine.`, while the engine/compositor
kept the proper office antiphons.

**Root cause.** The remaining difference is not an engine bug. The
winning `1955` Phase 2 refs are source-backed:

- `Sancti/01-01` is still a Christmas-octave office via
  `ex Sancti/12-25`, and its `[Rank]` section explicitly carries
  `Antiphonas Horas`.
- `Sancti/01-13` is explicitly said "as at present on the Octave of the
  Epiphany" and inherits Epiphany via `ex Sancti/01-06`, which likewise
  carries `Antiphonas horas`.

Under the file-format contract, `Antiphonas horas` means the office's
proper hour antiphons govern the minor Hours. Perl instead falls back to
the weekday psalter antiphons on these 1955 January rows.

**Resolution.** Class `perl-bug`. Added row-level adjudications for the
eight stable Jan `1` / Jan `13` Reduced 1955 minor-hour keys rather than
changing the engine away from the corpus-backed `Antiphonas horas`
ownership.

**Citation.**

- `upstream/web/www/horas/Latin/Sancti/01-01.txt:7-20`
- `upstream/web/www/horas/Latin/Sancti/12-25.txt:1-6`
- `upstream/web/www/horas/Latin/Sancti/01-13.txt:1-20`
- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-20`
- `upstream/web/www/horas/Help/Rubrics/1955.txt:141-147`
- `docs/file-format-specification.md:638`

**Impact.** These rows now leave the "possible Phase 2 engine bug"
bucket. The remaining January Reduced 1955 backlog is narrower and
concentrated in later Phase 3 normalization / heading seams instead of
office-ownership ambiguity.

### 2026-04-19 — Pattern: Rubrics 1960 Jan 6 Vespers is switched to Holy Family in Perl (perl-bug)

**Commit.** `5b5211b`

**Ledger signal.** `Rubrics 1960 - 1960` Jan `6` Vespers still diverged
immediately on the opening antiphon after the January routing pass:
Perl expected Holy Family's `Jacob autem...`, while the engine/compositor
kept Epiphany's `Ante lucíferum génitus...`.

**Root cause.** Source review showed the engine is already correct. Under
the 1960 concurrence rules, Epiphany is a feast of the 1st class while
Holy Family is a feast of the 2nd class. In concurrence, the Vespers of
the higher-class office prevail, so Jan `6` Vespers stays with
Epiphany's own `Ant Vespera` rather than switching to Holy Family's
first Vespers.

**Resolution.** Class `perl-bug`. Added a row-level adjudication for the
stable Jan `6` Rubrics 1960 Vespers key instead of changing Phase 2
concurrence or antiphon-decoration logic.

**Citation.**

- `upstream/web/www/horas/Help/Rubrics/General Rubrics.html:74-82, 465-469`
- `upstream/web/www/horas/Help/Rubrics/Tables 1960.txt:49, 75-79, 118-121`
- `upstream/web/www/horas/Latin/Sancti/01-06.txt:1-18`

**Impact.** Jan `6` Roman Vespers is no longer treated as unresolved
Phase 2 office-boundary ambiguity. The remaining January Rubrics 1960
Vespers rows can now be triaged cleanly as either later Phase 3 surface
issues or separate adjudication candidates.

### 2026-04-19 — Pattern: Roman Jan 1/7 Vespers second psalm remains Psalm 110 (perl-bug)

**Commit.** `379dd72`

**Ledger signal.** Under both `Reduced - 1955` and
`Rubrics 1960 - 1960`, Jan `1` and Jan `7` Vespers still diverged at
the second psalm heading after the later-block checkpoint. Perl expected
`Psalmus 112 [2]`, while the compositor emitted `Psalmus 110 [2]`.

**Root cause.** The Phase 2 seam was already correct. The Roman Sunday
`Day0 Vespera` table in `Psalmi major.txt` explicitly lists the psalm
order `109,110,111,112,113`. The current composed output therefore
correctly reopens the second antiphon and heads the next psalm as
`Psalmus 110 [2]`. Perl skips ahead to Psalm `112`, which is the fourth
entry in the same source table, not the second.

**Resolution.** Class `perl-bug`. Added representative row-level
adjudications for the stable key-hash `22de27ef` under both Roman
policies, then fanned them out across the matching Jan `1/7` Vespers
rows.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`.

**Impact.** The shared Roman Vespers Jan `1/7` rows leave the
"maybe-wrapper, maybe-routing" bucket. What remains in January Vespers
is now narrower: the fifth-psalm override family and later
continuation-marker surfaces.

### 2026-04-19 — Pattern: Roman Epiphany-octave Vespers fifth psalm remains Psalm 116 (perl-bug)

**Commit.** `379dd72`

**Ledger signal.** `Reduced - 1955` Jan `6/13` Vespers and
`Rubrics 1960 - 1960` Jan `13` Vespers still first diverged at the
fifth psalm heading after the later-block checkpoint. Perl expected
`Psalmus 113 [5]`, while the compositor emitted `Psalmus 116 [5]`.

**Root cause.** This is not a Phase 2 routing bug. `Sancti/01-06.txt`
explicitly sets `Psalm5 Vespera=116`; `Sancti/01-13.txt` inherits that
Epiphany rule set by `ex Sancti/01-06`. The current Roman Vespers
summaries therefore correctly keep Psalm `116` in the fifth slot rather
than the Day0 default Psalm `113`. Perl falls back to the unspecialized
Day0 heading.

**Resolution.** Class `perl-bug`. Added representative row-level
adjudications for stable key-hash `39846534` under `Reduced - 1955` and
`Rubrics 1960 - 1960`, then fanned out the matching `1955` Jan `13`
row.

**Citation.**

- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-11`
- `upstream/web/www/horas/Latin/Sancti/01-13.txt:1-15`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`

**Impact.** The shared Roman fifth-psalm Vespers family is now removed
from the unadjudicated backlog. The remaining January Vespers work is no
longer blocked on "is Psalm 116 real?" uncertainty.

### 2026-04-19 — Pattern: Rubrics 1960 Jan 14 minor-hour short responsories gain underscore separators in Perl (perl-bug)

**Commit.** `379dd72`

**Ledger signal.** After the Jan `14` `Rubrics 1960` Phase 2 fallback
fix restored `chapter → responsory → versicle → oration` at `Terce`,
`Sext`, and `None`, the first divergence moved later. Perl now expects a
literal `_` line immediately before each short responsory, while the
compositor emits the source-backed `R.br.` opening line.

**Root cause.** The restored Phase 2 refs are correct. `Minor
Special.txt` contains the Sunday later-block sections directly:
chapter, `R.br.` short responsory, versicle, and no underscore-only
separator lines. The compositor now emits that source-backed stream.
Perl inserts `_` separator lines around the short responsory even though
the source section has none.

**Resolution.** Class `perl-bug`. Added row-level adjudications for the
three stable Jan `14` Rubrics 1960 key-hashes:

- `89c6190b` — `Terce`
- `bc17de3d` — `Sext`
- `4a1aadd8` — `None`

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Special/Minor Special.txt:1-20, 36-50, 66-80`.

**Impact.** The Jan `14` `1960` minor-hour checkpoint is now closed as
far as this tranche is concerned. The code fix was the Phase 2 fallback;
the remaining underscore lines are source-backed adjudication work, not
another later-block structuring bug.

### 2026-04-19 — Pattern: Reduced 1955 Jan 6/7 minor hours restore source-backed later blocks while Perl leaves the proper lesson / short responsories absent (perl-bug)

**Commit.** `2c0fb83`

**Ledger signal.** After the January Matins and minor-hour checkpoint
work restored the 1955 later-block slot refs, the Jan `6/7`
`Prime`/`Terce`/`Sext`/`None` rows stopped failing on missing structure
and now diverge exactly where the proper later-block material begins.
Jan `6` Prime now first differs at the restored `Lectio Prima` citation
(`Isa 60:6` instead of the weekday `1 Tim. 1:17`), while Jan `6/7`
`Terce`/`Sext`/`None` now first differ on the restored `R.br.` opening
lines rather than on an earlier empty-wrapper seam.

**Root cause.** The restored Phase 2 refs are correct. The Epiphany
office at `Sancti/01-06.txt` explicitly carries `[Lectio Prima]`,
`[Responsory Breve Tertia]`, `[Capitulum Sexta]`, `[Responsory Breve
Sexta]`, `[Capitulum Nona]`, and `[Responsory Breve Nona]`, while the
Holy Family office at `Tempora/Epi1-0.txt` carries the same 1955
later-block pattern for Jan `7`. The compositor now emits those
source-backed sections. The Perl comparison surface instead keeps the
weekday Prime lesson or leaves underscore-only separators where the
proper short responsories should begin.

**Resolution.** Class `perl-bug`. Added row-level adjudications for the
seven stable Reduced 1955 key-hashes in this family:

- `5b39cf70` — Jan `6` Prime (`Isa 60:6`)
- `803ba4ab` — Jan `6` Terce
- `4868da5c` — Jan `6` Sext
- `e17600d7` — Jan `6` None
- `fbcd352c` — Jan `7` Terce
- `bae99624` — Jan `7` Sext
- `373eea90` — Jan `7` None

**Citation.**

- `upstream/web/www/horas/Latin/Sancti/01-06.txt:266-322`
- `upstream/web/www/horas/Latin/Tempora/Epi1-0.txt:335-381`

**Impact.** The Reduced 1955 Jan `6/7` minor-hour checkpoint is now
closed as adjudication work rather than remaining in the live code
bucket. The remaining January Roman work is no longer blocked on
"did the later block resolve?" ambiguity for these hours.

### 2026-04-20 — Pattern: Roman Jan 13 Matins inherits Epiphany's omit rule while Perl keeps the suppressed opener (perl-bug)

**Commit.** `c71f2c0`

**Ledger signal.** After the January Matins checkpoint fixed the real
selection/order seams, Jan `13` Roman Matins no longer fails at a mixed
"maybe source, maybe compositor" boundary. Both `Reduced - 1955` and
`Rubrics 1960 - 1960` now first diverge immediately at line `1`: Perl
still begins with `V. Dómine, lábia + mea apéries.`, while the
compositor opens straight at `Nocturnus I`.

**Root cause.** This is source-backed inheritance, not a new Matins
composition bug. `Sancti/01-13.txt` explicitly says `ex Sancti/01-06;`
in `[Rule]`, and the inherited Epiphany Rule at `Sancti/01-06.txt`
explicitly says `Omit ad Matutinum Incipit Invitatorium Hymnus`. The
compositor now follows that inherited omit rule all the way through the
Matins opener, so the first emitted section is the nocturn heading.
Perl keeps the suppressed opener lines instead.

**Resolution.** Class `perl-bug`. Added row-level adjudications for the
shared Roman key-hash `74e956ed` on Jan `13` Matins under both `1955`
and `1960`.

**Citation.**

- `upstream/web/www/horas/Latin/Sancti/01-13.txt:1-13`
- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-8`

**Impact.** The Jan `13` Roman Matins opener is no longer sitting in the
live code bucket. It is now explicitly classified as a source-backed
Perl discrepancy rather than an unresolved Matins handoff bug.

### 2026-04-20 — Pattern: Roman Jan 6/14 Matins pre-lesson guillemets are rendering-only differences (rendering-difference)

**Commit.** `c71f2c0`

**Ledger signal.** After the January Matins checkpoint advanced Jan `6`
and Reduced `1955` Jan `14` past the original seam, these rows now land
on the same pre-lesson rubric surface already visible on Jan `1/7`:
Perl strips the guillemets in `Pater Noster dicitur secreto usque ad Et
ne nos indúcas in tentatiónem:`, while the compositor preserves the
corpus punctuation `« Pater Noster » ... « Et ne nos indúcas in
tentatiónem: »`.

**Root cause.** This is the existing Roman Matins guillemet family, not
new code work. The source rubric at `Psalterium/Common/Rubricae.txt`
carries the guillemets verbatim. The compositor preserves them; Perl
strips them.

**Resolution.** Class `rendering-difference`. Added the remaining
January Matins entries for key-hash `29ec2a3d` on:

- `Reduced - 1955` — Jan `6`, Jan `14`
- `Rubrics 1960 - 1960` — Jan `6`

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:1-2`

**Impact.** Jan `6` and Reduced `1955` Jan `14` Roman Matins now close
as punctuation-only rendering rows rather than remaining unclassified
after the checkpoint work.

### 2026-04-20 — Pattern: Rubrics 1960 Jan 14 Matins gains an unsupported trailing `‡` in Perl (perl-bug)

**Commit.** `c71f2c0`

**Ledger signal.** After the one-nocturn Sunday and split-Psalm-9 fixes,
the remaining Jan `14` `Rubrics 1960` Matins row no longer fails on
selection or block order. It now first diverges deep in the third
nocturn at the antiphon surface only: Perl expects `Ant. Ut quid,
Dómine, * recessísti longe? ‡`, while the compositor emits the source
text without the trailing continuation marker.

**Root cause.** The psalter source does not carry that trailing `‡`.
`Psalmi matutinum.txt` gives the Day0 antiphon simply as `Ut quid,
Dómine, * recessísti longe?`. The compositor preserves the corpus text.
Perl appends an unsupported trailing continuation marker.

**Resolution.** Class `perl-bug`. Added the Jan `14` `Rubrics 1960`
Matins adjudication for stable key-hash `57b37f6e`.

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt:12-15`

**Impact.** The Jan `14` `Rubrics 1960` Matins checkpoint is now closed
as source-backed surface adjudication. The remaining January Roman
Matins rows are no longer ambiguous implementation seams.

### 2026-04-20 — Pattern: Roman temporal Sundays honor explicit minor-hour antiphon sections (engine-bug)

**Commit.** `6aea4ac`

**Ledger signal.** After the January Roman work closed, the next shared
Roman frontier surfaced on temporal Sundays with explicit
`[Ant Prima]` / `[Ant Tertia]` / `[Ant Sexta]` / `[Ant Nona]`
sections. `2024-01-28` (`Quadp1-0`) and `2024-02-11` (`Quadp3-0`) were
still opening Prime, Terce, Sext, and None from generic Sunday
`Psalmi minor:Tridentinum:*#antiphon` fallbacks instead of the office's
own minor-hour antiphons.

**Root cause.** This was a Phase 2 structure bug in
`packages/rubrical-engine/src/hours/apply-rule-set.ts`, not a Phase 3
composition seam. Minor-hour antiphon decoration only replaced the lead
antiphon when the office advertised `Antiphonas horas`, so temporal
Sunday files that expose explicit per-hour antiphon sections without
that broader marker never displaced the generic Sunday psalter
antiphons.

**Resolution.** Class `engine-bug`. `applyRuleSet()` now checks for
explicit unconditional `Ant Prima` / `Ant Tertia` / `Ant Sexta` /
`Ant Nona` sections before falling back to the previous
`proper-minor-hours` `Ant Laudes` path, and the new regression
`packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
locks those source refs for `Reduced - 1955` and `Rubrics 1960 - 1960`
on `2024-01-28` and `2024-02-11`.

**Citation.**
`upstream/web/www/horas/Latin/Tempora/Quadp1-0.txt:169-184`,
`upstream/web/www/horas/Latin/Tempora/Quadp3-0.txt:162-177`

**Impact.** The Roman rows no longer stall at the generic `Allelúja`
fallback seam. `2024-01-28` / `2024-02-11` now move deeper into the
shared Roman Prime psalm-table and later-block families, with no new
adjudications needed for this tranche.

### 2026-04-20 — Pattern: Roman Quad-Sunday Prime now uses `Prima Dominica SQP`; Perl drops source-backed psalm units (perl-bug)

**Commit.** `bfb3c52`

**Ledger signal.** The next shared Roman Prime seam on `Quad*` Sundays
(`2024-01-28` / `2024-02-11`) showed policy-specific shallow drift:
`Reduced - 1955` still opened at `Psalmus 92 [1]` while Officium Novum
opened at `Psalmus 53 [1]`; `Rubrics 1960 - 1960` matched on Psalm 53
but then diverged at the next heading (`Psalmus 118(1-16) [2]` expected
vs `Psalmus 92 [2]` actual).

**Root cause.** This seam crossed Phase 2 ownership first. Prime
selector logic in `hours/psalter.ts` always chose `Prima Dominica` on
Sundays and never asked for `Prima Dominica SQP` on `Quad*` Sundays.
The source table explicitly carries a dedicated row
`Prima Dominica SQP=;;53,92,118(1-16),118(17-32)` in
`Psalterium/Psalmi/Psalmi minor.txt`.

**Resolution.** Phase 2 fix landed first: Sunday Prime now prefers
`Prima Dominica SQP` when `dayName` starts `Quad`, with fallback to
`Prima Dominica` when the SQP row is absent. Upstream-backed regression
coverage now locks this seam in
`test/integration/temporal-sunday-minor-antiphons.test.ts` plus a
focused selector unit case in `test/hours/psalter.test.ts`.

After the selector fix, the remaining compare drift is source-vs-Perl
surface behavior, not an unresolved engine seam. Classified as
`perl-bug` with representative row keys:

- `Reduced - 1955/2024-01-28/Prime/2e28d92b`
- `Rubrics 1960 - 1960/2024-01-28/Prime/67634c25`

**Citation.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:219`

**Impact.** The Quad-Sunday Prime selector family is no longer mixed
"maybe Phase 2 / maybe Perl" work: the Phase 2 source seam is fixed and
the residual compare signatures are now explicitly adjudicated as
Perl-side omissions.

### 2026-04-20 — Pattern: full-ledger adjudication fanout sweep (perl-bug + rendering-difference)

**Commit.** `bfb3c52`

**Ledger signal.** After the Quad-Sunday Prime tranche, the ledgers
still carried many rows with first-divergence signatures already covered
by representative adjudications, but those rows remained marked
`unadjudicated` because the default sample ledgers only include the first
40 rows per policy.

**Root cause.** `adjudications:fanout` matches on
`(policy, firstExpected, firstActual)` against the currently materialized
ledger rows. With 40-row ledgers, many matching rows never participate in
fanout.

**Resolution.** Ran one Roman+DA adjudication sweep with
`compare:phase-3-perl -- --max-doc-rows 600`, then executed
`adjudications:fanout`, then restored standard ledger output. The sweep
propagated existing representative `perl-bug` and
`rendering-difference` entries across the full row surface.

**Impact.** `adjudications:fanout` wrote `759` new row-level mappings.
Resulting live ledger counts:

- Divino Afflatu `unadjudicated`: `26` (down from `458`)
- Reduced 1955 `unadjudicated`: `321` (down from `447`)
- Rubrics 1960 `unadjudicated`: `246` (down from `447`)

### 2026-04-20 — Pattern: Divino Afflatu Epiphany-octave Matins omitted opener remains present in Perl (perl-bug)

**Commit.** `bfb3c52`

**Ledger signal.** The residual Divino Afflatu `unadjudicated` rows were
concentrated in Matins signatures where Perl still begins with
`secreto` while the compositor opens at `Nocturnus I`.

**Root cause.** The Epiphany office rule source is explicit:
`Sancti/01-06.txt` includes `Omit ad Matutinum Incipit Invitatorium Hymnus`.
That omission suppresses the opener block before Matins nocturns. The
compositor follows the source-backed omit; the Perl surface keeps the
suppressed opener.

**Resolution.** Added representative `perl-bug` adjudication
`Divino Afflatu - 1954/2024-01-06/Matins/e66d7177` and fanned it across
matching full-ledger rows.

**Citation.**
`upstream/web/www/horas/Latin/Sancti/01-06.txt:4-8`

### 2026-04-20 — Pattern: Paschaltide `add-alleluia` must target antiphons, not the Gloria response tail (engine-bug)

**Commit.** `bfb3c52`

**Ledger signal.** Shared Roman rows (`Reduced - 1955` + `Rubrics 1960 - 1960`)
were still diverging at the end of psalmody on Paschaltide dates:
Perl stopped at `R. Sicut erat in princípio... Amen.`, while the
compositor appended `, allelúja.` to that response line.

**Root cause.** This was a Phase 3 composition bug in
`packages/compositor/src/directives/apply-directives.ts`. The
`add-alleluia` transform treated `psalmody` like a generic single-tail
slot and appended the suffix to the *last* line in the slot, which is
often the Gloria response (`R. Sicut erat...`). The rubrical rule is
about antiphon endings, not the Gloria response tail.

**Resolution.** Class `engine-bug`. `addAlleluia()` now handles
`psalmody` with a dedicated pass that only appends `, allelúja.` to
antiphon lines (`Ant.`), leaving the Gloria response untouched. Added
regression coverage in
`packages/compositor/test/apply-directives.test.ts` to lock the exact
ownership seam: antiphon gets Alleluia, `R. Sicut erat... Amen.` does
not.

**Citation.**

- `upstream/web/www/horas/Help/Rubrics/rubrics.txt:1442-1446` (Paschaltide:
  Alleluia is added at antiphon endings)
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:61`
  (`R. Sicut erat... Amen.` source form without appended Alleluia)

**Impact.** The shared Roman Paschaltide Gloria-tail family no longer
stalls at a false `Amen, allelúja` seam; the same rows now move forward
to deeper unresolved families.

### 2026-04-20 — Pattern: Roman psalm half-verse `‡` markers are flattened by Perl (perl-bug)

**Commit.** `034a6b9`

**Ledger signal.** After the shared Roman structural fixes moved first
divergences deeper, a recurring Roman seam remained where Perl emits a
single `*` split while the compositor preserves source-backed `‡ ... *`
half-verse structure. This surfaced across `Reduced - 1955` and
`Rubrics 1960 - 1960` on multiple psalms (62, 4, 124, 114, and 99).

**Root cause.** The corpus files explicitly encode these verses with
half-verse markers (`‡`) before the normal `*` split. The compositor
preserves that structure (and strips numeric carry markers where
appropriate), while the Perl comparison surface flattens those lines to
single-asterisk boundaries.

**Resolution.** Class `perl-bug`. Added representative row-level
adjudications for the stable signature hashes:

- `9fbc4e11` (`Psalm 62:3`)
- `89cb274b` (`Psalm 4:5`)
- `b1fc00bf` (`Psalm 124:2`)
- `839eeb27` (`Psalm 114:4`)
- `2af868c1` (`Psalm 99:3`) for the remaining Rubrics 1960 rows not yet
  covered by earlier fanout snapshots

Then ran `adjudications:fanout` over full ledgers to propagate across
matching rows in each policy.

**Citation.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm62.txt:3`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm4.txt:5`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm124.txt:2`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm114.txt:5`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm99.txt:3-5`

**Impact.** Another repeated Roman source-vs-Perl punctuation/structure
family is now explicitly classified, reducing `unadjudicated` backlog
without introducing compositor or rubrical-engine date logic.

### 2026-04-20 — Pattern: festal Sunday Prime must prefer `Prima Festis` over `Prima Dominica` (engine-bug)

**Commit.** `c6f473d`

**Ledger signal.** A shared Roman Prime seam remained on festal Sundays
such as Trinity (`2024-05-26`), St Michael (`2024-09-29`), and the
Immaculate Conception (`2024-12-08`): the compare surface still opened
the second Prime psalm at `Psalmus 117 [2]`, even though the source
`Prima Festis` table omits Psalm 117 and goes straight from Psalm 53 to
`118(1-16)`.

**Root cause.** This was a Phase 2 selector bug in
`packages/rubrical-engine/src/hours/psalter.ts`. Sunday Prime keyed
directly off the civil Sunday and therefore kept asking for
`Prima Dominica` unless the day was a `Quad*` Sunday. That leaked the
ordinary Sunday 117-row into festal Sunday offices that carry proper
minor-hour antiphons via `Antiphonas horas` and therefore belong on the
`Prima Festis` row.

**Resolution.** Class `engine-bug`. Prime now prefers
`Prima Festis` whenever a Sunday office carries proper minor-hour
antiphons, while preserving the existing `Prima Dominica SQP` override
for `Quad*` Sundays. Added a focused selector regression in
`packages/rubrical-engine/test/hours/psalter.test.ts` plus upstream
integration coverage in
`packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
for `2024-05-26`, `2024-09-29`, and `2024-12-08` across both Roman
policies. Updated the January Roman integration lock as the same source
rule also applies to `2024-01-07`.

**Citation.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:226`
  (`Prima Festis=...;;53,118(1-16),118(17-32)`)
- `upstream/web/www/horas/Latin/Tempora/Pent01-0.txt:12-16`
- `upstream/web/www/horas/Latin/Tempora/Epi1-0.txt:13-14`
- `upstream/web/www/horas/Latin/Sancti/05-08.txt:9-15`
- `upstream/web/www/horas/Latin/Sancti/12-08.txt:9-12`

**Impact.** The shared Roman Prime family no longer stalls at the
spurious `Psalmus 117 [2]` seam. Representative targeted compares now
move deeper into later Prime-block families (`Canticum Quicumque [4]`
on Trinity, `1 Tim. 1:17` versus the office's proper citation on St
Michael), and the Roman average matching-prefix metrics improve to
`35.9` (`Reduced - 1955`) and `38.1`
(`Rubrics 1960 - 1960`). No new adjudications landed in this tranche
because the residual later-block seams are different families.

### 2026-04-20 — Pattern: Roman Triduum `Special Completorium` must compose the temporal source block (mixed fix + adjudication)

**Commit.** `2ecf982`

**Ledger signal.** A shared Roman Compline seam remained on the Triduum
block (`2024-03-28` through `2024-03-30`) across both `Reduced - 1955`
and `Rubrics 1960 - 1960`: the compare surface still opened at the
ordinary short-reading citation `1 Pet 5:8-9`, while Perl expected the
temporal `Special Completorium` office block.

**Root cause.** This was primarily a Phase 3 composition bug. Phase 2
already marked these rows with `source.kind = triduum-special`, but the
compositor still fell through the ordinary Compline slot lattice and
therefore opened at `Lectio Completorium` / `Completorium` instead of
the temporal `Special Completorium` section. Once that source seam was
composed directly, the corpus itself split the family: Holy Thursday
and Good Friday (`1955/1960`) explicitly collapse the older block to a
short `Vísita, quǽsumus...` close, while Holy Saturday keeps the full
special office and then advances into the already-classified Psalm 4
half-verse `‡ ... *` family.

**Resolution.** Mixed outcome:

- `engine-bug` fix in `packages/compositor/src/compose.ts`: Compline now
  detects `source.kind = triduum-special`, resolves the winning
  temporal `Special Completorium` section directly, preserves the source
  `_` separators, and emits the inline psalm headings that the special
  office requires on Holy Saturday.
- Immediate adjudication for the Thursday / Friday rows: the corrected
  compositor now follows the source-backed 1955/1960 short
  `Vísita, quǽsumus...` block, while Perl keeps the older full-block
  opening `Special Completorium`; those rows are therefore classified
  `perl-bug`.
- Holy Saturday (`2024-03-30`) no longer stalls at the special-office
  routing seam; it now lands on the pre-existing Psalm 4 half-verse
  `perl-bug` family (`89cb274b`) already tracked elsewhere in this log.

Added upstream-backed compositor coverage in
`packages/compositor/test/integration/compose-upstream.test.ts` for
`2024-03-28` / `2024-03-29` / `2024-03-30` across both Roman policies,
locking the source-backed Triduum Compline openings before the code
change.

**Citation.**

- `upstream/web/www/horas/Latin/Tempora/Quad6-4.txt:210-233`
- `upstream/web/www/horas/Latin/Tempora/Quad6-4r.txt:1`
- `upstream/web/www/horas/Latin/Tempora/Quad6-5.txt:204`
- `upstream/web/www/horas/Latin/Tempora/Quad6-5r.txt:1`
- `upstream/web/www/horas/Latin/Tempora/Quad6-6r.txt:28-47`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm4.txt:5`

**Impact.** The shared Roman Triduum Compline family is no longer
blocked on the ordinary `1 Pet 5:8-9` fallback. Thursday / Friday are
now classified cleanly as source-backed Perl bugs, and Holy Saturday
moves deeper into the already-adjudicated Psalm 4 half-verse render
surface instead of remaining a mixed ownership question.

### 2026-04-20 — Pattern: Roman Passiontide Matins Psalm 94 must stay responsorial before the hymn (engine-bug fix)

**Commit.** `4ee2e75`

**Ledger signal.** A shared Roman Matins seam remained across the
Passiontide temporal Sundays in both `Reduced - 1955` and
`Rubrics 1960 - 1960`: `2024-03-17`, `2024-03-24`, and the adjacent
March temporal rows still first diverged inside the invitatory at the
Psalm 94 tail, where Perl had already reopened the responsorial
antiphon structure and moved on to the hymn.

**Root cause.** This was a Phase 3 composition bug. Phase 2 already
selected the correct temporal invitatory source and still ordered Matins
as `invitatory -> hymn -> psalmody`; the compositor simply lacked the
Passiontide `Invitatorium3` materialization that Perl applies for
temporal `Quad[56]` invitatories. That meant the `^`-marked Psalm 94
tail stayed attached to the wrong verse, the penultimate `ant2` repeat
survived before the final antiphon, and the replaced `Gloria omittitur`
formula could disappear because `expandDeferredNodes()` hit the empty
`Revtrans` shadow section before the real `Common/Translate` text.

**Resolution.** `packages/compositor/src/resolve/reference-resolver.ts`
now supports an `Invit3` materialization mode that trims the first
`^`-marked Psalm 94 tail, rewrites `&Gloria` to `Gloria omittitur`, and
drops the redundant final `ant2` repeat before the closing antiphon.
`packages/compositor/src/compose/matins.ts` selects that mode for the
temporal Roman `Passio` invitatory source, and
`packages/compositor/src/resolve/expand-deferred-nodes.ts` now prefers
`Common/Translate` ahead of the empty `Revtrans` `[Gloria omittitur]`
shadow so the omitted-Gloria line survives to emission. Coverage was
locked before and after the fix in:

- `packages/compositor/test/reference-resolver.test.ts`
- `packages/compositor/test/expand-deferred-nodes.test.ts`
- `packages/compositor/test/integration/compose-upstream.test.ts`

**Citation.**

- `upstream/web/cgi-bin/horas/specmatins.pl:101-115`
- `upstream/web/www/horas/Latin/Psalterium/Invitatorium.txt:1-15`
- `upstream/web/www/horas/Latin/Psalterium/Revtrans.txt:13-18`
- `upstream/web/www/horas/Latin/Psalterium/Common/Translate.txt:22-23`

**Impact.** The shared Roman March Matins rows no longer stall at the
false invitatory/hymn boundary. The Roman average matching-prefix
metrics improve to `37.1` (`Reduced - 1955`) and `39.5`
(`Rubrics 1960 - 1960`); `Rubrics 1960 - 1960` now advances into the
already-classified trailing-`‡` antiphon family, while `Reduced - 1955`
moves deeper to the later Lenten Sunday Matins versicle-routing seam
(`V. Memor fui nocte nóminis tui, Dómine.` versus the office's proper
versicle).

### 2026-04-21 — Pattern: Roman Easter Octave minor hours must keep Sunday/festal psalm tables without a lead antiphon (engine-bug fix)

**Commit.** `5ab7026`

**Ledger signal.** The shared Roman Easter Octave frontier on
`2024-03-31` through `2024-04-06` kept stalling before the first psalm
heading in Prime / Terce / Sext / None. Perl advanced straight to the
psalmody, while the compositor emitted an opening `Ant. Allelúja...`
line from the Sunday/festal `Psalmi minor:Tridentinum` table.

**Root cause.** This was a Phase 2 structural bug, not a Phase 3
composition problem. The temporal source files for Easter Sunday and the
inherited octave ferias explicitly pair `Minores sine Antiphona` with
`Psalmi Dominica`, but `selectPsalmodyRoman1960()` still copied the
built-in lead antiphon from the Sunday/festal Tridentinum table row into
the first `PsalmAssignment`. That leaked a psalm-table convenience
string back across the Phase 2 / Phase 3 boundary even though the rule
set had already decided the minor hours were antiphonless.

**Resolution.** `packages/rubrical-engine/src/hours/psalter.ts` now
threads `hourRules.minorHoursSineAntiphona` into the Sunday/festal
minor-hour selector path, so `resolveTridentinumMinorHourAssignments()`
keeps the same psalm selectors but suppresses the table's lead
antiphon when the temporal rules say `Minores sine Antiphona`. Coverage
was locked before and after the fix in:

- `packages/rubrical-engine/test/hours/psalter.test.ts`
- `packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`

**Citation.**

- `upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:7-13`
- `upstream/web/www/horas/Latin/Tempora/Pasc0-3.txt:11-16`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:217-231`

**Impact.** The false Easter-Octave opening-antiphon frontier is gone.
Representative compares now move deeper into two later lanes instead:
Easter Sunday Prime reaches the surviving `Psalmus 117 [2]` table seam,
while shared Roman weekday Prime / Terce rows now first diverge at the
later-block `Ant. Hæc dies * quam fecit Dóminus...` surface. The Roman
average matching-prefix metrics improve to `41.7`
(`Reduced - 1955`) and `44.1` (`Rubrics 1960 - 1960`).

### 2026-04-21 — Pattern: Easter Octave `Capitulum Versum 2` later block (engine-bug, narrowed)

**Commit.** `4944f5d`

**Ledger signal.** After the opening-antiphon fix above, shared Roman Easter
Octave Prime / Terce rows on `2024-03-31` through `2024-04-06` were
still diverging immediately after psalmody. Perl expected the inherited
`Hæc dies` line from `Pasc0-0`, while the compositor either dropped the
whole later block or appended a stray Paschaltide `allelúja` to the
substituted text.

**Root cause.** The office files already carried the reusable structural
rule seam: `Pasc0-0` and its inherited ferias combine `Capitulum Versum
2` with a proper `[Versum 2]`. In Perl, `specials.pl` handles that rule
by replacing the ordinary chapter / responsory / versicle block with the
single inherited `Versum 2` content. Phase 2 had never encoded that
replacement in the `DayOfficeSummary`, so Prime and the minor hours fell
through to empty ordinarium wrappers. Once the Phase 2 routing was
fixed, Phase 3 still treated the substituted chapter like an ordinary
Paschaltide short chapter and appended `, allelúja.` through the shared
`add-alleluia` transform.

**Resolution.** Class `engine-bug`, narrowed at the owning seams only:

- Phase 2 now treats `Capitulum Versum 2` as a structural replacement of
  the later block with the inherited `Versum 2` ref, suppressing the
  now-spurious responsory / versicle slots.
- Phase 3 now leaves antiphon-shaped chapter substitutions alone when
  applying `add-alleluia`, so the inherited `Hæc dies` text survives
  verbatim.
- Coverage was locked in
  `packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`,
  `packages/compositor/test/apply-directives.test.ts`, and
  `packages/compositor/test/integration/compose-upstream.test.ts`.

**Citation.**

- `upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:7-13`
- `upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:105-106`
- `upstream/web/cgi-bin/horas/specials.pl:58-76`

**Impact.** The shared Roman Easter-Octave lane is narrowed cleanly.
Prime and the minor hours now reach the source-backed `Hæc dies` text
instead of dropping straight to the collect, and the compositor no
longer over-decorates that substituted line with a bogus Paschaltide
`allelúja`. That moved the live frontier into the next one-alone
minor-hour oration-wrapper seam, without reopening any non-Easter or
non-Roman family.

### 2026-04-21 — Pattern: Easter Octave one-alone minor-hour oration wrapper (engine-bug, narrowed)

**Commit.** `370d32a`

**Ledger signal.** Shared Roman Prime / Terce / Sext / None on Easter Octave
weekdays after the `Capitulum Versum 2` substitution (`2024-04-01`
through at least `2024-04-03` in both `Reduced - 1955` and
`Rubrics 1960 - 1960`): the collect opened without
`Dómine, exáudi oratiónem meam.` / `Et clamor meus ad te véniat.` /
`Oremus`, and Terce / Sext / None also lost the post-collect
`Conclusio` block.

**Root cause.** Phase 3 engine-bug. Phase 2 already emitted the
structural signal cleanly: `chapter = Versum 2`, `responsory = empty`,
`versicle = empty`, plus the ordinary `oration` / `conclusion` slots.
The missing lines were not stored inside `Tempora/Pasc0-1:[Oratio]`;
they are the common-prayers wrapper the legacy engine composes around
that collect when this one-alone minor-hour shape is active.

**Resolution.** Class `engine-bug`.

- `packages/compositor/src/compose.ts` now recognizes the shared
  one-alone minor-hour shape structurally instead of by civil date.
- The oration slot is rewritten to ordered refs
  `Domine exaudi` → `Oremus` → collect; Prime also appends the
  source-backed post-collect `Domine exaudi` / `Benedicamus Domino`
  bridge inside the same oration unit.
- Terce / Sext / None now synthesize their lost conclusion section from
  ordered refs `Domine exaudi` → `Benedicamus Domino` →
  `Fidelium animae`, which restores the live line stream without adding
  a date-specific compositor hack.
- `packages/compositor/test/integration/compose-upstream.test.ts` locks
  the wrapper seam on `2024-04-01` across both Roman policies.

**Citation.**

- `upstream/web/www/horas/Latin/Tempora/Pasc0-1.txt:7-18`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:89-90`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:158-170`
- `upstream/web/cgi-bin/horas/specials/orationes.pl:185-214`

**Impact.** The shared Roman Easter-Octave one-alone wrapper family is
closed. `2024-04-01` Tertia is now an exact match in both Roman
policies, and the shared weekday Prime rows advance to the deeper,
Prime-only ordinary-oratio routing seam at line `58` instead of failing
at the wrapper boundary. Easter Sunday Prime still exposes its separate
psalm-table family (`Psalmus 117 [2]` vs `Psalmus 118(1-16) [2]`), so
the next tranche should take the repeated weekday Prime collect-routing
seam first and leave Easter Sunday as the adjacent smaller family.

### 2026-04-21 — Pattern: Easter Octave Prime ordinary oration uses the ordinarium collect (engine-bug, narrowed)

**Commit.** `d5b1357`

**Ledger signal.** Shared Roman Prime on Easter Octave days with the
`Capitulum Versum 2` shape (`2024-03-31` through at least
`2024-04-03`, both `Reduced - 1955` and `Rubrics 1960 - 1960`):
after the one-alone wrapper fix, the first weekday Prime divergence
shifted to the collect itself. Perl expected the ordinary Prime oration
`Dómine Deus omnípotens, qui ad princípium hujus diéi nos perveníre
fecísti...`, while the compositor still routed Prime to the temporal
Easter-Octave collect from `Tempora/Pasc0-*:[Oratio]`.

**Root cause.** Phase 2 structure bug with a small Phase 3 follow-on.
This was not a date-led compositor problem. `specials.pl` explicitly
skips the generic `oratio()` routine for Prime outside the Triduum, so
the ordinary Prime oration block in `Ordinarium/Prima.txt` remains in
force even when the office file itself carries a temporal `[Oratio]`.
Phase 2 was still modeling the Easter-Octave Prime slot like Terce /
Sext / None and pointing `summary.hours.prime.slots.oration` at the
temporal office collect.

**Resolution.**

- Phase 2 now routes Easter-Octave Prime under `Capitulum Versum 2` to
  the ordinary Prime collect structurally, as ordered refs
  `oratio_Domine` → `Per Dominum`, while Terce / Sext / None keep the
  temporal collect from the office.
- Phase 3's existing one-alone wrapper helper now accepts ordered-ref
  oration slots as well as single refs, so the corrected Prime slot
  still receives the source-backed `Domine exaudi` / `Oremus` prelude
  and the post-collect `Domine exaudi` / `Benedicamus Domino` bridge
  without any date-specific patching.
- Coverage was locked before and after the fix in
  `packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
  and `packages/compositor/test/integration/compose-upstream.test.ts`.

**Citation.**

- `upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:7-13`
- `upstream/web/www/horas/Ordinarium/Prima.txt:29-42`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:188`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:423`
- `upstream/web/cgi-bin/horas/specials.pl:255-276`

**Impact.** The shared Roman weekday Prime collect-routing family is
closed. `2024-04-01`, `2024-04-02`, and `2024-04-03` now advance past
the ordinary-oration seam to the deeper Prime Martyrologium boundary at
line `65` (`Tértio/Quarto/Prídie Nonas Aprílis ...` expected,
currently `∅`), while Easter Sunday Prime still exposes its separate
psalm-table seam at line `16` (`Psalmus 117 [2]` versus
`Psalmus 118(1-16) [2]`). The next repeated family is therefore the
Prime Martyrologium handoff, not another collect-routing variant.

### 2026-04-21 — Pattern: Easter-Octave Prime Martyrologium handoff + lunar heading (engine-bug, narrowed)

**Commit.** `2e2325e`

**Ledger signal.** After the ordinary-Prime oration fix above, shared
Roman weekday Prime rows on the Easter Octave (`2024-04-01` through at
least `2024-04-03` in both `Reduced - 1955` and
`Rubrics 1960 - 1960`) stopped at the post-oration handoff. Perl
continued into the Prime Martyrologium with the next day's heading
(`Quarto` / `Tértio` / `Prídie Nonas Aprílis ...`), while the
compositor emitted no Prime-after-oration section at all. Once the
section existed, the first line still diverged by one lunar day
(`vicésima quarta` versus source-backed `vicésima tértia` on
`2024-04-02` Prime).

**Root cause.** Split ownership at a shared Roman structural seam:

- Phase 2 still had no typed Prime `martyrology` slot, even though
  `Ordinarium/Prima.txt` continues structurally from the oration bridge
  into `#Martyrologium`.
- Phase 3 had no Prime special-source composer for the next-day
  Martyrologium file, so even a correct slot could not materialize the
  section.
- The first lunar-label port also used a normal civil day-of-year,
  while upstream `specprima.pl` uses `days_to_date(...)[7]`; for modern
  dates that field is the zero-based `localtime` `yday`, so the initial
  port drifted by one lunar ordinal.

**Resolution.** Class `engine-bug`, narrowed at the owning seams only:

- Phase 2 now maps `#Martyrologium` to a real `martyrology` slot and
  gives Prime a typed `prime-martyrology` content kind.
- Phase 3 now composes that slot from the version-correct next-day
  Martyrologium file, appends `Conclmart`, and keeps `Pretiosa` unless
  the source seam says `ex C9`.
- The lunar heading helper now follows the same upstream
  `specprima.pl` / `Date.pm` arithmetic, including the modern zero-based
  `yday` behavior that Perl actually uses.
- Coverage was locked before coding in
  `packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
  and `packages/compositor/test/integration/compose-upstream.test.ts`.

**Citation.**

- `upstream/web/www/horas/Ordinarium/Prima.txt:63-71`
- `upstream/web/cgi-bin/horas/specials.pl:298-301`
- `upstream/web/cgi-bin/horas/specials/specprima.pl:138-225`
- `upstream/web/cgi-bin/horas/specials/specprima.pl:277-351`
- `upstream/web/cgi-bin/DivinumOfficium/Date.pm:259-345`

**Impact.** The shared Roman Prime Martyrologium handoff seam is
closed, and the Roman weekday Prime rows now advance one line deeper
into the same lane. On `2024-04-02` in both Roman policies the first
divergence is now line `66`: Perl expects the separator `_` that begins
the responsorial Martyrologium body, while the compositor currently
falls straight into the first notice text without the source-backed
`v.` / `r.` / separator structure. The next repeated family is
therefore the Prime Martyrologium body-formatting seam, not the
post-oration handoff.

### 2026-04-21 — Pattern: Easter-Octave Prime Martyrologium responsorial body-formatting (engine-bug)

**Commit.** `f82c180`

**Ledger signal.** After the Prime Martyrologium handoff + lunar-heading
fix above, the shared Roman weekday Prime rows (`2024-04-01` through at
least `2024-04-03` in both `Reduced - 1955` and
`Rubrics 1960 - 1960`) stopped at the first Martyrologium body line.
Perl expected the separator `_` and the responsorial stream of
`v.` / `r.` Martyrologium lines, while the compositor flattened the
next-day file into ordinary text lines and silently dropped the source
separator.

**Root cause.** Phase 2 ownership was already correct: Prime had the
typed `martyrology` slot and the correct next-day file selection.
The remaining bug lived entirely in Phase 3:

- `composePrimeMartyrologySection()` expanded the file body but left it
  as plain `text` nodes, so the source-backed responsorial `v.` / `r.`
  shape from `specprima.pl` never materialized.
- the generic section emitter only surfaced `separator` nodes as `_`
  lines for hymn slots, so the Martyrologium underscore line was lost
  even when the source carried it.

**Resolution.** Class `engine-bug`. The owning Phase 3 seam was fixed
without touching Phase 2:

- the Prime Martyrologium body now rewrites the next-day file into the
  same responsorial shape as upstream `specprima.pl`: first line `v.`,
  following notice lines `r.`, with the source underscore preserved as
  its own emitted line.
- `emit/sections.ts` now surfaces `separator` nodes as `_` lines for
  the `martyrology` slot, matching the existing hymn treatment.
- coverage was locked first in
  `packages/compositor/test/compose.test.ts` and then against the live
  corpus in `packages/compositor/test/integration/compose-upstream.test.ts`.

**Citation.**

- `upstream/web/cgi-bin/horas/specials/specprima.pl:188-225`
- `upstream/web/www/horas/Latin/Martyrologium1955R/04-03.txt:1-4`

**Impact.** The shared Roman Prime Martyrologium body-formatting family
is closed. The repeated weekday Prime rows on `2024-04-01` through
`2024-04-03` in both Roman policies now advance to the later shared
post-Martyrologium seam: Perl expects `V. Deus in adjutórium meum
inténde.` while the compositor currently emits nothing after
`Pretiósa`.

### 2026-04-21 — Pattern: Easter-Octave Prime `De Officio Capituli` structural split (engine-bug)

**Commit.** `768ce6a`

**Ledger signal.** After the Prime Martyrologium body-formatting fix,
the repeated Roman weekday Prime rows (`2024-04-01` through at least
`2024-04-03` in both `Reduced - 1955` and `Rubrics 1960 - 1960`) now
stopped immediately after `Pretiósa`. Perl continued with `V. Deus in
adjutórium meum inténde.`, while the compositor emitted nothing after
the Martyrologium tail.

**Root cause.** The owning bug was structural, with one shared heading
extraction seam underneath it:

- `horas/Ordinarium/Prima.txt` encodes the post-Martyrologium block as
  `(rubrica 1960) #De Officio Capituli`, i.e. a heading nested inside a
  conditional wrapper rather than a bare top-level `#Heading`.
- Both the Phase 2 Ordinarium skeleton walker and the Phase 3
  heading-backed reference resolver only split top-level heading nodes,
  so neither layer recognized `De Officio Capituli` as its own
  synthetic section.
- Prime's Martyrologium is already a special Phase 2/3 path composed
  from the next-day Martyrologium file, so the unsplit Ordinarium tail
  was not accidentally emitted elsewhere; it simply disappeared.

**Resolution.** Class `engine-bug`. Fixed at the reusable heading seam
and then flowed through the owning layers:

- `packages/parser/src/parser/heading-sections.ts` now materializes
  synthetic heading sections from legacy `#Heading` streams even when
  the heading lives inside a conditional wrapper.
- `packages/rubrical-engine/src/hours/skeleton.ts` now consumes those
  synthetic heading sections, exposing a typed Prime
  `de-officio-capituli` slot between `martyrology` and
  `lectio-brevis`.
- `packages/compositor/src/resolve/reference-resolver.ts` now uses the
  same helper for heading-backed `Ordinarium/*` references, so the new
  slot resolves without bespoke Prime logic.
- Coverage was locked before the fix in
  `packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
  and `packages/compositor/test/integration/compose-upstream.test.ts`.

**Citation.**

- `upstream/web/www/horas/Ordinarium/Prima.txt:63-78`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:138-150`

**Impact.** The shared Roman Easter-Octave Prime `De Officio Capituli`
family is closed. On `2024-04-01` and `2024-04-02` in both Roman
policies, the first divergence now lands later at line `90`: Perl
expects `Pater Noster dicitur secreto usque ad Et ne nos indúcas in
tentatiónem:`, while the compositor emits the source-backed guillemeted
rubric `« Pater Noster » dicitur secreto usque ad « Et ne nos indúcas
in tentatiónem: »`.

### 2026-04-21 — Pattern: Roman Prime post-Martyrologium secret `Pater Noster` guillemets (rendering-difference)

**Commit.** `f1fecef`

**Ledger signal.** After the Easter-Octave Prime structural fixes
restored the Martyrologium tail and `De Officio Capituli`, the repeated
Roman weekday Prime rows (`2024-04-01` and `2024-04-02` in both
`Reduced - 1955` and `Rubrics 1960 - 1960`) now first diverge at the
secret `Pater Noster` rubric: Perl expects `Pater Noster dicitur
secreto usque ad Et ne nos indúcas in tentatiónem:`, while the
compositor emits `« Pater Noster » dicitur secreto usque ad « Et ne nos
indúcas in tentatiónem: »`.

**Root cause.** This is the same corpus-backed guillemet family already
classified at Roman Matins, not a new Prime composition bug. The Prime
post-Martyrologium path inherits `[Pater secreto]` from
`Psalterium/Common/Rubricae.txt`, and that source rubric itself carries
the guillemets verbatim. The compositor preserves the corpus author's
punctuation; Perl strips it on the rendered comparison surface.

**Resolution.** Class `rendering-difference`. Added the four exact Roman
Prime row adjudications for key-hash `29ec2a3d` on:

- `Reduced - 1955` — Apr `1`, Apr `2`
- `Rubrics 1960 - 1960` — Apr `1`, Apr `2`

**Citation.** `upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:1-2`.

**Impact.** The shared Roman Prime post-Martyrologium guillemet family
is closed without code changes. These rows are now recorded explicitly
as source-backed rendering differences rather than lingering as Prime
unadjudicateds. The live Roman unadjudicated counts drop to `286` under
`Reduced - 1955` and `205` under `Rubrics 1960 - 1960`; the next shared
Roman structural frontier is the Easter-Octave major-hour paschal
antiphon routing lane, first visible at Vespers and immediately
adjacent at Lauds.

### 2026-04-22 — Pattern: Easter-Octave major-hour paschal antiphon routing (engine-bug)

**Commit.** `f7a5e46`

**Ledger signal.** The next shared Roman family after the Prime
post-Martyrologium guillemet adjudication was the Easter-Octave
Lauds/Vespers lead-antiphon seam. On `2024-04-01` in both
`Reduced - 1955` and `Rubrics 1960 - 1960`, Vespers line `6` expected
`Ant. Angelus autem Dómini * descéndit de cælo...` while the compositor
emitted the Sunday psalter `Ant. Dixit Dóminus * Dómino meo...`;
Lauds line `6` expected the same paschal antiphon while the compositor
emitted `Ant. Allelúja, * Dóminus regnávit...`.

**Root cause.** Phase 2 structure bug at a reusable psalmody-decoration
seam, not a compositor text-ordering problem. The Easter-Octave rules in
`Pasc0-*` correctly say `ex Pasc0-0` and `Minores sine Antiphona`.
The engine already inherited `Pasc0-0` for major-hour proper sections,
but `decoratePsalmodyAssignments()` returned early on
`minorHoursSineAntiphona` before it reached the Lauds/Vespers branch.
That leaked a minor-hour-only omission into major hours and dropped the
five proper `Ant Laudes` / `Ant Vespera` refs entirely, so Phase 3 fell
back to the psalter's Sunday major-hour antiphons.

**Resolution.** Class `engine-bug`. Locked the seam first in
`packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
with focused `2024-04-01` / `2024-04-02` Lauds/Vespers expectations for
both Roman policies, then fixed only the owning Phase 2 layer:

- `Minores sine Antiphona` now short-circuits antiphon decoration only
  for Prime / Terce / Sext / None.
- Lauds and Vespers continue to attach inherited
  `horas/Latin/Tempora/Pasc0-0:Ant Laudes` and `:Ant Vespera` refs while
  keeping the same Day0 psalm table underneath.

**Citation.**

- `upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:15-16`
- `upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:99-103`
- `upstream/web/www/horas/Latin/Tempora/Pasc0-1.txt:4-10`
- `upstream/web/www/horas/Latin/Tempora/Pasc0-2.txt:4-10`

**Impact.** The shared Roman Easter-Octave major-hour paschal antiphon
family is closed. Lauds now moves directly to the already-classified
Psalm 99 half-verse Perl-bug seam at line `23`, while Vespers advances
to a new repeated structural boundary at line `95`: Perl expects
`Canticum B. Mariæ Virginis`, and the compositor currently emits the
office collect instead. The next shared Roman unadjudicated family is
therefore the Easter-Octave Vespers Magnificat/oration boundary seam.

### 2026-04-22 — Pattern: Easter-Octave Vespers Magnificat / oration boundary (engine-bug)

**Commit.** `e2d6620`

**Ledger signal.** After the Easter-Octave major-hour paschal antiphon
fix, both Roman policies on `2024-04-01` / `2024-04-02` Vespers first
diverged at line `95`: Perl expected `Canticum B. Mariæ Virginis`,
while the compositor jumped directly from `Ant. Vidéte manus meas...`
to the office collect.

**Root cause.** Cross-package structural gap, not a date-specific Vespers
quirk. `#Canticum: Magnificat` in `Ordinarium/Vespera.txt` only mapped to
`antiphon-ad-magnificat`, so Phase 2 had no typed slot carrying the
Magnificat body itself. Phase 3 therefore had no faithful source-backed
way to emit the Lucan canticle and its repeated antiphon before the
later-block oration seam.

**Resolution.** Class `engine-bug`. Locked the seam first in:

- `packages/rubrical-engine/test/hours/skeleton.test.ts`
- `packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
- `packages/compositor/test/integration/compose-upstream.test.ts`

Then fixed only the owning structural layers:

- `SlotName` now includes `canticle-ad-benedictus`,
  `canticle-ad-magnificat`, and `canticle-ad-nunc-dimittis`.
- `#Canticum:` headings now map to paired antiphon + canticle slots.
- Phase 2 resolves those canticle slots to Psalm231 / Psalm232 / Psalm233
  `__preamble` refs.
- Phase 3 composes the Lucan canticle body, appends `Glória Patri`,
  and repeats the sibling canticle antiphon after the canticle block.

**Citation.**

- `upstream/web/www/horas/Ordinarium/Vespera.txt:23-27`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm232.txt:1-11`
- `docs/adr/013-phase-3-lucan-canticle-slots.md`

**Impact.** The shared Roman Easter-Octave Vespers Magnificat boundary is
closed. The live frontier now lands one seam later on the same rows:
`2024-04-01` / `2024-04-02` Vespers line `110` in both Roman policies now
expects `V. Dómine, exáudi oratiónem meam.` while the compositor jumps
straight to the collect. The next shared Roman family is therefore the
Easter-Octave Vespers oration-prelude seam.

### 2026-04-22 — Pattern: Easter-Octave Vespers oration prelude (engine-bug)

**Commit.** `6b20ebc`

**Ledger signal.** After the Lucan-canticle tranche, both Roman policies on
`2024-04-01` / `2024-04-02` Vespers first diverged at line `110`: Perl
expected `V. Dómine, exáudi oratiónem meam.`, while the compositor jumped
directly from the repeated Magnificat antiphon to the office collect.

**Root cause.** Reusable Phase 3 wrapper gap, not another selection bug.
Phase 2 already exposed the source-correct Easter-Octave Vespers structure:
`canticle-ad-magnificat`, then `oration`, with the ordinary `conclusion`
suppressed from `Ordinarium/Vespera:Conclusio` under 1955/1960. The missing
piece was the shared major-hour collect prelude. The compositor was emitting
the collect body directly for Lauds/Vespers instead of restoring the ordinary
`Domine exaudi` / `Oremus` lines that precede the source-backed oration.

**Resolution.** Class `engine-bug`. Locked the seam first in
`packages/compositor/test/integration/compose-upstream.test.ts`, then fixed
only the Phase 3 composition layer:

- major-hour `oration` slots (`lauds` / `vespers`) now wrap their existing
  refs with `Psalterium/Common/Prayers:Domine exaudi` and `:Oremus`
- the wrapped-oration helper stays generic across `single-ref` and
  `ordered-refs` content, so the fix remains structural rather than
  date-specific

**Citation.**

- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:85-91`
- `packages/compositor/test/fixtures/officium-content-snapshot.pl` live
  compare surface for `2024-04-01/02` Roman Vespers

**Impact.** The shared Roman Easter-Octave Vespers collect-prelude seam is
closed. The live frontier now lands one block later on the same rows:
`2024-04-01` / `2024-04-02` Vespers line `116` in both Roman policies now
expects the ordinary post-oratio `V. Dómine, exáudi oratiónem meam.` opening
of the conclusion block, while the compositor currently stops at `R. Amen.`.
The next shared Roman family is therefore the Easter-Octave Vespers
conclusion seam.

### 2026-04-22 — Pattern: Easter-Octave Vespers conclusion (engine-bug)

**Commit.** `8cd901e`

**Ledger signal.** After the Easter-Octave Vespers oration-prelude tranche,
both Roman policies on `2024-04-01` / `2024-04-02` Vespers first diverged
at line `116`: Perl expected `V. Dómine, exáudi oratiónem meam.`, while the
compositor emitted nothing after the collect's `R. Amen.`.

**Root cause.** Reusable Phase 3 conclusion-wrapper gap, not another Easter
Octave routing bug. Phase 2 already carried a typed `conclusion` slot for
Lauds/Vespers, but the inherited `Ordinarium/Vespera:Conclusio` section
resolves empty under `rubrica 1955` / `rubrica 196` because its ordinary
body is wrapped in the same conditional cluster that suppresses the older
post-Vespers `Pater noster` tail. Perl reconstructs the shortened 1955/1960
post-oratio block from `Psalterium/Common/Prayers`; the compositor had no
parallel structural wrapper and therefore stopped after the collect.

**Resolution.** Class `engine-bug`. Locked the seam first in
`packages/compositor/test/integration/compose-upstream.test.ts`, then fixed
only the owning Phase 3 composition layer:

- `directiveDrivenSlotContent` now recognizes the shared 1955/1960
  Lauds/Vespers `conclusion` shape via `usesWrappedMajorHourConclusion`
- `majorHourConclusionContent` reconstructs the ordinary post-oratio block
  from `Psalterium/Common/Prayers:Domine exaudi`,
  `:Benedicamus Domino` / `:Benedicamus Domino1`, and `:Fidelium animae`
- the wrapper reuses the existing `add-versicle-alleluia` directive to pick
  the Paschaltide `Benedicamus Domino1` form without introducing date-local
  compositor hacks

**Citation.**

- `upstream/web/www/horas/Ordinarium/Vespera.txt:35-50`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:85-90`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:158-170`

**Impact.** The shared Roman Easter-Octave Vespers conclusion seam is
closed. `2024-04-01` / `2024-04-02` Vespers now match exactly in both Roman
policies, and the regenerated ledgers moved to `465` divergent / `284`
unadjudicated rows for `Reduced - 1955` and `461` divergent / `199`
unadjudicated rows for `Rubrics 1960 - 1960`. The next shared Roman family
is no longer another Vespers code seam but the Easter-Octave Lauds Psalm 99
half-verse lane, which now surfaces as an 8-row Roman unadjudicated
adjudication/fanout sweep.

### 2026-04-22 — Pattern: Easter-Octave Lauds Psalm 99 half-verse fanout (perl-bug)

**Commit.** `7508fb4`

**Ledger signal.** After the Easter-Octave Vespers structural fixes cleared
the major-hour Roman frontier, the newly exposed April Lauds rows on
`2024-04-01` / `2024-04-02` (`Reduced - 1955`) and `2024-04-01` through
`2024-04-06` (`Rubrics 1960 - 1960`) all first diverged at Psalm 99 line
`99:3b`: Perl flattened the verse to `... * introíte ...`, while the
compositor preserved `... ‡ introíte ... * ...`.

**Root cause.** Not a new code defect. This is the same source-backed Roman
Lauds Psalm 99 half-verse family already adjudicated earlier in the burn-down.
`Psalm99.txt` still explicitly encodes `99:3b` with `‡ ... *`, and the
compositor keeps that structure while removing the numeric carry marker.
What remained open here was row-key coverage: the previously landed
representative/fanout sweep predated the Easter-Octave Vespers fixes, so
these April rows had never been propagated into the sidecar.

**Resolution.** Class `perl-bug`. Locked the seam for the newly exposed
April surface in `packages/compositor/test/integration/compose-upstream.test.ts`,
then added the missing April row keys directly to
`packages/compositor/test/divergence/adjudications.json`. `adjudications:fanout`
was not sufficient on its own because the generated ledgers only retain the
first 40 divergent rows and these April Lauds rows now sit deeper than that
sample window.

**Citation.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm99.txt:3-5`
- `docs/upstream-issues.md` (`Roman Lauds Psalm 99 half-verse structure is flattened by the Perl render surface`)

**Impact.** The Easter-Octave Lauds Psalm 99 seam is now closed as an
adjudication sweep rather than a code fix, dropping the Roman unadjudicated
counts to `282` for `Reduced - 1955` and `193` for `Rubrics 1960 - 1960`
once the ledgers refresh. The next shared Roman family on the live grouped
surface is the Easter-Octave Prime post-Martyrologium `Pater Noster`
guillemet fanout (`2024-04-03` through `2024-04-05` across both Roman
policies), which should also be an adjudication sweep rather than a new
engine fix.

### 2026-04-22 — Pattern: Roman Prime post-Martyrologium secret `Pater Noster` guillemet fanout through Apr 5 (rendering-difference)

**Commit.** pending tranche commit

**Ledger signal.** After the Easter-Octave Lauds Psalm 99 adjudication
cleared the adjacent April lane, the remaining Roman Prime rows on
`2024-04-03` through `2024-04-05` in both `Reduced - 1955` and
`Rubrics 1960 - 1960` still first diverge on the same secret `Pater
Noster` rubric surface already adjudicated on Apr `1` / Apr `2`: Perl
expects `Pater Noster dicitur secreto usque ad Et ne nos indúcas in
tentatiónem:`, while the compositor emits `« Pater Noster » dicitur
secreto usque ad « Et ne nos indúcas in tentatiónem: »`. Apr `5` moves
one line later (`89` instead of `88`) because the Prime body is one line
longer, but the first expected/actual pair is unchanged.

**Root cause.** Not a new code defect. This is the already-classified
Roman Prime post-Martyrologium guillemet family, and ultimately the same
corpus-backed rubric family seen at Roman Matins. `Psalterium/Common/Rubricae.txt`
still carries the guillemets verbatim; the compositor preserves them and
the Perl comparison surface strips them.

**Resolution.** Class `rendering-difference`. Tightened the focused
Prime upstream test to the late Easter-Octave surface in
`packages/compositor/test/integration/compose-upstream.test.ts`, then
added the six missing Apr `3` through Apr `5` Roman Prime row keys
directly to `packages/compositor/test/divergence/adjudications.json`.
The existing `adjudications:fanout` shortcut was not sufficient here
because these newly exposed rows sit deeper than the generated ledger's
first-40-row sample window.

**Citation.**

- `upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:1-2`
- `docs/upstream-issues.md` (`Roman Easter-Octave Prime preserves the corpus guillemets around Pater Noster`)

**Impact.** The shared Roman Easter-Octave Prime guillemet family is now
closed through Apr `5` without code changes, dropping the Roman
unadjudicated counts to `279` for `Reduced - 1955` and `190` for
`Rubrics 1960 - 1960`. The next highest-leverage shared Roman family on
the live grouped surface is the Christmas-octave Vespers fourth-psalm
routing seam on Dec `25` through Dec `27`, where both policies still
diverge at `Psalmus 129 [4]` vs `Psalmus 112 [4]`.

### 2026-04-22 — Pattern: Christmas-octave Vespers fourth-psalm routing (engine-bug)

**Commit.** pending tranche commit

**Ledger signal.** After the Easter-Octave Prime guillemet fanout, the
next repeated shared Roman frontier was the Christmas-octave Vespers
fourth-psalm seam on Dec `25` through Dec `27` in both `Reduced - 1955`
and `Rubrics 1960 - 1960`: Perl expected `Psalmus 129 [4]`, while the
compositor was still emitting `Psalmus 112 [4]` from the generic Sunday
`Day0 Vespera` table.

**Root cause.** Phase 2 was already decorating major-hour psalmody with
the proper `Ant Vespera 3` refs, but it left the generic `Psalmi major`
psalm refs in place. The selection path also only harvested inline
`text` rows, so it missed the parser's real `psalmRef` nodes and could
not follow unresolved plain `@Sancti/12-25` section references when the
engine loaded the corpus with `resolveReferences: false`. That left Dec
`26` generic and let Dec `27` fall through into the inherited `C1`
family instead of the Christmas-octave source. At the same time, the
harvest must **not** follow transformed references like
`Sancti/08-15:Ant Laudes -> Sancti/08-15t:Ant Vespera:s/;;.*//g`,
because those intentionally strip the psalm payload and should stay on
the Day0 psalter.

**Resolution.** Fixed in Phase 2, not Phase 3. `packages/rubrical-engine/src/hours/apply-rule-set.ts`
now derives major-hour psalm refs from parsed `psalmRef` nodes in
`Ant Laudes` / `Ant Vespera` / `Ant Vespera 3`, follows only
substitution-free same-header reference chains through `resolveOfficeFile`,
and only overwrites still-generic `Psalmi major` refs. Tightened the
ownership seam with:

- `packages/rubrical-engine/test/hours/vespers.test.ts`
- `packages/rubrical-engine/test/integration/temporal-sunday-minor-antiphons.test.ts`
- `packages/rubrical-engine/test/integration/january-selection.test.ts`
- `packages/rubrical-engine/test/integration/phase-2g-upstream.test.ts`
- `packages/compositor/test/integration/compose-upstream.test.ts`

**Citation.**

- `upstream/web/www/horas/Latin/Sancti/12-25.txt:4-12`
- `upstream/web/www/horas/Latin/Sancti/12-26.txt:8-15`
- `upstream/web/www/horas/Latin/Sancti/12-27.txt:8-12`
- `upstream/web/www/horas/Latin/Sancti/01-01.txt:9-20`
- `upstream/web/www/horas/Latin/Tempora/Epi1-0.txt:13-24,384-389`
- `upstream/web/www/horas/Latin/Sancti/08-15.txt:235-237`
- `upstream/web/www/horas/Latin/Sancti/08-15t.txt:7-16`

**Impact.** The shared Roman Christmas-octave fourth-psalm family is
closed. Dec `25` / `26` / `27` Vespers no longer fail at
`Psalmus 129 [4]`, and Jan `1/7` Roman Vespers legitimately advance
past the old second-psalm `perl-bug` seam into deeper later-block
surface. After the full ledger refresh, Roman divergent-hour totals stay
`465` / `461`, exact matches stay `23` / `27`, average matching prefix
improves to `43.0` / `45.3`, and the unadjudicated counts move to
`288` / `195` because those newly exposed Jan `7` later-block seams are
not yet classified. The next shared Roman family should be the
Christmas-octave Vespers fifth-slot/later-block split, starting with Dec
`27` second-Vespers fifth-psalm precedence (`Psalmus 131 [5]` vs
`Psalmus 116 [5]`); the adjacent Dec `26` `no Psalm5` boundary and Dec
`25` chapter/hymn seam now sit immediately underneath it.

### Open pattern backlog

The following families remain open and have not yet received their own
chronological entry:

- **Compline guillemets** — compositor emits `«Pater Noster»`, Perl
  emits `Pater Noster`. Corpus source
  (`upstream/.../Common/Rubricae.txt:129`) carries the guillemets.
  Preliminary class: `rendering-difference` — both renderings are
  defensible; the compositor matches the corpus author's formatting.
- **Divino Afflatu Compline `Jube, Dómine` guillemets** — compositor
  preserves `«Jube, Dómine, benedícere;»`, Perl strips the guillemets.
  Corpus source (`upstream/.../Common/Rubricae.txt:168`) carries the
  guillemeted rubric. Preliminary class: `rendering-difference`.
- **Reduced 1955 Compline cross glyph** — Perl renders the source token
  `+++` as `✙︎` in `V. Convérte nos ✙︎ Deus...`, while the compositor
  currently emits `+`. Corpus source
  (`upstream/.../Common/Prayers.txt:52`) confirms this is a glyph-level
  rendering choice, not a selection bug. Preliminary class:
  `rendering-difference`.

The Compline benediction-verb issue is already adjudicated in
[ADR-012](../../../../docs/adr/012-compline-benediction-verb.md) and is
tracked separately from this Phase 3 per-pattern backlog.

## See also

- [ADR-011 — Divergence adjudication protocol](../../../../docs/adr/011-phase-3-divergence-adjudication.md)
- [Phase 3 design §19.8](../../../../docs/phase-3-composition-engine-design.md)
- [docs/upstream-issues.md](../../../../docs/upstream-issues.md)
