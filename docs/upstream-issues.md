# Upstream Perl Issues

This document tracks divergences between Officium Novum and the legacy
Divinum Officium Perl renderer that are classified as `perl-bug` under
the adjudication protocol in [ADR-011](./adr/011-phase-3-divergence-adjudication.md).

## Protocol

Every entry below represents an adjudicated `perl-bug` family from
`packages/compositor/test/divergence/adjudications.json` — i.e., a set
of stable divergence rows where Officium Novum matches the primary
source (Ordo Recitandi, governing rubrical book, or the live corpus file
itself) and the legacy Perl renderer diverges.

Each entry must cite:

- The affected date / Hour / policy row keys.
- The primary source establishing the expected behaviour.
- A brief reproduction recipe using the `compare:phase-3-perl` harness.

These entries are intended as upstream bug reports; if the Divinum
Officium project accepts and fixes any of them, remove the corresponding
entry here and re-run the adjudication harness.

## Current entries

### 2026-04-19 — Divino Afflatu opening rubric prose is dropped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Divino Afflatu - 1954`, the compositor emits opening
rubric prose such as `Deinde, clara voce, dicitur Versus:` and
`Secus absolute incipiuntur, ut sequitur:` because those lines are
present verbatim in the upstream Latin corpus. The legacy Perl
comparison surface drops them and advances directly to the next visible
text, which creates shallow divergences across Matins, Lauds, Prime,
Terce, Sext, None, and Vespers.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:50-65`

Relevant sections:
- `Secus absolute Parvum`
- `Clara voce`
- `Secus absolute`

These sections explicitly contain the rubric sentences that the
compositor preserves.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Divino Afflatu - 1954"
```

Then inspect the first divergent rows in
`packages/compositor/test/divergence/divino-afflatu-2024.md`. The Perl
side shows `_` or jumps to `Nocturnus I`, while the compositor shows the
source-backed rubric prose from `Common/Rubricae.txt`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Divino Afflatu - 1954 | 2024-01-01 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-01 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-01 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Matins | `f8b9b84f` |
| Divino Afflatu - 1954 | 2024-01-06 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-06 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-06 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-07 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-07 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-13 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-13 | Vespers | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Matins | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Lauds | `371d9deb` |
| Divino Afflatu - 1954 | 2024-01-14 | Prime | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Terce | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Sext | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | None | `919de480` |
| Divino Afflatu - 1954 | 2024-01-14 | Vespers | `919de480` |

### 2026-04-19 — Rubrics 1960 January fallback-hymn doxology substitution is dropped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Rubrics 1960 - 1960`, the January Roman minor Hours
correctly substitute the Christmas, Epiphany, or Holy Family doxology
when the office falls back to the generic `Prima Special` or
`Minor Special` hymn. The compositor now emits those source-backed
stanzas, but the legacy Perl comparison surface still shows the default
fallback closes (`Deo Patri sit glória,` / `Præsta, Pater piíssime,`),
creating stable January divergences at Prime / Terce / Sext / None.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-8`
- `upstream/web/www/horas/Latin/Tempora/Epi1-0.txt:56-67`
- `upstream/web/www/horas/Latin/Psalterium/Doxologies.txt:1-20`
- `upstream/web/www/horas/Latin/Psalterium/Special/Prima Special.txt:100-109`
- `upstream/web/www/horas/Latin/Psalterium/Special/Minor Special.txt:664-672`
- `docs/phase-2-rubrical-engine-design.md:1469`

These sources together establish that:

- Epiphany carries `Doxology=Epi`.
- Holy Family provides its own local `[Doxology]`.
- the fallback hymns still carry the default doxology stanza and
  therefore require substitution.
- the Roman Phase 2/3 design explicitly expects hymn resolution to
  apply `celebrationRules.doxologyVariant` when present.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960"
```

