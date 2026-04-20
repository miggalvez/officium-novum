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

## Entries

### 2026-04-18 — 3h kickoff: baseline regeneration

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

### Pattern catalogue (pending per-pattern entries)

The following patterns remain open after the fixes above and will each
get their own `## Entry` block as they are adjudicated:

- **Matins Invitatorium Psalm 94 responsorial structure** —
  compositor emits the invitatory antiphon once, then the hymn. Perl
  interleaves the antiphon responsorially with each section of Psalm
  94. Preliminary class: `engine-bug`; high-effort fix deferred to a
  follow-up in this sub-phase or Phase 4.
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
- **Compline benediction verb** — already adjudicated in
  [ADR-012](../../../../docs/adr/012-compline-benediction-verb.md) as
  `engine-bug` (duplicate-header resolution in Phase 1). Not yet fixed.
- **Matins hymn after invitatory (Rubrics 1960 ordering)** —
  compositor emits `invitatory → hymn → psalmody`; Perl shows the
  invitatory antiphon interleaved with psalm 94 before the hymn. May
  collapse once the Invitatorium Psalm 94 responsorial pattern is
  fixed; preliminary class: `engine-bug`.

## See also

- [ADR-011 — Divergence adjudication protocol](../../../../docs/adr/011-phase-3-divergence-adjudication.md)
- [Phase 3 design §19.8](../../../../docs/phase-3-composition-engine-design.md)
- [docs/upstream-issues.md](../../../../docs/upstream-issues.md)
