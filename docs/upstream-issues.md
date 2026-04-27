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

### 2026-04-26 — Saturday Office BVM Prime lesson is ignored in Perl

**Classification.** `perl-bug`

**Summary.** On Reduced 1955 Jul `6`, the Saturday Office of the BVM
uses its Marian common Prime lesson `Sir 24:19-20`. Perl's comparison
surface keeps the ordinary Prime chapter `1 Tim. 1:17`.

**Primary source.**
`upstream/web/www/horas/Latin/Commune/C10.txt:93-94` and
`upstream/web/www/horas/Latin/Commune/C11.txt:313-315`

C10's `[Lectio Prima]` delegates to C11, and C11 supplies the explicit
Prime lesson citation plus text.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-07-06 --hour Prima
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-07-06 | Prime | `52ef3e73` |

### 2026-04-26 — Saturday Office BVM psalter antiphons are abbreviated in Perl

**Classification.** `perl-bug`

**Summary.** On Reduced 1955 Jul `6`, after inactive C10 antiphons are
correctly ignored, Lauds and the minor hours use the Saturday psalter
antiphons. Perl abbreviates those antiphons to incipits, while Officium
Novum emits the full source-backed antiphon text.

**Primary source.**
`upstream/web/www/horas/Latin/Commune/C10.txt:7-13,57-58`,
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:128`,
and `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:29-30,45-46,61-62`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-07-06 --hour Laudes
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-07-06 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-07-06 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-07-06 --hour Nona
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-07-06 | Lauds | `7c222668` |
| Reduced - 1955 | 2024-07-06 | Terce | `c7252790` |
| Reduced - 1955 | 2024-07-06 | Sext | `58da5074` |
| Reduced - 1955 | 2024-07-06 | None | `6039460d` |

### 2026-04-26 — Assumption Vespers proper hymn is masked by the Marian common rubric in Perl

**Classification.** `perl-bug`

**Summary.** On Aug `15`, the simplified Roman Perl comparison surface
opens Vespers hymn comparison at the C11 Marian common kneeling rubric
instead of the proper Assumption hymn. Officium Novum emits the winning
office's own `[Hymnus Vespera]`, beginning `O prima, Virgo, pródita`.

**Primary source.**
`upstream/web/www/horas/Latin/Sancti/08-15.txt:6-17` and
`upstream/web/www/horas/Latin/Commune/C11.txt:26-28`

`Sancti/08-15` declares `ex C11` but also supplies a proper
`[Hymnus Vespera]`; C11 separately carries the generic Marian hymn
rubric before `Ave maris stella`.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-08-15 --hour Vespera
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-08-15 --hour Vespera
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-08-15 | Vespers | `bb24a4f0` |
| Rubrics 1960 - 1960 | 2024-08-15 | Vespers | `bb24a4f0` |

### 2026-04-25 — Reduced 1955 Christmas-octave minor-hour antiphons fall back to the psalter

**Classification.** `perl-bug`

**Summary.** On Dec `26` and Dec `27`, the Reduced 1955 comparison
surface keeps ordinary psalter antiphons at Prime, Terce, Sext, and
None. Officium Novum emits the proper antiphons for St Stephen and St
John.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/12-26.txt:9-14,149-157`
- `upstream/web/www/horas/Latin/Sancti/12-27.txt:9-13,140-148`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --max-doc-rows 500
```

Then inspect Prime, Terce, Sext, and None on Dec `26` and Dec `27`.

**Affected stable divergence-row keys.**

| Policy | Dates | Hours | Row key suffixes |
|---|---|---|---|
| Reduced - 1955 | 2024-12-26, 2024-12-27 | Prime, Terce, Sext, None | `bfa62558`, `ae87e061`, `011b4616`, `d69e79a7`, `abc3d2ca`, `c2ac1c81`, `17c3b847`, `5cee32b6` |

### 2026-04-25 — Simplified Roman Marian common antiphons fall back to the psalter

**Classification.** `perl-bug`

**Summary.** Several simplified Roman Marian-common rows keep ordinary
psalter antiphons in the Perl comparison surface. Officium Novum emits
the C11 Marian common antiphons at the affected Lauds, Vespers, and
minor-hour rows.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/08-22.txt:1-10`
- `upstream/web/www/horas/Latin/Sancti/09-12.txt:1-17`
- `upstream/web/www/horas/Latin/Commune/C11.txt:7-10,15-24,251-256`
- `upstream/web/www/horas/Latin/Commune/C7.txt:9-14,67`
- `upstream/web/www/horas/Latin/Commune/C6.txt:116-125`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --max-doc-rows 500
```

Then inspect Reduced 1955 Aug `22` / Sep `12` minor hours and Rubrics
1960 Sep `12` Lauds / Vespers.

**Affected stable divergence-row keys.**

| Policy | Dates | Hours | Row key suffixes |
|---|---|---|---|
| Reduced - 1955 | 2024-08-22, 2024-09-12 | Prime, Terce, Sext, None | `725e1611`, `1a19d166`, `0868e7bf`, `4f6bebb1` |
| Rubrics 1960 - 1960 | 2024-09-12 | Lauds, Vespers | `6d4720a5`, `a3dcd0af` |

### 2026-04-26 — Reduced 1955 Nativity of the BVM minor hours shift from the feast versicle in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Reduced 1955 Sep `8` Terce and Sext show Marian-common
versicles in the Perl comparison surface. Officium Novum emits the
Nativity office's source-backed `V. Natívitas est hódie sanctæ Maríæ
Vírginis.` versicle.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/09-08.txt:10-15,24-26,140-147`
- `upstream/web/www/horas/Latin/Commune/C11.txt:67-69,307-339`

These sources establish that the feast supplies `[Versum 1]` and aliases
its later versicle slots back to that feast-proper text.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-09-08
```

Then inspect Reduced 1955 Terce and Sext.

**Affected stable divergence-row keys.**

| Policy | Date | Hours | Row key suffixes |
|---|---|---|---|
| Reduced - 1955 | 2024-09-08 | Terce, Sext | `45abc077`, `3da503ad` |

### 2026-04-25 — Simplified Roman Confessor non-pontiff common antiphons fall back to the psalter

**Classification.** `perl-bug`

**Summary.** On Aug `19` and Oct `4`, the Reduced 1955 and Rubrics
1960 comparison surfaces keep ordinary psalter antiphons at Matins,
Lauds, Prime, Terce, Sext, None, and Vespers. Officium Novum emits the
source-backed Confessor non-pontiff common antiphons.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/08-19.txt:4-9`
- `upstream/web/www/horas/Latin/Sancti/10-04.txt:4-14`
- `upstream/web/www/horas/Latin/Commune/C5.txt:9-19`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --max-doc-rows 500
```

Then inspect Matins, Lauds, Prime, Terce, Sext, None, and Vespers on
Aug `19` and Oct `4` under `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Dates | Hours | Row key suffixes |
|---|---|---|---|
| Reduced - 1955 | 2024-08-19, 2024-10-04 | Matins, Lauds, Prime, Terce, Sext, None, Vespers | `2bbb208c`, `1ac985ea`, `5e2bc918`, `94d8530b`, `ca496847`, `d06b3f15`, `b8382b61`, `88adb0ee`, `30af99f1`, `c9286c91`, `3f0bca99`, `ee83352e`, `ee9cd993`, `7d120c6f` |
| Rubrics 1960 - 1960 | 2024-08-19, 2024-10-04 | Matins, Lauds, Prime, Terce, Sext, None, Vespers | `2bbb208c`, `1ac985ea`, `63c54bc5`, `993822fb`, `5c9ad87e`, `e01745bd`, `b8382b61`, `88adb0ee`, `30af99f1`, `ae30f785`, `f420db38`, `b40640d0`, `21ab0ed2`, `7d120c6f` |

### 2026-04-25 — Simplified Roman Prime keeps ordinary chapter instead of office `[Lectio Prima]`

**Classification.** `perl-bug`

**Summary.** Several high feast Prime rows have explicit `[Lectio
Prima]` sections in the winning temporal or sanctoral office. Officium
Novum emits those source-backed Prime lessons, while the Perl
comparison surface keeps the ordinary `1 Tim. 1:17` chapter.