Then inspect the January Prime / Terce / Sext / None rows in
`packages/compositor/test/divergence/rubrics-1960-2024.md`. The Perl
side shows the default fallback doxology line, while the compositor
shows the source-backed January substitution.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-01-01 | Prime | `c52cc2ef` |
| Rubrics 1960 - 1960 | 2024-01-01 | Terce | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-01 | Sext | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-01 | None | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-06 | Prime | `c52cc2ef` |
| Rubrics 1960 - 1960 | 2024-01-06 | Terce | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-06 | Sext | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-06 | None | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-07 | Prime | `6b019b6f` |
| Rubrics 1960 - 1960 | 2024-01-07 | Terce | `274511e7` |
| Rubrics 1960 - 1960 | 2024-01-07 | Sext | `274511e7` |
| Rubrics 1960 - 1960 | 2024-01-07 | None | `274511e7` |
| Rubrics 1960 - 1960 | 2024-01-13 | Prime | `c52cc2ef` |
| Rubrics 1960 - 1960 | 2024-01-13 | Terce | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-13 | Sext | `318cf47a` |
| Rubrics 1960 - 1960 | 2024-01-13 | None | `318cf47a` |

### 2026-04-19 — Reduced 1955 January minor Hours fall back to weekday psalter antiphons in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Reduced - 1955`, the January `1` and `13`
minor-Hour rows are now source-backed on the Officium Novum side: the
winning office files explicitly carry `Antiphonas Horas`, so the lead
minor-Hour antiphons come from the office's own `Ant Laudes` selectors.
The legacy Perl comparison surface instead falls back to the weekday
psalter antiphons (`Ínnocens mánibus`, `Illuminátio mea`, `Exaltáre`,
etc.).

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/01-01.txt:7-20`
- `upstream/web/www/horas/Latin/Sancti/12-25.txt:1-6`
- `upstream/web/www/horas/Latin/Sancti/01-13.txt:1-20`
- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-20`
- `upstream/web/www/horas/Help/Rubrics/1955.txt:141-147`
- `docs/file-format-specification.md:638`

These sources establish that:

- Jan `1` remains a Christmas-octave office via `ex Sancti/12-25`.
- Jan `13` is said "as at present on the Octave of the Epiphany" and
  inherits Epiphany via `ex Sancti/01-06`.
- `Antiphonas Horas` means the office's proper antiphons govern the
  Hours, so the lead antiphon at Prime / Terce / Sext / None stays with
  the office instead of falling back to the weekday psalter.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955"
```

Then inspect the January `1` and `13` Prime / Terce / Sext / None rows
in `packages/compositor/test/divergence/reduced-1955-2024.md`. The Perl
side shows weekday psalter antiphons, while the compositor shows the
source-backed office antiphons selected through `Antiphonas Horas`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-01 | Prime | `52bc4c6c` |
| Reduced - 1955 | 2024-01-01 | Terce | `5f5913ea` |
| Reduced - 1955 | 2024-01-01 | Sext | `9d5ea204` |
| Reduced - 1955 | 2024-01-01 | None | `477e6920` |
| Reduced - 1955 | 2024-01-13 | Prime | `cd271387` |
| Reduced - 1955 | 2024-01-13 | Terce | `766b1f47` |
| Reduced - 1955 | 2024-01-13 | Sext | `ab7f4509` |
| Reduced - 1955 | 2024-01-13 | None | `b32a46de` |

### 2026-04-19 — Rubrics 1960 Jan 6 Vespers is switched to Holy Family in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Rubrics 1960 - 1960`, Jan `6` Vespers should remain
with Epiphany's own antiphons. Officium Novum now keeps
`Ante lucíferum génitus...` because the higher-class Epiphany office
prevails in concurrence. The legacy Perl comparison surface instead
switches to Holy Family's first-Vespers antiphon `Jacob autem...`.

**Primary source.**

- `upstream/web/www/horas/Help/Rubrics/General Rubrics.html:74-82, 465-469`
- `upstream/web/www/horas/Help/Rubrics/Tables 1960.txt:49, 75-79, 118-121`
- `upstream/web/www/horas/Latin/Sancti/01-06.txt:1-18`

