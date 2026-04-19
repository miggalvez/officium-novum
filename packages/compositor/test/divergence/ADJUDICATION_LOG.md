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