**Primary source.**

- `upstream/web/www/horas/Latin/Tempora/Pasc5-4.txt:320`
- `upstream/web/www/horas/Latin/Tempora/Pasc7-0.txt:228`
- `upstream/web/www/horas/Latin/Tempora/Pent01-4.txt:298`
- `upstream/web/www/horas/Latin/Sancti/08-15.txt:293`
- `upstream/web/www/horas/Latin/Sancti/05-08.txt:320`
- `upstream/web/www/horas/Latin/Sancti/11-01.txt:329`
- `upstream/web/www/horas/Latin/Sancti/12-08.txt:219`
- `upstream/web/www/horas/Latin/Sancti/12-24.txt:77`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --max-doc-rows 500
```

Then inspect Prime on the affected dates under `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Dates | Hour | Row key suffixes |
|---|---|---|---|
| Reduced - 1955 | 2024-05-09, 2024-05-19, 2024-05-30, 2024-08-15, 2024-09-29, 2024-11-01, 2024-12-08, 2024-12-24 | Prime | `1f932f3a`, `9c18c7ac`, `ebd3ffa2`, `68a6aa15`, `93d19f1b`, `d2312ee1`, `269de10f`, `17defeec` |
| Rubrics 1960 - 1960 | 2024-09-29, 2024-11-01, 2024-12-24 | Prime | `93d19f1b`, `d2312ee1`, `17defeec` |

**Additional fanout.** Reduced 1955 Christmas Day (`2024-12-25`) Prime
has the same shape: `upstream/web/www/horas/Latin/Sancti/12-25.txt:382-384`
supplies `[Lectio Prima]` as `Heb 1:11-12`, while the Perl comparison
surface keeps `1 Tim. 1:17`. Stable row key suffix: `6b6365d6`.

### 2026-04-25 — Rubrics 1960 Marian Matins doxology inserts an unsupported comma after `Patre`

**Classification.** `perl-bug`

**Summary.** Several Rubrics 1960 Marian Matins rows use the
source-backed Nativity doxology line `Cum Patre et almo Spíritu,`.
The Perl comparison surface changes the punctuation to
`Cum Patre, et almo Spíritu`.

**Primary source.**

`upstream/web/www/horas/Latin/Psalterium/Doxologies.txt:1-5`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --max-doc-rows 500
```

Then inspect Matins on Jul `6`, Aug `22`, and Sep `12`.

**Affected stable divergence-row keys.**

| Policy | Dates | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-07-06, 2024-08-22, 2024-09-12 | Matins | `9d86e50c` |

### 2026-04-25 — Simplified Roman Ash Wednesday minor hours keep ordinary Wednesday antiphons

**Classification.** `perl-bug`

**Summary.** On Ash Wednesday, Officium Novum keeps the ordinary
Wednesday minor-hour psalm distribution but takes the opening antiphons
from the seasonal `Quad` table. The Perl comparison surface keeps the
ordinary Wednesday antiphons at Prime, Terce, Sext, and None.

**Primary source.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:8`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:24`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:40`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:56`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:158-163`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-02-14
```

Then inspect Prime, Terce, Sext, and None under `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row key groups.**

| Policy | Date | Hours | Row key suffixes |
|---|---|---|---|
| Reduced - 1955 | 2024-02-14 | Prime/Terce/Sext/None | `45afba84`, `be96b56d`, `90328e34`, `0d70a971` |
| Rubrics 1960 - 1960 | 2024-02-14 | Prime/Terce/Sext/None | `936f4c9a`, `869834f0`, `65ecf20b`, `4ba829b4` |

### 2026-04-25 — Simplified Roman minor hours skip the source-backed collect wrapper

**Classification.** `perl-bug`

**Summary.** Several Reduced 1955 and Rubrics 1960 Terce/Sext/None rows
now reach the ordinary minor-hour collect handoff. Officium Novum emits
the source-backed `Dómine, exáudi... / Orémus` wrapper before the
collect, while the Perl comparison surface jumps directly to the collect
text.

**Primary source.**

- `upstream/web/www/horas/Ordinarium/Minor.txt:28-34`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:82-90`
- `upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:306-307`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-02-14 --date 2024-03-25 --date 2024-11-05
```

Then inspect Terce/Sext/None under `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row key groups.**

| Policy | Dates | Hours | Row key suffixes |
|---|---|---|---|
| Reduced - 1955 | 2024-02-14, 2024-03-25, 2024-03-26, 2024-03-27, 2024-06-20, 2024-11-05, 2024-11-08 | Terce/Sext/None where present | `40f185d2`, `9435787d`, `e227f3f5`, `14880dfe`, `ef4f7902`, `56e276de` |
| Rubrics 1960 - 1960 | 2024-02-14, 2024-02-24, 2024-03-25, 2024-03-26, 2024-03-27, 2024-06-20, 2024-11-05, 2024-11-08 | Terce/Sext/None where present | `40f185d2`, `9435787d`, `e227f3f5`, `14880dfe`, `ef4f7902`, `56e276de`, `f2474b69` |

### 2026-04-25 — Rubrics 1960 appends unsupported trailing `‡` markers to complete psalter antiphons

**Classification.** `perl-bug`

**Summary.** Several Rubrics 1960 rows now reach punctuation-only
antiphon surfaces where Perl appends a trailing `‡` to a complete
psalter antiphon. The compositor preserves the corpus row as written.

**Primary source.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt:29`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt:92`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:87`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:26`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:100`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:111`

These rows carry the complete antiphon text without a final
continuation marker.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --max-doc-rows 500
```

Then inspect the affected rows in `rubrics-1960-2024.md`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-03-25 | Matins | `86cb45c3` |
| Rubrics 1960 - 1960 | 2024-06-20 | Matins | `02b507e6` |
| Rubrics 1960 - 1960 | 2024-06-20 | Lauds | `52cc7e9c` |
| Rubrics 1960 - 1960 | 2024-06-20 | Terce | `2807ff6e` |
| Rubrics 1960 - 1960 | 2024-06-20 | Vespers | `2eac8bef` |
| Rubrics 1960 - 1960 | 2024-11-08 | Lauds | `d64d0218` |

### 2026-04-25 — Reduced 1955 abbreviates and over-marks weekday psalter antiphons

**Classification.** `perl-bug`

**Summary.** The Reduced 1955 Jun `20` Terce and Vespers rows expose
the same psalter-antiphon source seam as the already-classified Rubrics
1960 trailing-marker rows. Perl abbreviates the source-backed antiphons
and appends `‡`; the compositor preserves the source text.

**Primary source.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:26`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:100`

The source rows carry the weekday Terce `Quam bonus...` antiphon and
the Vespers `Ecce quam bonum...` antiphon without a final continuation
marker.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-06-20 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-06-20 --hour Vespera
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-06-20 | Terce | `e1b9c6d0` |
| Reduced - 1955 | 2024-06-20 | Vespers | `3bf979aa` |

### 2026-04-24 — Roman Paschaltide fallback minor-hour hymn doxologies retain ordinary endings in the Perl render surface

**Classification.** `perl-bug`

**Summary.** Once fallback minor-hour hymns receive the same seasonal
Paschal / Ascension / Pentecost doxology family as major-hour hymns,
the Rubrics 1960 Paschal Sunday rows emit the source-backed seasonal
stanza. The Perl render surface keeps the ordinary fallback hymn ending
on these rows.

**Primary source.**

`upstream/web/www/horas/Latin/Psalterium/Doxologies.txt:29-34`

This section supplies the Paschal doxology beginning `Deo Patri sit
glória` and continuing with the risen-Son stanza.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-04-07 --date 2024-05-19
```

Then inspect Prime, Terce, Sext, and None for `Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-04-07 | Prime | `7859a9fb` |
| Rubrics 1960 - 1960 | 2024-04-07 | Terce | `dcdd92bf` |
| Rubrics 1960 - 1960 | 2024-04-07 | Sext | `dcdd92bf` |
| Rubrics 1960 - 1960 | 2024-04-07 | None | `dcdd92bf` |
| Rubrics 1960 - 1960 | 2024-05-19 | Prime | `7859a9fb` |
| Rubrics 1960 - 1960 | 2024-05-19 | Sext | `dcdd92bf` |
| Rubrics 1960 - 1960 | 2024-05-19 | None | `dcdd92bf` |