These sources establish that Epiphany is a feast of the 1st class while
Holy Family is a feast of the 2nd class, and in concurrence the Vespers
of the higher-class office prevail.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960"
```

Then inspect the Jan `6` Vespers row in
`packages/compositor/test/divergence/rubrics-1960-2024.md`. The Perl
side shows Holy Family's first-Vespers antiphon, while the compositor
shows Epiphany's own `Ant Vespera` as required by the 1960 concurrence
rules.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-01-06 | Vespers | `3965f59d` |

### 2026-04-19 — Roman Lauds Psalm 99 half-verse structure is flattened by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both `Reduced - 1955` and `Rubrics 1960 - 1960`, the
January Roman Lauds rows for Jan `1`, `6`, `7`, and `13` first diverge
at Psalm 99 line `99:3b`. The compositor preserves the corpus
half-verse structure `... ‡ ... * ...` while removing the numeric carry
marker; the Perl comparison surface flattens the same source line to a
single `*` split.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm99.txt:3-5`

In particular, line `99:3b` explicitly reads:
`Pópulus ejus, et oves páscuæ ejus: ‡ (4a) introíte portas ejus in confessióne, * átria ejus in hymnis: confitémini illi.`

**Reproduction.**
Run either:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955"
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960"
```

Then inspect the January Lauds rows in the corresponding divergence
ledger. Perl shows a flattened `*` split, while the compositor shows the
source-backed `‡ ... *` half-verse structure from `Psalm99.txt`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-01 | Lauds | `2af868c1` |
| Reduced - 1955 | 2024-01-06 | Lauds | `2af868c1` |
| Reduced - 1955 | 2024-01-07 | Lauds | `2af868c1` |
| Reduced - 1955 | 2024-01-13 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-01-01 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-01-06 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-01-07 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-01-13 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-01-14 | Lauds | `2af868c1` |

### 2026-04-19 — Roman Jan 14 Sunday Prime skips Psalm 53 in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both `Reduced - 1955` and `Rubrics 1960 - 1960`,
Jan `14` Prime now first diverges at the opening psalm heading. The
compositor emits the source-backed `Psalmus 53 [1]`, while the Perl
comparison surface skips directly to `Psalmus 117 [1]`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:218`

The `Tridentinum` Sunday Prime row explicitly lists:
`53,117,118(1-16),118(17-32)`.

**Reproduction.**
Run either:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955"
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960"
```

Then inspect the Jan `14` Prime row in the corresponding divergence
ledger. Perl starts at `Psalmus 117 [1]`, while the compositor surfaces
the source-backed leading Psalm 53 heading from the `Tridentinum` row.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-14 | Prime | `5531f29c` |
| Rubrics 1960 - 1960 | 2024-01-14 | Prime | `5531f29c` |

### 2026-04-19 — Reduced 1955 Jan 14 Sunday psalter antiphon surface is collapsed by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Reduced - 1955`, Jan `14` `Lauds`, `Terce`,
`Sext`, `None`, and `Vespers` now all expose the same source-backed
Sunday psalter surface: full Day0 psalter-major openings at `Lauds` and
`Vespers`, and full keyed Sunday minor-hour antiphons at `Terce`,
`Sext`, and `None`. The legacy Perl render surface abbreviates these to
generic `Ant. Allelúja.` or incipit-only forms such as `Ant. Dixit
Dóminus. ‡`.

**Primary source.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:1-6`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:17-19,33-35,49-51,227-231`