### 2026-04-24 — Rubrics 1960 Sunday Prime uses the older Dominica antiphon instead of the Tridentinum row

**Classification.** `perl-bug`

**Summary.** The Rubrics 1960 Sunday Prime psalm-table source is the
`Tridentinum` row, whose antiphon is `Allelúja, * allelúja, allelúja`.
The compositor emits that source-backed antiphon, while the Perl render
surface uses the older full `Dominica` antiphon.

**Primary source.**

`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:218`

This row explicitly begins
`Prima Dominica=Allelúja, * allelúja, allelúja;;53,117,118(1-16),118(17-32)`.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-06-16 --date 2024-06-30 --date 2024-09-08 --date 2024-09-15 --date 2024-10-06
```

Then inspect Prime for `Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-06-16 | Prime | `e3d07cc1` |
| Rubrics 1960 - 1960 | 2024-06-30 | Prime | `e3d07cc1` |
| Rubrics 1960 - 1960 | 2024-09-08 | Prime | `e3d07cc1` |
| Rubrics 1960 - 1960 | 2024-09-15 | Prime | `e3d07cc1` |
| Rubrics 1960 - 1960 | 2024-10-06 | Prime | `e3d07cc1` |

### 2026-04-24 — Roman Vespers post-collect `Dómine, exáudi` bridge is skipped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Selected simplified Roman Vespers rows reach the
post-collect conclusion boundary where the compositor continues with
the source-backed `Dómine, exáudi oratiónem meam` bridge. The Perl
render surface stops at `_` on those rows.

**Primary source.**

`upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:79-86`

This section supplies the `Domine exaudi` versicle and response used
after the Vespers collect.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-03-19 --date 2024-09-08 --date 2024-09-15 --date 2024-12-08 --date 2024-12-27
```

Then inspect Vespers for `Reduced - 1955`; Dec `27` also exposes the
same row under `Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-03-19 | Vespers | `843b6667` |
| Reduced - 1955 | 2024-09-08 | Vespers | `843b6667` |
| Reduced - 1955 | 2024-09-15 | Vespers | `843b6667` |
| Reduced - 1955 | 2024-12-08 | Vespers | `843b6667` |
| Reduced - 1955 | 2024-12-27 | Vespers | `843b6667` |
| Rubrics 1960 - 1960 | 2024-12-27 | Vespers | `843b6667` |

### 2026-04-24 — Roman Precious Blood minor-hour proper later blocks are skipped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both simplified Roman policies on Jul `1`, the
compositor emits the Precious Blood office's source-backed Prime lesson
and Terce/Sext/None short-responsory later blocks from `Sancti/07-01`.
The Perl render surface keeps the weekday Prime citation `1 Tim. 1:17`
and leaves `_` at the first divergence for Terce, Sext, and None.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/07-01.txt:369-385`
- `upstream/web/www/horas/Latin/Sancti/07-01.txt:387-401`
- `upstream/web/www/horas/Latin/Sancti/07-01.txt:403-416`

These sections explicitly provide `[Lectio Prima]`, the proper short
responsories, and the matching versicles.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-07-01
```

Then inspect Prime, Terce, Sext, and None for `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-07-01 | Prime | `cb113d79` |
| Reduced - 1955 | 2024-07-01 | Terce | `314c39f4` |
| Reduced - 1955 | 2024-07-01 | Sext | `71abd048` |
| Reduced - 1955 | 2024-07-01 | None | `3032e01a` |
| Rubrics 1960 - 1960 | 2024-07-01 | Prime | `cb113d79` |
| Rubrics 1960 - 1960 | 2024-07-01 | Terce | `314c39f4` |
| Rubrics 1960 - 1960 | 2024-07-01 | Sext | `71abd048` |
| Rubrics 1960 - 1960 | 2024-07-01 | None | `3032e01a` |

### 2026-04-24 — Roman Ss Peter and Paul minor-hour proper later blocks are skipped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both simplified Roman policies on Jun `29`, the
compositor emits Ss Peter and Paul's source-backed Prime lesson and
Terce/Sext/None short-responsory later blocks from `Sancti/06-29` and
the apostle common. The Perl render surface keeps the weekday Prime
citation `1 Tim. 1:17` and leaves `_` at the first divergence for
Terce, Sext, and None.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/06-29.txt:265-276`
- `upstream/web/www/horas/Latin/Commune/C1.txt:286-317`

These sections explicitly provide `[Lectio Prima]`, the proper/common
short responsories, and the matching versicles.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-06-29
```

Then inspect Prime, Terce, Sext, and None for `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-06-29 | Prime | `4e634936` |
| Reduced - 1955 | 2024-06-29 | Terce | `a05eee1c` |
| Reduced - 1955 | 2024-06-29 | Sext | `5e6c5f39` |
| Reduced - 1955 | 2024-06-29 | None | `623717e4` |
| Rubrics 1960 - 1960 | 2024-06-29 | Prime | `4e634936` |
| Rubrics 1960 - 1960 | 2024-06-29 | Terce | `a05eee1c` |
| Rubrics 1960 - 1960 | 2024-06-29 | Sext | `5e6c5f39` |
| Rubrics 1960 - 1960 | 2024-06-29 | None | `623717e4` |

### 2026-04-24 — Roman Nativity of St John the Baptist minor-hour proper later blocks are skipped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both simplified Roman policies on Jun `24`, the
compositor emits the Nativity of St John the Baptist's source-backed
Prime lesson and Terce/Sext/None short-responsory later blocks from
`Sancti/06-24`. The Perl render surface keeps the weekday Prime citation
`1 Tim. 1:17` and leaves `_` at the first divergence for Terce, Sext,
and None.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/06-24.txt:332-345`
- `upstream/web/www/horas/Latin/Sancti/06-24.txt:347-361`
- `upstream/web/www/horas/Latin/Sancti/06-24.txt:363-376`

These sections explicitly provide `[Lectio Prima]`, the proper short
responsories, and the matching versicles.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-06-24
```

Then inspect Prime, Terce, Sext, and None for `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-06-24 | Prime | `5ab1fcd3` |
| Reduced - 1955 | 2024-06-24 | Terce | `cfa0892a` |
| Reduced - 1955 | 2024-06-24 | Sext | `5c546e7a` |
| Reduced - 1955 | 2024-06-24 | None | `070067f2` |
| Rubrics 1960 - 1960 | 2024-06-24 | Prime | `5ab1fcd3` |
| Rubrics 1960 - 1960 | 2024-06-24 | Terce | `cfa0892a` |
| Rubrics 1960 - 1960 | 2024-06-24 | Sext | `5c546e7a` |
| Rubrics 1960 - 1960 | 2024-06-24 | None | `070067f2` |

### 2026-04-24 — Roman St Joseph minor-hour proper later blocks are skipped by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under both simplified Roman policies on Mar `19`, the
compositor emits St Joseph's source-backed Prime lesson and
Terce/Sext/None short-responsory later blocks from `Sancti/03-19`.
The Perl render surface keeps the weekday Prime citation `1 Tim. 1:17`
and leaves `_` at the first divergence for Terce, Sext, and None.

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/03-19.txt:261-274`
- `upstream/web/www/horas/Latin/Sancti/03-19.txt:276-290`
- `upstream/web/www/horas/Latin/Sancti/03-19.txt:292-306`

These sections explicitly provide `[Lectio Prima]`, the proper short
responsories, and the matching versicles.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-03-19
```

Then inspect Prime, Terce, Sext, and None for `Reduced - 1955` and
`Rubrics 1960 - 1960`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-03-19 | Prime | `5c63239e` |
| Reduced - 1955 | 2024-03-19 | Terce | `b7f4a70f` |
| Reduced - 1955 | 2024-03-19 | Sext | `4da84a30` |
| Reduced - 1955 | 2024-03-19 | None | `80a4cecd` |
| Rubrics 1960 - 1960 | 2024-03-19 | Prime | `5c63239e` |
| Rubrics 1960 - 1960 | 2024-03-19 | Terce | `b7f4a70f` |
| Rubrics 1960 - 1960 | 2024-03-19 | Sext | `4da84a30` |
| Rubrics 1960 - 1960 | 2024-03-19 | None | `80a4cecd` |

### 2026-04-24 — Roman Lenten Vespers opening antiphons are shortened or over-marked by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under the simplified Roman policies, several Lenten ferial
Vespers rows expose source-backed full opening antiphons from
`Psalmi major`. The Perl render surface either abbreviates those
openings to incipits under `Reduced - 1955` or appends an unsupported
trailing `‡` under `Rubrics 1960 - 1960`.

**Primary source.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:37`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:58`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:79`

These weekday Vespers rows carry the full antiphons `Inclinávit
Dóminus * aurem suam mihi.`, `Qui hábitas in cælis, * miserére nobis.`,
and `Beáti omnes * qui timent Dóminum.`. None carries an additional
trailing continuation marker after the complete antiphon.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --hour Vespers
```

Then inspect the affected Lenten Vespers rows. The compositor preserves
the source-backed antiphons; Perl shortens or over-marks them.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-14 | Vespers | `55b74284` |
| Reduced - 1955 | 2024-03-25 | Vespers | `96dd74f0` |
| Reduced - 1955 | 2024-03-26 | Vespers | `19479180` |
| Reduced - 1955 | 2024-03-27 | Vespers | `55b74284` |
| Reduced - 1955 | 2024-11-05 | Vespers | `19479180` |
| Rubrics 1960 - 1960 | 2024-02-14 | Vespers | `cc3c00d8` |
| Rubrics 1960 - 1960 | 2024-03-27 | Vespers | `cc3c00d8` |

### 2026-04-24 — Reduced 1955 commemorated Lourdes doxology is carried into Quinquagesima Sunday hymns by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Reduced - 1955` on Feb `11`, the winning office is
Quinquagesima Sunday and Lourdes is only commemorated. The compositor
therefore keeps the ordinary Matins and minor-hour hymn endings. The
Perl render surface nevertheless substitutes the Lourdes `Doxology=Nat`
line `Jesu, tibi sit glória,` into Matins, Prime, Terce, Sext, and None.

**Primary source.**

- `upstream/web/www/horas/Help/Rubrics/1955.txt:219-222`
- `upstream/web/www/horas/Help/Rubrics/1955.txt:116-123,129-137,141-147,150-158`
- `upstream/web/www/horas/Latin/Sancti/02-11.txt:10-15`
- `upstream/web/www/horas/Latin/Psalterium/Special/Matutinum Special.txt:165-174`
- `upstream/web/www/horas/Latin/Psalterium/Special/Prima Special.txt:102-111`
- `upstream/web/www/horas/Latin/Psalterium/Special/Minor Special.txt:657-707`

The 1955 changes say commemorated feasts no longer contribute a special
hymn doxology in the Office, outside the named January / Ascensiontide
exception days. Feb `11` is not one of those exceptions, so the
commemorated Lourdes `Doxology=Nat` rule should not overwrite the
ordinary Sunday and minor-hour hymn endings.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-11 --no-write-docs
```

Matins and the minor hours first diverge on the doxology line, with Perl
expecting `Jesu, tibi sit glória,` and the compositor preserving the
source-backed ordinary endings.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-11 | Matins | `b241f834` |
| Reduced - 1955 | 2024-02-11 | Prime | `36739df3` |
| Reduced - 1955 | 2024-02-11 | Terce | `b241f834` |
| Reduced - 1955 | 2024-02-11 | Sext | `b241f834` |
| Reduced - 1955 | 2024-02-11 | None | `b241f834` |

### 2026-04-24 — Reduced 1955 major-hour opening antiphons are truncated to incipits by the Perl render surface

**Classification.** `perl-bug`

**Summary.** Under `Reduced - 1955`, a repeated Lauds/Vespers family now
shows the compositor preserving full source-backed opening antiphons
while the Perl render surface abbreviates the same antiphons to
incipit-only forms such as `Ant. Miserére. ‡`, `Ant. Secúndum
multitúdinem.`, and `Ant. Véniet Dóminus.`. The affected rows span
Septuagesima/Lent, Holy Week, Easter week, psalter-major weekdays, and
Advent.

**Primary source.**

- `upstream/web/www/horas/Latin/Tempora/Quadp1-0.txt:150-151`
- `upstream/web/www/horas/Latin/Tempora/Quadp3-0.txt:144-145`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:43-44,71-72,85-86,106-107,134-135`
- `upstream/web/www/horas/Latin/Tempora/Quad1-0.txt:142-143`
- `upstream/web/www/horas/Latin/Tempora/Quad2-0.txt:149-150`
- `upstream/web/www/horas/Latin/Tempora/Quad3-0.txt:152-153`
- `upstream/web/www/horas/Latin/Tempora/Quad4-0.txt:135-136`
- `upstream/web/www/horas/Latin/Tempora/Quad5-0.txt:138-139`
- `upstream/web/www/horas/Latin/Tempora/Quad6-0.txt:132-133`
- `upstream/web/www/horas/Latin/Tempora/Quad6-1.txt:52-53`
- `upstream/web/www/horas/Latin/Tempora/Quad6-2.txt:62-63`
- `upstream/web/www/horas/Latin/Tempora/Quad6-3.txt:56-57`
- `upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:98-99`
- `upstream/web/www/horas/Latin/Tempora/Adv1-0.txt:132-133`
- `upstream/web/www/horas/Latin/Tempora/Adv3-0.txt:137-138`
- `upstream/web/www/horas/Latin/Tempora/Adv4-0.txt:135-136`