These sources establish that the Sunday Day0 Lauds/Vespers wrappers and
the keyed Sunday minor-hour sections carry the full antiphon text that
the compositor now emits.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955"
```

Then inspect the Jan `14` `Lauds`, `Terce`, `Sext`, `None`, and
`Vespers` rows in
`packages/compositor/test/divergence/reduced-1955-2024.md`. Perl
abbreviates the Sunday psalter antiphons; the compositor shows the
source-backed full Day0/keyed surface.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-14 | Lauds | `a4224c0e` |
| Reduced - 1955 | 2024-01-14 | Terce | `50fad344` |
| Reduced - 1955 | 2024-01-14 | Sext | `5e2b4bef` |
| Reduced - 1955 | 2024-01-14 | None | `f178bdcc` |
| Reduced - 1955 | 2024-01-14 | Vespers | `557f2156` |

### 2026-04-19 — Rubrics 1960 Jan 14 Vespers gains an unsupported trailing `‡` in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Rubrics 1960 - 1960`, the remaining Jan `14`
`Vespers` opening divergence is punctuation-only. The Day0 Sunday source
antiphon is `Dixit Dóminus * Dómino meo: Sede a dextris meis.` without a
trailing continuation marker. The compositor preserves that corpus text;
the Perl comparison surface appends an unsupported trailing `‡`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960"
```

Then inspect the Jan `14` `Vespers` row in
`packages/compositor/test/divergence/rubrics-1960-2024.md`. Perl adds a
trailing `‡` to the opening antiphon; the compositor preserves the
source-backed Day0 `Vespera` text without that marker.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-01-14 | Vespers | `019555e4` |

### 2026-04-19 — Roman Jan 1/7 Vespers skips Psalm 110 in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both `Reduced - 1955` and `Rubrics 1960 - 1960`,
Jan `1` and Jan `7` Vespers now first diverge at the second psalm
heading. The compositor emits the source-backed `Psalmus 110 [2]`, while
the Perl comparison surface skips ahead to `Psalmus 112 [2]`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`

The Roman Sunday `Day0 Vespera` table explicitly lists:
`109,110,111,112,113`.

**Reproduction.**
Run either:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --hour Vespers
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --hour Vespers
```

Then inspect the Jan `1` / `7` Vespers rows in the corresponding
divergence ledger. Perl shows `Psalmus 112 [2]`; the compositor shows
the source-backed second-slot heading `Psalmus 110 [2]`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-01 | Vespers | `22de27ef` |
| Reduced - 1955 | 2024-01-07 | Vespers | `22de27ef` |
| Rubrics 1960 - 1960 | 2024-01-01 | Vespers | `22de27ef` |
| Rubrics 1960 - 1960 | 2024-01-07 | Vespers | `22de27ef` |

### 2026-04-19 — Roman Epiphany-octave Vespers loses the Psalm 116 override in the Perl render surface

**Classification.** `perl-bug`

**Summary.** `Reduced - 1955` Jan `6/13` Vespers and `Rubrics 1960 -
1960` Jan `13` Vespers now first diverge at the fifth psalm heading.
The compositor emits the source-backed `Psalmus 116 [5]`, while the
Perl comparison surface falls back to `Psalmus 113 [5]`.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-11`
- `upstream/web/www/horas/Latin/Sancti/01-13.txt:1-15`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`

These sources establish that Epiphany explicitly sets `Psalm5
Vespera=116`, and Jan `13` inherits the same rule set by
`ex Sancti/01-06`.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --hour Vespers
```

Then inspect the affected Jan `6/13` Roman Vespers rows in the
corresponding divergence ledgers. Perl shows the unspecialized Day0
fifth heading `Psalmus 113 [5]`; the compositor keeps the source-backed
override `Psalmus 116 [5]`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-06 | Vespers | `39846534` |
| Reduced - 1955 | 2024-01-13 | Vespers | `39846534` |
| Rubrics 1960 - 1960 | 2024-01-13 | Vespers | `39846534` |

### 2026-04-19 — Rubrics 1960 Jan 14 minor hours gain underscore separators around the short responsory in the Perl render surface

**Classification.** `perl-bug`