These sources carry the full antiphon text that the compositor emits.
The Perl comparison surface keeps only the opening words and, in a few
rows, an unsupported continuation marker.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --hour Lauds
```

Then inspect the affected Lauds rows in
`packages/compositor/test/divergence/reduced-1955-2024.md`. A full
ledger fanout also exposes exact-signature Vespers rows for Easter week
and Advent.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-01-28 | Lauds | `1a82831d` |
| Reduced - 1955 | 2024-02-11 | Lauds | `5a5316f8` |
| Reduced - 1955 | 2024-02-14 | Lauds | `cfcb1ea4` |
| Reduced - 1955 | 2024-02-18 | Lauds | `573fcb8e` |
| Reduced - 1955 | 2024-02-24 | Lauds | `6558244a` |
| Reduced - 1955 | 2024-02-25 | Lauds | `8748ea45` |
| Reduced - 1955 | 2024-03-03 | Lauds | `8c09ab69` |
| Reduced - 1955 | 2024-03-10 | Lauds | `3ef795c8` |
| Reduced - 1955 | 2024-03-17 | Lauds | `2bc66027` |
| Reduced - 1955 | 2024-03-24 | Lauds | `91644e1b` |
| Reduced - 1955 | 2024-03-25 | Lauds | `b12b96b3` |
| Reduced - 1955 | 2024-03-26 | Lauds | `5b69ee81` |
| Reduced - 1955 | 2024-03-27 | Lauds | `22fe442d` |
| Reduced - 1955 | 2024-04-03 | Lauds | `a214ae73` |
| Reduced - 1955 | 2024-04-03 | Vespers | `a214ae73` |
| Reduced - 1955 | 2024-04-04 | Lauds | `a214ae73` |
| Reduced - 1955 | 2024-04-04 | Vespers | `a214ae73` |
| Reduced - 1955 | 2024-04-05 | Lauds | `a214ae73` |
| Reduced - 1955 | 2024-04-05 | Vespers | `a214ae73` |
| Reduced - 1955 | 2024-04-06 | Lauds | `a214ae73` |
| Reduced - 1955 | 2024-06-20 | Lauds | `9587c7d2` |
| Reduced - 1955 | 2024-11-05 | Lauds | `33881e50` |
| Reduced - 1955 | 2024-11-08 | Lauds | `329df4d3` |
| Reduced - 1955 | 2024-12-01 | Lauds | `1bcd4136` |
| Reduced - 1955 | 2024-12-01 | Vespers | `1bcd4136` |
| Reduced - 1955 | 2024-12-15 | Lauds | `5d3345ac` |
| Reduced - 1955 | 2024-12-15 | Vespers | `5d3345ac` |
| Reduced - 1955 | 2024-12-22 | Lauds | `88310db2` |
| Reduced - 1955 | 2024-12-22 | Vespers | `88310db2` |

### 2026-04-23 — Roman Ash Wednesday Matins gains unsupported commas in the Psalm 44 reopening antiphon

**Classification.** `perl-bug`

**Summary.** After fixing the structural Psalm `44` split on Ash
Wednesday Matins, the remaining Roman divergence is punctuation-only.
Ash Wednesday 2024 is a Wednesday, so both Roman policies correctly use
`Psalmi matutinum:Day3`, whose second Psalm `44` antiphon is
`Confitebúntur tibi * pópuli Deus in ætérnum.` Perl instead surfaces the
same antiphon with an unsupported extra comma after `pópuli`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt:52-54`

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-02-14 --hour Matins
```

Once the structural split bug is fixed, the remaining Roman Ash
Wednesday Matins row first diverges only on the reopening antiphon
surface:

- `Reduced - 1955`: Perl expects
  `Ant. Confitebúntur tibi pópuli, Deus, in ætérnum.`
- `Rubrics 1960 - 1960`: Perl expects
  `Ant. Confitebúntur tibi * pópuli, Deus, in ætérnum.`

The compositor preserves the source-backed Day3 text without that extra
comma.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-14 | Matins | `d6ab45d4` |
| Rubrics 1960 - 1960 | 2024-02-14 | Matins | `c12d0e8c` |

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
Roman Lauds rows first diverge at Psalm 99 line `99:3b` whenever the
frontier reaches that psalm, including the January cluster (Jan `1`,
`6`, `7`, `13`) and the Easter-Octave April cluster exposed after the
Vespers burn-down. The compositor preserves the corpus half-verse
structure `... ‡ ... * ...` while removing the numeric carry marker;
the Perl comparison surface flattens the same source line to a single
`*` split.

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
| Reduced - 1955 | 2024-04-01 | Lauds | `2af868c1` |
| Reduced - 1955 | 2024-04-02 | Lauds | `2af868c1` |
| Reduced - 1955 | 2024-01-06 | Lauds | `2af868c1` |
| Reduced - 1955 | 2024-01-07 | Lauds | `2af868c1` |
| Reduced - 1955 | 2024-01-13 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-01-01 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-04-01 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-04-02 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-04-03 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-04-04 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-04-05 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-04-06 | Lauds | `2af868c1` |
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

### 2026-04-26 — Roman proper first Vespers loses the Psalm 116 override in the Perl render surface

**Classification.** `perl-bug`

**Summary.** `Reduced - 1955` and `Rubrics 1960 - 1960` Jul `1` and
Sep `29` Vespers first diverge at the fifth psalm heading. The
compositor emits the source-backed `Psalmus 116 [5]`; the Perl
comparison surface instead keeps the alternate heading (`Psalmus 147
[5]` for Jul `1`, `Psalmus 137 [5]` for Sep `29`).

**Primary source.**

- `upstream/web/www/horas/Latin/Sancti/07-01.txt:11-18`
- `upstream/web/www/horas/Latin/Sancti/09-29.txt:11-16`
- `upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:15-20`

These sources establish that both offices explicitly set `Psalm5
Vespera=116`, while their separate `Psalm5 Vespera3` values are `147`
and `137`.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --hour Vespers
```

Then inspect the Jul `1` and Sep `29` Roman Vespers rows in the
corresponding divergence ledgers.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-07-01 | Vespers | `bdb4bf6d` |
| Rubrics 1960 - 1960 | 2024-07-01 | Vespers | `bdb4bf6d` |
| Reduced - 1955 | 2024-09-29 | Vespers | `d312260f` |
| Rubrics 1960 - 1960 | 2024-09-29 | Vespers | `d312260f` |

### 2026-04-19 — Roman Sunday minor hours gain underscore separators around the short responsory in the Perl render surface

**Classification.** `perl-bug`

**Summary.** After the Roman Sunday minor-hour fallback fixes, `Terce`,
`Sext`, and `None` now correctly emit the Sunday chapter, short
responsory, versicle, and oration from the source-backed later block.
The remaining first divergence is a literal `_` line that the Perl
comparison surface inserts before the short responsory. The source-backed
compositor output begins directly with the `R.br.` line.

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
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-01-28 --hour Tertia
```

Each row now first diverges on `expected="_"` versus the compositor's
source-backed `R.br.` opening line.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-01-14 | Terce | `89c6190b` |
| Rubrics 1960 - 1960 | 2024-01-14 | Sext | `bc17de3d` |
| Rubrics 1960 - 1960 | 2024-01-14 | None | `4a1aadd8` |
| Reduced - 1955 | 2024-01-28 | Terce | `89c6190b` |
| Reduced - 1955 | 2024-01-28 | Sext | `bc17de3d` |
| Reduced - 1955 | 2024-01-28 | None | `4a1aadd8` |

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

### 2026-04-24 — Paschaltide proper minor-hour short responsories render as underscores in the Perl surface

**Classification.** `perl-bug`

**Summary.** Once the Paschaltide bare `Deo gratias` chapter-response
seam was fixed, the exposed Ascension and Pentecost minor-hour rows
moved to the same later-block render-surface family already seen on
Sunday and January proper offices. The compositor emits the source-backed
`R.br.` short responsory, while the Perl comparison surface leaves a
literal `_` line at the first divergence.

**Primary source.**

- `upstream/web/www/horas/Latin/Tempora/Pasc5-4.txt:323-360`
- `upstream/web/www/horas/Latin/Tempora/Pasc7-0.txt:248-269`

These source sections explicitly provide the Ascension and Pentecost
`Responsory Breve` blocks for Terce/Sext/None. They do not contain
underscore-only separator lines before the `R.br.` openings.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-05-09 --hour Terce
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-05-09 --hour Sext
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-05-09 --hour None
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-05-19 --hour Sext
pnpm -C packages/compositor compare:phase-3-perl -- --date 2024-05-19 --hour None
```

The affected rows first differ at `expected="_"` versus the
source-backed `R.br.` opening line.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-05-09 | Terce | `470ce973` |
| Reduced - 1955 | 2024-05-09 | Sext | `3c70c657` |
| Reduced - 1955 | 2024-05-09 | None | `9132c86f` |
| Rubrics 1960 - 1960 | 2024-05-19 | Sext | `ac7cdff5` |
| Rubrics 1960 - 1960 | 2024-05-19 | None | `c7624535` |

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

**Additional fanout.** The Advent Sunday Matins fixes exposed the same
source-backed `[Pater secreto]` guillemet surface on Dec `15` and Dec
`22` under both simplified Roman policies. Stable row key suffix:
`29ec2a3d`.

**Additional fanout.** A later expanded-ledger pass found the remaining
visible shared-Roman Matins rows with the same exact first-divergence
signature: Reduced 1955 Jun `20`, Jul `6`, Nov `5`, Nov `8`, and Dec
`1`; Rubrics 1960 Nov `5`, Nov `8`, and Dec `1`. Stable row key suffix:
`29ec2a3d`.

**Additional fanout.** The Reduced 1955 Christmas-octave Matins
first-nocturn versicle fix exposed the same source-backed `[Pater
secreto]` guillemet surface on Dec `26`. Stable row key suffix:
`29ec2a3d`.

### 2026-04-22 — Roman Easter-Octave Prime preserves the corpus guillemets around `Pater Noster`

**Classification.** `rendering-difference`

**Summary.** After the Easter-Octave Prime structural fixes restored the
Martyrologium tail and `De Officio Capituli`, the remaining Roman Prime
rows on Apr `1` through Apr `5` now land on the same source-backed
rubric family already seen at Matins: Perl strips the guillemets in
`Pater Noster dicitur secreto usque ad Et ne nos indúcas in
tentatiónem:`, while the compositor preserves the corpus punctuation
`« Pater Noster » ... « Et ne nos indúcas in tentatiónem: »`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:1-2`

This rubric sentence carries the guillemets in the source itself, so the
Perl/compositor difference is punctuation-only rather than a
liturgical-content disagreement.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-04-03 --hour Prime
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-04-03 --hour Prime
```

The affected Roman Prime rows now first diverge on the guillemeted
secret `Pater Noster` rubric surface.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-04-01 | Prime | `29ec2a3d` |
| Reduced - 1955 | 2024-04-02 | Prime | `29ec2a3d` |
| Reduced - 1955 | 2024-04-03 | Prime | `29ec2a3d` |
| Reduced - 1955 | 2024-04-04 | Prime | `29ec2a3d` |
| Reduced - 1955 | 2024-04-05 | Prime | `29ec2a3d` |
| Rubrics 1960 - 1960 | 2024-04-01 | Prime | `29ec2a3d` |
| Rubrics 1960 - 1960 | 2024-04-02 | Prime | `29ec2a3d` |
| Rubrics 1960 - 1960 | 2024-04-03 | Prime | `29ec2a3d` |
| Rubrics 1960 - 1960 | 2024-04-04 | Prime | `29ec2a3d` |
| Rubrics 1960 - 1960 | 2024-04-05 | Prime | `29ec2a3d` |

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
surfaces as a repeated family on Psalms `62`, `4`, `124`, `114`, `115`,
and late-surfacing `99` rows under the Roman policies.

**Primary source.**

- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm62.txt:3`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm4.txt:5`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm124.txt:2`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm114.txt:5`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm115.txt:7`
- `upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm99.txt:3-5`

Each cited source line carries an explicit `‡` before the `*` split.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-03-30 --hour Matins
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-05-30 --hour Vespers
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-01-28 --hour Lauds
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-03-26 --hour Vespers
```

The Perl side flattens `‡ ... *` to a single `*`; compositor output
stays source-backed.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-03-30 | Matins | `89cb274b` |
| Reduced - 1955 | 2024-03-30 | Vespers | `c3e5bb37` |
| Reduced - 1955 | 2024-05-30 | Vespers | `c3e5bb37` |
| Reduced - 1955 | 2024-06-29 | Vespers | `c3e5bb37` |
| Reduced - 1955 | 2024-11-01 | Vespers | `c3e5bb37` |
| Rubrics 1960 - 1960 | 2024-01-28 | Lauds | `9fbc4e11` |
| Rubrics 1960 - 1960 | 2024-03-30 | Matins | `89cb274b` |
| Rubrics 1960 - 1960 | 2024-03-26 | Vespers | `b1fc00bf` |
| Rubrics 1960 - 1960 | 2024-03-25 | Vespers | `839eeb27` |
| Rubrics 1960 - 1960 | 2024-05-09 | Lauds | `2af868c1` |
| Rubrics 1960 - 1960 | 2024-03-30 | Vespers | `c3e5bb37` |
| Rubrics 1960 - 1960 | 2024-05-30 | Vespers | `c3e5bb37` |
| Rubrics 1960 - 1960 | 2024-06-29 | Vespers | `c3e5bb37` |
| Rubrics 1960 - 1960 | 2024-11-01 | Vespers | `c3e5bb37` |

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

### 2026-04-24 — Roman ferial minor-hour short responsories gain underscore separators in the Perl render surface

**Classification.** `perl-bug`

**Summary.** After the Roman ferial minor-hour fallback fix, `Terce`,
`Sext`, and `None` now correctly emit the feria chapter, short
responsory, and versicle from `Minor Special.txt`. The remaining first
divergence is a literal `_` line that the Perl comparison surface
inserts before the short responsory. The source-backed compositor output
begins directly with the `R.br.` line.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Special/Minor Special.txt:91-101,116-125,140-149`

These ferial later-block sections contain the `R.br.` short responsory
and versicle directly. They do not contain underscore-only separator
lines before the responsory.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-14 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-14 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-14 --hour Nona
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-02-14 --hour Tertia
```

Each row now first diverges on `expected="_"` versus the compositor's
source-backed `R.br.` opening line.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-14 | Terce | `9d0c4734` |
| Reduced - 1955 | 2024-02-14 | Sext | `c92f80b2` |
| Reduced - 1955 | 2024-02-14 | None | `1ab5e32c` |
| Rubrics 1960 - 1960 | 2024-02-14 | Terce | `9d0c4734` |
| Rubrics 1960 - 1960 | 2024-02-14 | Sext | `c92f80b2` |
| Rubrics 1960 - 1960 | 2024-02-14 | None | `1ab5e32c` |

### 2026-04-24 — Roman ferial Prime later blocks drift from `Prima Special` in the Perl render surface

**Classification.** `perl-bug`

**Summary.** The source-backed ferial Prime fallback uses
`Prima Special:Feria` for the chapter and `Prima Special:Responsory` for
the short responsory. Reduced 1955 Perl inserts an implicit
`R. Deo grátias.` before the responsory even though the Prime source
chapter has no `$Deo gratias` marker. Rubrics 1960 Perl keeps the Sunday
Prime citation (`1 Tim. 1:17`) where the source-backed feria chapter is
`Zach 8:19`.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Special/Prima Special.txt:1-7,45-59`

The source separates `[Dominica]` from `[Feria]`, gives `[Feria]` the
`Zach 8:19` chapter, and begins `[Responsory]` directly with
`R.br. Christe, Fili Dei vivi...`.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-14 --hour Prima
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-02-14 --hour Prima
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-14 | Prime | `6081a8cc` |
| Reduced - 1955 | 2024-02-14 | Prime | `26b1abb4` |
| Reduced - 1955 | 2024-02-24 | Prime | `26b1abb4` |
| Reduced - 1955 | 2024-03-25 | Prime | `26b1abb4` |
| Reduced - 1955 | 2024-03-26 | Prime | `26b1abb4` |
| Reduced - 1955 | 2024-03-27 | Prime | `26b1abb4` |
| Reduced - 1955 | 2024-06-20 | Prime | `26b1abb4` |
| Reduced - 1955 | 2024-11-05 | Prime | `26b1abb4` |
| Reduced - 1955 | 2024-11-08 | Prime | `26b1abb4` |
| Rubrics 1960 - 1960 | 2024-02-14 | Prime | `b7853e49` |

### 2026-04-24 — Holy Week minor-hour `Quad5` short responsories gain underscore separators after source-backed fallback

**Classification.** `perl-bug` for the remaining separator rows after
the Phase 2 fallback fix.

**Summary.** Holy Week Monday through Wednesday `Terce`, `Sext`, and
`None` now use the source-backed `Quad5` later blocks from
`Minor Special.txt`. Once the chapter selection is fixed, the remaining
first divergence is the Perl render surface inserting an underscore-only
line before the `R.br.` short responsory.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Special/Minor Special.txt:381-410,430-461,477-506`

The source carries `Quad5 Tertia`, `Quad5 Sexta`, and `Quad5 Nona`
chapter sections plus their matching `Responsory breve Quad5 ...` and
`Versum Quad5 ...` sections. The short responsory begins directly with
`R.br.`; no underscore-only separator precedes it.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-03-25 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-03-25 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-03-25 --hour Nona
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-03-25 | Terce | `cedac887` |
| Reduced - 1955 | 2024-03-25 | Sext | `3acfd479` |
| Reduced - 1955 | 2024-03-25 | None | `2071fc88` |
| Rubrics 1960 - 1960 | 2024-03-25 | Terce | `cedac887` |
| Rubrics 1960 - 1960 | 2024-03-25 | Sext | `3acfd479` |
| Rubrics 1960 - 1960 | 2024-03-25 | None | `2071fc88` |

### 2026-04-25 — Reduced 1955 Lent weekday minor-hour antiphons are abbreviated to incipits in the Perl render surface

**Classification.** `perl-bug`