**Summary.** After the Jan `14` `Rubrics 1960` minor-hour fallback fix,
`Terce`, `Sext`, and `None` now correctly emit the Sunday chapter,
short responsory, versicle, and oration. The remaining first divergence
is a literal `_` line that the Perl comparison surface inserts before
the short responsory. The source-backed compositor output begins
directly with the `R.br.` line.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Special/Minor Special.txt:1-20,36-50,66-80`

These Sunday later-block sections contain the chapter, `R.br.` short
responsory, and versicle directly. They do not contain underscore-only
separator lines.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-14 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-14 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-14 --hour Nona
```

Each row now first diverges on `expected="_"` versus the compositor's
source-backed `R.br.` opening line.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-01-14 | Terce | `89c6190b` |
| Rubrics 1960 - 1960 | 2024-01-14 | Sext | `bc17de3d` |
| Rubrics 1960 - 1960 | 2024-01-14 | None | `4a1aadd8` |

### 2026-04-19 — Reduced 1955 Jan 6/7 minor hours keep the office's proper lesson and short responsories while Perl leaves the later block absent

**Classification.** `perl-bug`

**Summary.** After the Reduced 1955 Jan `6/7` later-block fix, the
first divergence for these hours moved to the actual office-backed
later-block material. Jan `6` Prime now emits the Epiphany
`[Lectio Prima]` citation `Isa 60:6`, and Jan `6/7`
`Terce`/`Sext`/`None` now emit the office's own `R.br.` short
responsories. The Perl comparison surface instead keeps the weekday
Prime citation or leaves underscore-only separators where those proper
short responsories should begin.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/01-06.txt:266-322`
- `upstream/web/www/horas/Latin/Tempora/Epi1-0.txt:335-381`

These sources explicitly provide the Epiphany / Holy Family
`[Lectio Prima]`, `Responsory Breve Tertia`, `Capitulum Sexta`,
`Responsory Breve Sexta`, `Capitulum Nona`, and `Responsory Breve Nona`
sections that the compositor now emits.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-06 --hour Prime
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-06 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-06 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-06 --hour Nona
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-07 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-07 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-07 --hour Nona
```

The Jan `6` Prime row now first differs at `1 Tim. 1:17` versus
`Isa 60:6`, while the Jan `6/7` `Terce`/`Sext`/`None` rows now first
differ at `expected="_"` versus the source-backed `R.br.` opening
lines.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-06 | Prime | `5b39cf70` |
| Reduced - 1955 | 2024-01-06 | Terce | `803ba4ab` |
| Reduced - 1955 | 2024-01-06 | Sext | `4868da5c` |
| Reduced - 1955 | 2024-01-06 | None | `e17600d7` |
| Reduced - 1955 | 2024-01-07 | Terce | `fbcd352c` |
| Reduced - 1955 | 2024-01-07 | Sext | `bae99624` |
| Reduced - 1955 | 2024-01-07 | None | `373eea90` |

### 2026-04-20 — Roman Jan 13 Matins still shows the suppressed opener in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both `Reduced - 1955` and `Rubrics 1960 - 1960`,
Jan `13` Matins now opens directly at `Nocturnus I` in Officium Novum.
The legacy Perl comparison surface still begins with `V. Dómine, lábia
+ mea apéries.` even though the inherited Epiphany Rule suppresses the
Matins opener wrapper.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/01-13.txt:1-13`
- `upstream/web/www/horas/Latin/Sancti/01-06.txt:4-8`

These sources establish that Jan `13` inherits Epiphany by
`ex Sancti/01-06;`, and the inherited Rule explicitly says `Omit ad
Matutinum Incipit Invitatorium Hymnus`.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-13 --hour Matins
```

The Roman `1955` and `1960` rows first diverge at line `1`: Perl keeps
`V. Dómine, lábia + mea apéries.`, while the compositor begins at the
source-backed `Nocturnus I`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-13 | Matins | `74e956ed` |
| Rubrics 1960 - 1960 | 2024-01-13 | Matins | `74e956ed` |

### 2026-04-20 — Roman Jan 6/14 Matins preserve the corpus guillemets around `Pater Noster`