**Summary.** After the compositor began routing Lent weekday minor-hour
antiphons through the seasonal `Psalmi minor:[Quad]` table, the Reduced
1955 Perl surface still abbreviates Terce, Sext, and None antiphons to
incipit-only lines. The source-backed compositor output carries the full
antiphon text from the seasonal table.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi minor.txt:154-163`

The `[Quad]` table carries the full `Advenérunt nobis * ...`,
`Commendémus nosmetípsos * ...`, and `Per arma justítiæ * ...`
antiphons. It does not contain incipit-only alternates for the 1955
surface.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-24 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-24 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-24 --hour Nona
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-24 | Terce | `50e62c35` |
| Reduced - 1955 | 2024-02-24 | Sext | `62fa2e12` |
| Reduced - 1955 | 2024-02-24 | None | `f60c28f2` |

### 2026-04-26 — Ss Peter and Paul minor-hour versicles shift in the Perl render surface

**Classification.** `perl-bug`

**Summary.** On Jun `29`, the simplified Roman Perl comparison surface
shifts the Apostle common's later versicles into the Terce/Sext/None
post-responsory versicle slot. The source-backed compositor output keeps
the hour-specific Apostle material in the proper short responsory blocks
and emits C1's generic `[Versum 1]` (`In omnem terram...`) as the
minor-hour versicle.

**Primary source.**
`upstream/web/www/horas/Latin/Sancti/06-29.txt:5-12` and
`upstream/web/www/horas/Latin/Commune/C1.txt:81-83,286-324`

`Sancti/06-29` routes through `ex C1` with `Antiphonas horas`. The C1
common provides `[Versum 1]` as `V. In omnem terram exívit sonus eórum.`
and carries the hour-specific Apostle texts under `Responsory Breve
Tertia/Sexta/Nona`, not as separate minor-hour versicle sections.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-06-29 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-06-29 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-06-29 --hour Nona
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-06-29 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-06-29 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-06-29 --hour Nona
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-06-29 | Terce | `c4c52d87` |
| Reduced - 1955 | 2024-06-29 | Sext | `447aec80` |
| Reduced - 1955 | 2024-06-29 | None | `c29f6574` |
| Rubrics 1960 - 1960 | 2024-06-29 | Terce | `c4c52d87` |
| Rubrics 1960 - 1960 | 2024-06-29 | Sext | `447aec80` |
| Rubrics 1960 - 1960 | 2024-06-29 | None | `c29f6574` |

### 2026-04-26 — All Saints minor-hour versicles shift in the Perl render surface

**Classification.** `perl-bug`

**Summary.** On Nov `1`, the simplified Roman Perl comparison surface
shifts later C3 common versicle material into the Terce/Sext/None
post-responsory versicle slot. The source-backed compositor output keeps
the proper texts in their encoded short responsory / major-hour versicle
sections and emits C3's generic `[Versum 1]` (`Lætámini...`) as the
minor-hour versicle.

**Primary source.**
`upstream/web/www/horas/Latin/Sancti/11-01.txt:5-13` and
`upstream/web/www/horas/Latin/Commune/C3.txt:84-85,294-337`

`Sancti/11-01` routes All Saints through `vide C3` with `Antiphonas
horas`. The C3 common provides `[Versum 1]` as `V. Lætámini in Dómino,
et exsultáte justi.` and carries the other proper texts under
`Responsory Breve Tertia/Sexta/Nona` plus `[Versum 2]`, not as separate
minor-hour versicle sections.

**Reproduction.**
Run:

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-11-01 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-11-01 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-11-01 --hour Nona
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-11-01 --hour Tertia
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-11-01 --hour Sexta
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-11-01 --hour Nona
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-11-01 | Terce | `a39a1839` |
| Reduced - 1955 | 2024-11-01 | Sext | `651ec0ba` |
| Reduced - 1955 | 2024-11-01 | None | `b9b2100a` |
| Rubrics 1960 - 1960 | 2024-11-01 | Terce | `a39a1839` |
| Rubrics 1960 - 1960 | 2024-11-01 | Sext | `651ec0ba` |
| Rubrics 1960 - 1960 | 2024-11-01 | None | `b9b2100a` |

### 2026-04-26 — Rubrics 1960 Advent Vespers later-block rows are blank in the Perl render surface

**Classification.** `perl-bug`

**Summary.** On Dec `1`, Dec `15`, and Dec `22`, the Rubrics 1960 Perl
comparison surface leaves the first divergent Advent Vespers later-block
row blank. The source-backed compositor emits the encoded Advent versicle
or antiphon material.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Special/Major Special.txt:1014-1016`,
`upstream/web/www/horas/Latin/Tempora/Adv3-0.txt:162-166`, and
`upstream/web/www/horas/Latin/Tempora/Adv4-0.txt:135-136`.

The source rows carry `V. Roráte, cæli...`, `Beáta es, María...`, and
`Cánite tuba...`; the compositor preserves those rows rather than matching
the blank Perl comparison surface.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-12-01 | Vespers | `9bc43811` |
| Rubrics 1960 - 1960 | 2024-12-15 | Vespers | `7d7b6199` |
| Rubrics 1960 - 1960 | 2024-12-22 | Vespers | `940e44dc` |

### 2026-04-26 — Reduced 1955 St John Matins keeps the feast-proper first-nocturn versicle

**Classification.** `perl-bug`

**Summary.** On Dec `27`, the Reduced 1955 Perl comparison surface uses
the Apostle common `[Versum 1]` (`In omnem terram...`) at the first
nocturn versicle. The St John office itself supplies a proper
`[Versum 1]` (`Valde honorandus...`), and the compositor emits that
source-backed proper versicle after the first-nocturn versicle fallback
fix.

**Primary source.**
`upstream/web/www/horas/Latin/Sancti/12-27.txt:15-17` and
`upstream/web/www/horas/Latin/Commune/C1.txt:81-83`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-12-27 | Matins | `f7c619e9` |

### 2026-04-26 — Plain `Versum 1` first-nocturn Matins offices override the psalter versicle

**Classification.** `perl-bug`

**Summary.** Several Roman Matins offices encode their first-nocturn
versicle as plain `[Versum 1]` rather than `[Nocturn 1 Versum]`. After
the Matins fallback fix, the compositor emits those office-owned
versicles. The Perl comparison surface keeps the prior psalter versicle
at the first divergent row.

**Primary source.**
`upstream/web/www/horas/Latin/Tempora/Quad1-0.txt:11-12`,
`upstream/web/www/horas/Latin/Sancti/07-06.txt:15-16`,
`upstream/web/www/horas/Latin/Commune/C6.txt:260-262`,
`upstream/web/www/horas/Latin/Tempora/Adv1-0.txt:15-16`, and
`upstream/web/www/horas/Latin/Psalterium/Special/Major Special.txt:1014-1016,1124-1179`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-18 | Matins | `7ca37aff` |
| Reduced - 1955 | 2024-07-06 | Matins | `1d5e3be7` |
| Reduced - 1955 | 2024-12-01 | Matins | `4e580c99` |
| Rubrics 1960 - 1960 | 2024-12-01 | Matins | `4e580c99` |

### 2026-04-26 — Rubrics 1960 Christmas-octave Matins uses the Nativity doxology

**Classification.** `perl-bug`

**Summary.** On Dec `26` and Dec `27`, Rubrics 1960 Matins now receives
the seasonal Nativity doxology stanza. The compositor substitutes
`Jesu, tibi sit glória,` from `Psalterium/Doxologies`, while the Perl
comparison surface leaves the C2/C1 common default hymn endings.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Doxologies.txt:1-5`,
`upstream/web/www/horas/Latin/Commune/C2.txt:20-45`, and
`upstream/web/www/horas/Latin/Commune/C1.txt:94-118`.

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-12-26 | Matins | `4956efcc` |
| Rubrics 1960 - 1960 | 2024-12-27 | Matins | `2e537874` |

### 2026-04-26 — Saturday Vespers `[Day6 Vespera]` opening antiphon is abbreviated in Perl

**Classification.** `perl-bug`

**Summary.** After the Phase 2 fix that keys First Vespers psalmody
off the evening's day-of-week, Reduced 1955 Saturday Vespers (Sat
before a privileged Sunday, e.g. `2024-02-24`) emits the source-backed
`[Day6 Vespera]` opening antiphon `Benedíctus Dóminus * suscéptor meus
et liberátor meus.` Perl abbreviates it to incipit-only
`Ant. Benedíctus Dóminus. ‡` on the same comparison surface.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:142-147`