**Classification.** `rendering-difference`

**Summary.** After the January Matins checkpoint advanced Jan `6` and
Reduced `1955` Jan `14` past their former boundary seams, the remaining
Roman rows now land on the same pre-lesson rubric surface already seen
elsewhere: Perl strips the guillemets in `Pater Noster dicitur secreto
usque ad Et ne nos indúcas in tentatiónem:`, while the compositor
preserves the corpus punctuation `« Pater Noster » ... « Et ne nos
indúcas in tentatiónem: »`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:1-2`

This rubric sentence carries the guillemets in the source itself, so the
Perl/compositor difference is punctuation-only rather than a
liturgical-content disagreement.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-06 --hour Matins
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-14 --hour Matins
```

The affected Roman rows now first diverge on the guillemeted `Pater
Noster` rubric surface.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-06 | Matins | `29ec2a3d` |
| Reduced - 1955 | 2024-01-14 | Matins | `29ec2a3d` |
| Rubrics 1960 - 1960 | 2024-01-06 | Matins | `29ec2a3d` |

### 2026-04-20 — Rubrics 1960 Jan 14 Matins gains an unsupported trailing `‡` in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Rubrics 1960 - 1960`, the remaining Jan `14`
Matins divergence is now punctuation-only. The Day0 psalter source gives
the third-nocturn antiphon as `Ut quid, Dómine, * recessísti longe?`
without a trailing `‡`. The compositor preserves that corpus text;
Perl appends an unsupported trailing continuation marker.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt:12-15`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-01-14 --hour Matins
```

The Rubrics `1960` row now first diverges at the third-nocturn antiphon
surface only: Perl expects a trailing `‡`, while the compositor keeps
the source-backed text without it.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-01-14 | Matins | `57b37f6e` |

### 2026-04-20 — Roman Quad-Sunday Prime omits source-backed psalm units in the Perl render surface

**Classification.** `perl-bug`

**Summary.** On Roman `Quad*` Sundays, the `Psalmi minor` source table
defines a dedicated Prime row
`Prima Dominica SQP=;;53,92,118(1-16),118(17-32)`. After fixing the
Phase 2 selector seam to honor that row, Officium Novum emits the
source-backed sequence while Perl still drops psalm units:

- `Reduced - 1955` skips the opening Psalm 53 and starts at
  `Psalmus 92 [1]`.
- `Rubrics 1960 - 1960` skips Psalm 92 and advances directly to
  `Psalmus 118(1-16) [2]`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:219`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-01-28 --hour Prime
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-01-28 --hour Prime
```

The Reduced row first diverges at `Psalmus 92 [1]` (Perl) vs
`Psalmus 53 [1]` (source-backed compositor), while the Rubrics 1960 row
first diverges at `Psalmus 118(1-16) [2]` (Perl) vs
`Psalmus 92 [2]` (source-backed compositor).

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-28 | Prime | `2e28d92b` |
| Rubrics 1960 - 1960 | 2024-01-28 | Prime | `67634c25` |

### 2026-04-20 — Roman 1955/1960 Triduum Thursday-Friday Compline keeps the pre-1955 special block in Perl

**Classification.** `perl-bug`

**Summary.** On Holy Thursday and Good Friday under the Roman `1955`
and `1960` policies, the compositor now follows the temporal
`Special Completorium` source block directly. That source explicitly
collapses the older long block to the short `Vísita, quǽsumus...`
close for `rubrica 1955` / `rubrica 1960`, but the legacy Perl render
surface still opens with the older heading `Special Completorium`.

**Primary source.**

- `upstream/web/www/horas/Latin/Tempora/Quad6-4.txt:210-233`
- `upstream/web/www/horas/Latin/Tempora/Quad6-4r.txt:1`
- `upstream/web/www/horas/Latin/Tempora/Quad6-5.txt:204`
- `upstream/web/www/horas/Latin/Tempora/Quad6-5r.txt:1`

These sources establish that:

- Holy Thursday's `Special Completorium` carries the explicit rubric
  `(sed rubrica 1955 aut rubrica 1960 loco horum versuum dicuntur)`
  before the shortened `Vísita, quǽsumus...` close.
- the Roman `r` variant files for `1955/1960` inherit those temporal
  sections by preamble.
- Good Friday inherits Holy Thursday's special Compline section through
  `@Tempora/Quad6-4::s/usque ad mortem/usque ad mortem, mortem autem crucis/`,
  so the same short 1955/1960 close governs there too.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-03-28 --hour Compline
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-03-29 --hour Compline
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-03-28 --hour Compline
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-03-29 --hour Compline
```

Each row first diverges at `Special Completorium` (Perl) vs the
source-backed short `Vísita, quǽsumus...` block (compositor).

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-03-28 | Compline | `fa4d64f6` |
| Reduced - 1955 | 2024-03-29 | Compline | `fa4d64f6` |
| Rubrics 1960 - 1960 | 2024-03-28 | Compline | `fa4d64f6` |
| Rubrics 1960 - 1960 | 2024-03-29 | Compline | `fa4d64f6` |

### 2026-04-20 — Roman psalm half-verse `‡` markers are flattened by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Across Roman `1955` and `1960` rows, the compositor
preserves source-backed half-verse structure (`‡ ... *`) while Perl
flattens those same lines to single-asterisk boundaries. This now
surfaces as a repeated family on Psalms `62`, `4`, `124`, `114`, and
late-surfacing `99` rows under `Rubrics 1960 - 1960`.

**Primary source.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm62.txt:3`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm4.txt:5`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm124.txt:2`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm114.txt:5`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm99.txt:3-5`

Each cited source line carries an explicit `‡` before the `*` split.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-03-30 --hour Matins
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-01-28 --hour Lauds
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-03-26 --hour Vespers
```

The Perl side flattens `‡ ... *` to a single `*`; compositor output
stays source-backed.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-03-30 | Matins | `89cb274b` |
| Rubrics 1960 - 1960 | 2024-01-28 | Lauds | `9fbc4e11` |
| Rubrics 1960 - 1960 | 2024-03-30 | Matins | `89cb274b` |
| Rubrics 1960 - 1960 | 2024-03-26 | Vespers | `b1fc00bf` |
| Rubrics 1960 - 1960 | 2024-03-25 | Vespers | `839eeb27` |
| Rubrics 1960 - 1960 | 2024-05-09 | Lauds | `2af868c1` |

### 2026-04-20 — Divino Afflatu Epiphany-octave Matins still renders a suppressed opener in Perl

**Classification.** `perl-bug`

**Summary.** Under `Divino Afflatu - 1954`, Epiphany-octave Matins rows
still show `secreto` in the Perl render surface, while Officium Novum
opens directly at `Nocturnus I`.

**Primary source.**
`upstream/web/www/horas/Latin/Sancti/01-06.txt:4-8`

The Epiphany Rule explicitly includes
`Omit ad Matutinum Incipit Invitatorium Hymnus`, so the pre-nocturn
opener is source-suppressed and the compositor's `Nocturnus I` opening
is the expected source-backed behavior.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Divino Afflatu - 1954" --date 2024-01-06 --hour Matins
pnpm -C packages/compositor compare:phase-3-perl -- --version "Divino Afflatu - 1954" --date 2024-01-13 --hour Matins
```

The affected rows first diverge at `secreto` (Perl) vs `Nocturnus I`
(source-backed compositor).

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Divino Afflatu - 1954 | 2024-01-06 | Matins | `e66d7177` |

## See also

- [ADR-011 — Phase 3 divergence adjudication](./adr/011-phase-3-divergence-adjudication.md)
- [ADR-012 — Compline benediction verb disposition](./adr/012-compline-benediction-verb.md)
- [Phase 3 composition engine design §15 — Validation Strategy](./phase-3-composition-engine-design.md)