**Reproduction.**

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-02-24 --hour Vespera
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-02-24 | Vespers | `75b87843` |

### 2026-04-26 — Rubrics 1960 Saturday Vespers `[Day6 Vespera]` closing antiphon gains an unsupported trailing `‡`

**Classification.** `perl-bug`

**Summary.** After the Phase 2 fix that keys First Vespers psalmody
off the evening's day-of-week, Rubrics 1960 Saturday Vespers
(`2024-02-24`) preserves the source-backed `[Day6 Vespera]` closing
antiphon `Fidélis Dóminus * in ómnibus verbis suis: et sanctus in
ómnibus opéribus suis.` without a trailing continuation marker. The
Perl comparison surface appends an unsupported `‡` to the same line.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:142-147`

**Reproduction.**

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-02-24 --hour Vespera
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Rubrics 1960 - 1960 | 2024-02-24 | Vespers | `b047f132` |

### 2026-04-27 — Reduced 1955 Easter-Octave weekday Matins opens with the full source antiphon

**Classification.** `perl-bug`

**Summary.** On Reduced 1955 Easter Octave weekday Matins, the
weekday offices continue to use Easter Sunday's `[Ant Matutinum]`
block, whose source carries the full antiphon `Ego sum qui sum, * et
consílium meum non est cum ímpiis, sed in lege Dómini volúntas mea
est, allelúja.` The compositor preserves that source text. The Perl
comparison surface abbreviates the antiphon to incipit-only
`Ant. Ego sum qui sum.` on several subsequent Easter Octave days.

**Primary source.**
`upstream/web/www/horas/Latin/Tempora/Pasc0-0.txt:60`

**Reproduction.**

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-04-04 --hour Matutinum
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-04-03 | Matins | `570ca05e` |
| Reduced - 1955 | 2024-04-04 | Matins | `570ca05e` |
| Reduced - 1955 | 2024-04-05 | Matins | `570ca05e` |
| Reduced - 1955 | 2024-04-06 | Matins | `570ca05e` |

### 2026-04-27 — Reduced 1955 Low Sunday Lauds preserves the source-backed proper paschal antiphon

**Classification.** `perl-bug`

**Summary.** On Reduced 1955 `2024-04-07` (Low Sunday) Lauds, the
Day0 `Laudes1` psalter-major source carries the proper Sunday paschal
antiphon `Allelúja, * Dóminus regnávit, decórem índuit, allelúja,
allelúja.` The compositor emits that source-backed antiphon. The Perl
comparison surface substitutes a generic `Ant. Allelúja, * allelúja,
allelúja.` triple-alleluia incipit, dropping the proper paschal text.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmi/Psalmi major.txt:1-6`

**Reproduction.**

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-04-07 --hour Laudes
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-04-07 | Lauds | `fe825d42` |

### 2026-04-27 — St Stephen Vespers ignores the source-backed `no Psalm5` rule

**Classification.** `perl-bug`

**Summary.** Both Reduced 1955 and Rubrics 1960 St Stephen Vespers
(`2024-12-26`) match Perl through the first 60 rendered lines (4
antiphons + 4 psalms + the opening) and then diverge. The compositor
honors the unconditional `[Rule]` line `no Psalm5` and transitions to
the capitulum `Act. 6:8`. The Perl comparison surface ignores the rule
and inherits the 5th Christmas Day antiphon `De fructu * ventris tui
ponam super sedem tuam.` plus its psalm.

**Primary source.**
`upstream/web/www/horas/Latin/Sancti/12-26.txt:9-14`

The St Stephen feast file carries an unconditional `[Rule]` block:

```
[Rule]
ex C2a;
Psalmi Dominica
Antiphonas horas
9 lectiones
no Psalm5
```

**Reproduction.**

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Reduced - 1955" --date 2024-12-26 --hour Vespera
pnpm -C packages/compositor compare:phase-3-perl -- --version "Rubrics 1960 - 1960" --date 2024-12-26 --hour Vespera
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Reduced - 1955 | 2024-12-26 | Vespers | `c5793985` |
| Rubrics 1960 - 1960 | 2024-12-26 | Vespers | `c5793985` |

### 2026-04-27 — DA Triduum Lauds / minor-hour Psalm 50:3a inline marker is omitted in Perl

**Classification.** `rendering-difference`

**Summary.** After the DA Triduum Secreto-rubric prelude lands the
silent `Pater noster` + `Ave Maria`, the next rendered line is the
opening half-verse of Psalm 50: `50:3a Miserére mei, Deus, *
secúndum magnam misericórdiam tuam.` The compositor preserves that
source-backed inline-marker line. The Perl comparison surface emits a
blank `_` line in its place across DA Triduum Lauds, Prime, Terce,
Sext, and None.

**Primary source.**
`upstream/web/www/horas/Latin/Psalterium/Psalmorum/Psalm50.txt:1` —
the Psalm 50 corpus encodes verse 3a as `Miserére mei, Deus, *
secúndum magnam misericórdiam tuam.` with the standard half-verse
numeric marker.

**Reproduction.**

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Divino Afflatu - 1954" --date 2024-03-28 --hour Laudes
```

**Affected stable divergence-row keys.**

| Policy | Date | Hour | Row key suffix |
|---|---|---|---|
| Divino Afflatu - 1954 | 2024-03-28 | Lauds | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-28 | Prime | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-28 | Terce | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-28 | Sext | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-28 | None | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-29 | Lauds | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-29 | Prime | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-29 | Terce | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-29 | Sext | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-29 | None | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-30 | Lauds | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-30 | Prime | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-30 | Terce | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-30 | Sext | `9772c004` |
| Divino Afflatu - 1954 | 2024-03-30 | None | `9772c004` |

### 2026-04-27 — DA Triduum Prime silent Credo + psalm heading order

**Classification.** `engine-bug` (compositor side, fixed)

**Summary.** This entry documents the DA Triduum Prime closeout for
completeness rather than as an upstream Perl issue. The compositor
previously skipped the silent `Credo` after the Secreto + Pater + Ave
prelude and jumped straight to `Psalmus 53 [1]`. After the Phase 3
follow-up extending `composeDATriduumSecretoSection` to append
`[Credo]` from `Common/Prayers.txt` at Prime, the compositor matches
Perl through the first ~78 lines of DA Triduum Prime.

**Primary sources.**
`upstream/web/www/horas/Ordinarium/Prima.txt:3-15` —
the Ordinarium Prime `#Incipit` block lists `$rubrica Secreto`,
`$Pater noster`, `$Ave Maria`, `$Credo` under the
`(deinde dicuntur)` annotation. The conditional `(sed rubrica
^Trident omittuntur)` keeps all four recited under DA / pre-1955
Tridentine rubrics even when the Triduum file's `Omit Incipit` rule
strips the same content under 1955 / 1960.
`upstream/web/www/horas/Latin/Psalterium/Common/Prayers.txt:16-17`
provides the `[Credo]` formula text.

**Reproduction.**

```bash
pnpm -C packages/compositor compare:phase-3-perl -- --version "Divino Afflatu - 1954" --date 2024-03-28 --hour Prima
```

**Affected stable divergence-row keys.** None remain for the Credo
opening itself: this was an engine-bug closeout, and the three DA
Triduum Prime rows moved on to the Psalm 50:3a inline-marker
rendering family listed above. The detailed closeout is recorded in
`packages/compositor/test/divergence/ADJUDICATION_LOG.md`.

## See also

- [ADR-011 — Phase 3 divergence adjudication](./adr/011-phase-3-divergence-adjudication.md)
- [ADR-012 — Compline benediction verb disposition](./adr/012-compline-benediction-verb.md)
- [Phase 3 composition engine design §15 — Validation Strategy](./phase-3-composition-engine-design.md)
