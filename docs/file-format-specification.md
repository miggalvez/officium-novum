# Divinum Officium Source File Format Specification

**Version:** 1.0 — Draft  
**Date:** April 12, 2026  
**Source analyzed:** [DivinumOfficium/divinum-officium](https://github.com/DivinumOfficium/divinum-officium) at HEAD as of 2026-04-12

This document specifies the `.txt` file format used by the Divinum Officium project. It is the contract the parser (Phase 1 of the Modernization Spec) must implement against.

---

## 1. Corpus Layout

### 1.1 Top-Level Structure

```
web/www/
├── horas/          # Divine Office (Breviary) data
├── missa/          # Mass (Missal) data
├── Tabulae/        # Calendar tables, transfer rules, version metadata
├── js/             # Frontend JavaScript
└── style/          # CSS
```

### 1.2 Language Directories

Both `horas/` and `missa/` contain one subdirectory per language:

**Full coverage:** Latin, English, Francais, Espanol, Deutsch, Italiano, Portugues, Polski  
**Partial:** Cesky-Schaller, Bohemice, Magyar, Dansk, Nederlands, Ukrainian, Vietnamice  
**Special:** Latin-gabc (with Gregorian chant notation), Latin-Bea (variant edition)

Additionally, `horas/Ordinarium/` contains language-independent structural templates (the order of each Hour).

### 1.3 Content Directories (within each language)

| Directory | Content | Naming Convention |
|-----------|---------|-------------------|
| `Tempora/` | Temporal cycle (moveable feasts, seasons) | Code-based: `Adv1-0.txt`, `Pasc0-0.txt`, `Pent01-0.txt` |
| `Sancti/` | Sanctoral cycle (fixed feasts) | Date-based: `MM-DD.txt` (e.g., `01-25.txt`) |
| `Commune/` | Common texts (shared by categories of saints) | Named: `C1.txt` (Apostles), `C2.txt` (Martyrs), etc. |
| `Psalterium/` | Psalter, canticles, hymns | Descriptive: `Psalmi/Psalmi major.txt` |
| `Martyrologium/` | Daily martyrology readings | Date-based |
| `Appendix/` | Supplementary prayers (litanies, etc.) | Descriptive |
| `Regula/` | Monastic rules | Descriptive |

### 1.4 Rubrical Variant Directories

Different liturgical traditions use parallel directory trees:

| Suffix | Tradition |
|--------|-----------|
| *(none)* | Roman (default for 1570, 1910, 1955, 1960) |
| `M` | Monastic / Benedictine (`TemporaM/`, `SanctiM/`, `CommuneM/`) |
| `Cist` | Cistercian (`TemporaCist/`, `SanctiCist/`, `CommuneCist/`) |
| `OP` | Dominican / Order of Preachers (`TemporaOP/`, `SanctiOP/`, `CommuneOP/`) |

The Perl engine selects the directory by version name (see `subdirname` in `horascommon.pl`). Roman variants (1570–1960) all share the same files and differentiate via in-file conditionals.

### 1.5 File Naming Conventions

#### Tempora files

Format: `{SeasonCode}{WeekNumber}-{DayOfWeek}.txt`

| Pattern | Meaning | Example |
|---------|---------|---------|
| `Adv1-0` | Advent Week 1, Sunday | First Sunday of Advent |
| `Quad6-5` | Lent Week 6, Friday | Good Friday |
| `Pasc0-0` | Easter Week 0, Sunday | Easter Sunday |
| `Pent01-0` | Pentecost Week 1, Sunday | Trinity Sunday |
| `Nat2-0` | Christmas Week 2, Sunday | Sunday within Octave of Christmas |
| `081-0` | August, Week 1, Sunday | Sunday I in August |
| `093-3` | September Ember Days, Wednesday | September Ember Wednesday |

Day of week: 0 = Sunday, 1 = Monday, ... 6 = Saturday.

**Additional Tempora patterns** found in the corpus that do not follow the `{Season}{Week}-{Day}` convention:

| Pattern | Example | Meaning |
|---------|---------|---------|
| `Nat01` | `Nat01.txt` | Named Christmas-season file |
| `XPRex` | `XPRex.txt` | Christ the King |
| `{Season}{Week}-{Day}Feria` | `Pasc2-3Feria.txt` | Feria-specific variant |
| `PentEpi{Week}-{Day}` | `PentEpi6-0.txt` | Post-Epiphany weeks (numbered after Pentecost) |

#### Sancti files

Format: `MM-DD[suffix].txt`

| Suffix | Meaning | Example |
|--------|---------|---------|
| *(none)* | Main feast | `01-25.txt` (Conversion of St. Paul) |
| `r` | Rubrical variant | `01-25r.txt` |
| `cc` | Commemoration entry | `01-05cc.txt` |
| `n` | New/octave variant | `01-06n.txt` |
| `o` | Old rubric variant | `12-25o.txt` |
| `t` | Tertiary saint | `07-21t.txt` |
| `m1`, `m2`, `m3` | Multiple Masses on same day | `12-25m1.txt` (Christmas midnight Mass) |
| `bmv` | Blessed Virgin Mary variant | Various |
| `g` | Gregorian variant | `01-08g.txt` |
| `oct` | Octave file | Various |
| `pl` | Plures (multiple saints) | Various |
| `secm1`, `secm2` | Secondary Mass variants | `11-03secm1.txt` |

---

## 2. File Format

### 2.1 Encoding

All files are **UTF-8 plain text** with Unix or Windows line endings. Latin text preserves diacritical marks (acute accents: á, é, í, ó, ú; ligatures: æ, œ; special: ǽ, ǿ).

### 2.2 Section Headers

The primary structural unit is the **section**, delimited by square-bracket headers:

```
[SectionName]
content lines...
```

**Header regex** (from Perl source): `^\s*\[([\pL\pN_ #,:-]+)\]`

Section names may contain: letters (Unicode), digits, underscores, spaces, `#`, commas, colons, hyphens.

#### Conditional section headers

A section header may be followed by a parenthetical condition:

```
[Rank] (rubrica 196)
[Ant Vespera 3] (nisi rubrica cisterciensis)
[Commemoratio Oratio] (rubrica tridentina)
[Prelude](rubrica 1570 aut rubrica divino)
```

When multiple `[Rank]` (or other) sections exist in the same file, the engine selects the one whose condition matches the active version, or the unconditioned default.

### 2.3 Section Types

#### Metadata sections

| Section | Purpose | Present in |
|---------|---------|------------|
| `[Officium]` | Feast/office display name | horas |
| `[Rank]` | Liturgical rank, class, weight, derivation | Both |
| `[Rule]` | Processing directives for the engine | Both |
| `[Name]` | Alternative display names | Both |

#### Office sections (horas)

| Section | Content |
|---------|---------|
| `[Invit]` | Invitatory antiphon |
| `[Ant Vespera]`, `[Ant Laudes]`, `[Ant Matutinum]` | Antiphon sets for Hours |
| `[Ant 1]`, `[Ant 2]`, `[Ant 3]` | Numbered antiphon sets |
| `[Ant Vespera 3]` | Third-scheme Vespers antiphons |
| `[Hymnus Vespera]`, `[Hymnus Matutinum]`, `[Hymnus Laudes]` | Hymns |
| `[HymnusM Vespera]` | Alternative hymn text (Monastic/variant) |
| `[Capitulum Laudes]`, `[Capitulum Sexta]`, `[Capitulum Nona]` | Chapter readings per Hour |
| `[Lectio1]` through `[Lectio9]` | Matins readings (up to 9) |
| `[Lectio Prima]` | Prime reading |
| `[Responsory1]` through `[Responsory9]` | Responsories after readings |
| `[Versum 0]`, `[Versum 1]`, `[Versum 2]` | Versicles |
| `[Nocturn 1 Versum]`, `[Nocturn 2 Versum]`, `[Nocturn 3 Versum]` | Nocturn-specific versicles |
| `[Oratio]` | Collect/prayer |
| `[Commemoratio]`, `[Commemoratio2]`, `[Commemoratio 3]`, `[Commemoratio4]` | Commemoration blocks |
| `[Special Vespera 1]` | Special structural overrides |
| `[Lectio4 in 2 loco]` ... `[Lectio9 in 2 loco]` | Alternative reading sets |

#### Mass sections (missa)

| Section | Content |
|---------|---------|
| `[Introitus]` | Entrance antiphon |
| `[Oratio]` | Collect |
| `[Lectio]` | Epistle reading |
| `[Graduale]` | Gradual chant |
| `[GradualeP]` | Paschal gradual variant |
| `[GradualeF]` | Ferial gradual variant |
| `[Tractus]` | Tract (Lenten replacement for Alleluia) |
| `[Evangelium]`, `[Evangelium1]` | Gospel reading (numbered variants for multi-reading days, e.g. Passion) |
| `[Offertorium]` | Offertory antiphon |
| `[Secreta]` | Secret prayer |
| `[Communio]` | Communion antiphon |
| `[Postcommunio]` | Post-Communion prayer |
| `[Prelude]` | Pre-Mass ceremonies (e.g., Candlemas blessing) |
| `[Commemoratio Oratio]`, `[Commemoratio Secreta]`, `[Commemoratio Postcommunio]` | Commemoration propers |
| `[LectioL1]`, `[GradualeL1]`, `[OratioL1]` | Variant readings for specific traditions |
| `[Super populum]` | Prayer over the people (Lenten Masses) |
| `[Post Missam]` | Post-Mass ceremonies or hymns |
| `[Maundi]` | Maundy / washing of feet ceremony |
| `[Rank1960]` | Alternative rank entry for 1960 rubrics (version-specific override) |
| `[Oratio pro commemoratio]` | Prayer for commemoration (with optional parenthetical note) |

#### Psalterium sections

Psalter files use a day-hour key:

```
[Day0 Laudes1]    Day 0 (Sunday), Lauds, scheme 1
[Day0 Laudes2]    Day 0 (Sunday), Lauds, scheme 2
[Day0 Vespera]    Day 0 (Sunday), Vespers
[Day1 Laudes1]    Day 1 (Monday), Lauds, scheme 1
...
```

---

## 3. Inline Syntax

### 3.1 Cross-References (`@`)

The `@` directive includes content from another file or section. This is the primary mechanism for text reuse.

**Syntax variants:**

| Pattern | Meaning | Example |
|---------|---------|---------|
| `@Path/File` | Include the **same-named section** from that file (section name defaults to the enclosing section's key) | `@Tempora/Nat30` |
| `@Path/File:Section` | Include a specific section from file | `@Sancti/06-30:Responsory3` |
| `@:Section` | Include section from current file | `@:Ant Vespera` |
| `@Path/File:Section:s/OLD/NEW/g` | Include with regex substitution | `@:Ant Vespera 3:s/;;.*//g` |

> **Important:** `@Path/File` without a `:Section` suffix does **not** include the entire file. The engine uses the current section's key as the implicit section name to look up in the target file (`SetupString.pl:670`: `$2 ? $2 : $key`). Whole-file inclusion is a separate mechanism — see **Preamble Includes** below.

#### Preamble Includes (`__preamble`)

Whole-file inclusion uses a special `__preamble` pseudo-section. When a file contains `@` directives in the preamble area (before or outside any named section), the engine treats them as whole-file includes: it loads all sections from the referenced file and merges them into the current file using `||=` (existing sections in the current file take precedence). The `__preamble` key is deleted after processing. This is primarily used for monastic daisy-chaining.

#### Line/Range Selectors

Include directives support line selection and inverse selection after the section reference:

| Syntax | Meaning | Example |
|--------|---------|---------|
| `:N` | Select only line N (1-based) | `@Sancti/12-27::1` |
| `:N-M` | Select lines N through M | `@Sancti/12-27::1-5` |
| `:!N-M` | Select all lines **except** N through M (inverse) | `@Sancti/12-27:Lectio2:!2-3` |

Selectors and substitutions can be chained: `@Sancti/12-27::1-5 s/-5/-3/`

Real examples from `SanctiOP/12-27.txt`:
```
@Sancti/12-27::1-5 s/-5/-3/
@Sancti/12-27:Lectio1:6-7
@Sancti/12-27:Lectio2:!2-3 s/6-10/8-10/
```

**Resolution rules:**
- Path is relative to the language directory (e.g., `@Sancti/06-30` resolves to `{lang}/Sancti/06-30.txt`)
- When a section contains only an `@` reference, the entire section content is replaced
- An `@` reference can appear inline within a section (mixed content)
- Resolution is recursive: a referenced section may itself contain `@` references
- Language fallback is layered (see §10.12)

### 3.2 Psalm References (`;;`)

Double semicolons followed by a number reference a psalm:

```
Allelúja, * Dóminus regnávit, decórem índuit, allelúja, allelúja.;;92
```

This means: antiphon text `*` with psalm 92. The `*` marks the mediation point of the antiphon (where it splits for intoning).

Bare psalm references (no antiphon):
```
;;50
;;117
;;62
```

### 3.3 Psalm Inclusion (`&psalm()`)

Includes the full text of a psalm inline:

```
&psalm(116)
&psalm(232)
```

The number maps to a psalm file in the Psalterium.

### 3.4 Macro References (`&`)

The `&` prefix references reusable liturgical fragments defined in the Ordinarium:

```
&Deus_in_adjutorium
&Alleluia
&Dominus_vobiscum
&Benedicamus_Domino
&Domine_labia
&Gloria
&Divinum_auxilium
&introitus
```

### 3.5 Dollar-Sign Directives (`$`)

The `$` prefix references common prayer formulas or procedural instructions:

| Directive | Meaning |
|-----------|---------|
| `$Per Dominum` | Standard concluding formula ("Per Dominum nostrum...") |
| `$Per eumdem` | Variant concluding formula |
| `$Qui tecum` | Marian concluding formula |
| `$Qui vivis` | Another concluding formula |
| `$Deo gratias` | Response "Thanks be to God" |
| `$Oremus` | "Let us pray" |
| `$Pater noster` | Lord's Prayer |
| `$Ave Maria` | Hail Mary |
| `$Credo` | Creed |
| `$Fidelium animae` | Prayer for the faithful departed |
| `$Pater totum secreto` | Lord's Prayer said silently |
| `$rubrica Secreto` | Rubric: "in silence" |
| `$rubrica Clara voce` | Rubric: "aloud" |
| `$rubrica Matutinum` | Rubric: Matins instructions |
| `$rubrica Incipit` | Rubric: beginning instructions |
| `$Per Dominum eiusdem` | Concluding formula variant (same Spirit) |

### 3.6 Scripture Citations (`!`)

Lines beginning with `!` mark scripture references or rubrical headings:

```
!Act 9:1-5              Scripture citation (Acts 9:1-5)
!Ps 24:1-3              Psalm citation
!Tit 2:11-15            Epistle citation
!Sermo 14 de Sanctis    Patristic source reference
!Oratio propria          Rubric note: "proper prayer"
!Commemoratio S. Petri   Rubric heading for a commemoration
```

When followed by verse text, the `!` line identifies the source; the text below is the actual content.

### 3.7 Hymn Identifiers (`{:H-...:}`)

Hymn sections may begin with an identifier tag for cross-referencing:

```
{:H-Exsultetorbisgaudiis:}v. Exsúltet orbis gáudiis:
{:H-AeternaChristi:}v. Ætérna Christi múnera,
```

Format: `{:H-HymnID:}` followed by the first line of the hymn.

### 3.8 Verse/Response Markers

| Marker | Role |
|--------|------|
| `v.` | Verse text (lower-case v for regular verse) |
| `V.` | Versicle (upper-case V in responsorial pairs) |
| `R.` | Response |
| `M.` | Minister's part |
| `S.` | Sacerdos (priest's part) |

### 3.9 Structural Markers

| Marker | Meaning |
|--------|---------|
| `_` | Visual separator / blank line |
| `#` | Major structural heading (e.g., `#Incipit`, `#Invitatorium`, `#Hymnus`) |
| `*` | Antiphon mediation point (within antiphon text) |
| `++` | Sign of cross in Gospel reading (e.g., `Sequéntia ++ sancti Evangélii`) |
| `+` | Sign of cross (blessing) |

---

## 4. Conditional System

### 4.1 Condition Syntax

Conditions appear in parentheses, either after section headers or as standalone lines within sections:

```
(rubrica 196)                          Matches 1960 rubrics
(rubrica tridentina)                   Matches Tridentine versions
(rubrica cisterciensis)                Matches Cistercian versions
(rubrica monastica)                    Matches Monastic versions
(rubrica praedicatorum)                Matches Dominican versions
(rubrica altovadensis)                 Matches Altovadensis (Cistercian variant)
(rubrica 1955)                         Matches 1955 rubrics
(rubrica 1963)                         Matches 1963 rubrics
(rubrica innovata)                     Matches "innovated" (reformed) rubrics
(rubrica divino)                       Matches Divino Afflatu rubrics
```

### 4.2 Condition Operators

```
(rubrica X aut rubrica Y)             OR: matches X or Y
(rubrica X aut rubrica Y aut ...)     Chained OR
(rubrica X et tempore Y)              AND: both must hold
(nisi rubrica X)                       NOT: matches everything except X
(sed rubrica X omittitur)             This content is omitted under rubric X
(sed rubrica X omittuntur)            Plural: these contents are omitted
(sed rubrica X hæc versus omittuntur) More specific omission
(sed die Epiphaniæ ... omittitur)     Conditional on specific feast day
```

**Operator precedence:** `et` binds **tighter** than `aut`. The engine splits on `aut` first (outer loop), then evaluates `et`/`nisi` within each branch (inner loop). This means `A et B aut C` is evaluated as `(A et B) aut C` — any single `aut` branch succeeding makes the whole condition true. (Note: the source comment at `SetupString.pl:268` says "aut binds tighter" but the code does the opposite.)

**Unknown predicates:** If a predicate is not recognized, it is treated as a case-insensitive regex and matched against the subject. For example, `(tempore Quadragesim)` matches any season string containing "Quadragesim".

### 4.3 Stopwords and Scope

Conditions can be preceded by **stopwords** that control backward/forward scoping — how many preceding (or following) lines are affected by the conditional result:

| Stopword | Weight | Scope direction |
|----------|--------|----------------|
| `si` | 0 | Forward only |
| `sed`, `vero` | 1 | Backward + forward |
| `atque` | 2 | Backward + forward |
| `attamen` | 3 | Backward + forward |
| `deinde` | 1 | Forward only |

Stopword weights are summed when multiple appear. Higher weight = larger backward scope (more preceding lines are suppressed/included).

### 4.4 Flow Directives

```
(deinde dicuntur)                      "Then these are said"
(deinde dicitur)                       "Then this is said" (singular)
(deinde rubrica monastica dicitur)     "Then under monastic rubric this is said"
(deinde rubrica monastica dicuntur)    Plural
```

### 4.5 Escaped Conditional Lines (`~`)

A line beginning with `~` is **excluded from conditional parsing**. The `~` is stripped and the remaining text is output literally (assuming the enclosing block is affirmative). This prevents parenthesized liturgical rubric text from being misinterpreted as a conditional expression.

Example from `Tempora/Quad6-6.txt`:
```
~(Tunc, detecto Calice, dicit:)~
```

Without the leading `~`, `(Tunc, detecto Calice, dicit:)` would be parsed as a conditional.

### 4.6 Condition Evaluation Context

The Perl engine evaluates conditions against a set of **subjects** (the `%subjects` hash in `SetupString.pl`). If the subject is omitted, it defaults to `tempore`.

| Subject | Resolves to | Example condition |
|---------|-------------|-------------------|
| `rubricis`, `rubrica` | Active version string | `(rubrica 1960)` |
| `tempore` | Liturgical season identifier | `(tempore Quadragesimæ)` |
| `feria` | Day of week, **1-based**: 1=Sunday ... 7=Saturday (computed as `dayofweek + 1`) | `(feria 2)` |
| `mense` | Month (1-12) | `(mense 12)` |
| `die` | Special day name | `(die Epiphaniæ)` |
| `missa` | Mass number (for days with multiple Masses) | `(missa brevior)` |
| `communi` | Active version string (alias for `rubrica` in commune contexts) | `(communi Summorum Pontificum)` |
| `commune` | Active commune identifier | `(commune C4)` |
| `votiva` | Active votive identifier | `(votiva ...)` |
| `officio` | Office/day name | `(officio feriali)` |
| `ad` | `'missam'` during Mass, otherwise the current Hour name | `(ad Laudes)` |
| `tonus`, `toni` | Chant tone (GABC-specific) | `(tonus solemnis)` |

---

## 5. Rank Field Format

The `[Rank]` section has a specific delimited format:

```
[Rank]
{FeastTitle};;{RankName};;{ClassWeight};;{Derivation}
```

| Field | Description | Examples |
|-------|-------------|---------|
| Feast Title | Display name of the feast (may be empty) | `In Conversione S. Pauli Apostoli` |
| Rank Name | Liturgical rank | `Duplex I classis`, `Duplex majus`, `Semiduplex`, `Simplex`, `Feria` |
| Class Weight | Numeric precedence weight | `7` (highest), `5.09`, `4`, `2.1`, `1.2` |
| Derivation | Source reference | `ex Sancti/06-30`, `ex Sancti/12-25m3` |

Separator: `;;` (double semicolon).

Multiple rank lines may appear, each optionally preceded by a condition:

```
[Rank]
;;Duplex majus;;4;;ex Sancti/06-30
(sed rubrica innovata)
;;Duplex Fest;;5;;ex Sancti/06-30
(sed rubrica cisterciensis)
;;MM. maj.;;4.1;;ex Sancti/06-30
```

---

## 6. Rule Field Directives

The `[Rule]` section contains processing instructions for the engine, one per line:

| Directive | Meaning |
|-----------|---------|
| `ex Sancti/12-25m3;` | Derive base content from another file |
| `vide Sancti/01-01` | "See" — redirect entirely to another file |
| `9 lectiones` | Matins has 9 readings |
| `9 lectiones 1960` | 9 readings only under 1960 rubrics |
| `1 nocturn` | Matins has 1 nocturn only |
| `Omit Hymnus Preces Suffragium Commemoratio` | Suppress specific sections |
| `Minores sine Antiphona` | Minor Hours without antiphons |
| `Capitulum Versum 2` | Use second versicle scheme for chapter |
| `Psalmi Dominica` | Use Sunday psalm scheme |
| `Psalm5Vespera=116` | Override: 5th Vespers psalm is 116 |
| `Psalm5 Vespera3=138` | Override: 5th psalm of Vespers scheme 3 |
| `Prima=53` | Override: Prime uses psalm 53 |
| `Antiphonas horas` | Use proper antiphons for the Hours |
| `Gloria` | Gloria is said |
| `Credo` | Creed is said |
| `Prefatio=Nat` | Use Nativity preface |

---

## 7. Calendar Tables (`Tabulae/`)

### 7.1 Version Registry (`data.txt`)

CSV format mapping version names to their calendar and transfer rule files:

```
version,kalendar,transfer,stransfer,base,transferbase
Tridentine - 1570,1570,1570,1570
Rubrics 1960 - 1960,1960,1960,1960,Reduced - 1955
```

Fields parsed by `Directorium.pm`:

| Field | Variable | Purpose |
|-------|----------|---------|
| `version` | `$ver` | Version display name |
| `kalendar` | `$kal` | Kalendarium file to use |
| `transfer` | `$tra` | Transfer rules file |
| `stransfer` | `$str` | Sanctoral transfer rules file |
| `base` | `$base` | Base version for Kalendarium inheritance |
| `transferbase` | `$tbase` | Base version for Transfer inheritance (may differ from `base`) |

The `base` column enables inheritance for **kalendarium** lookups: if a date is not found in the version's kalendarium, the engine checks the base version, recursively. The `tbase` column does the same for **transfer** lookups. The engine selects which base to use based on the query subject (`'base'` for kalendar, `'tbase'` for transfers).

### 7.2 Kalendarium Files (`Kalendaria/{version}.txt`)

Calendar entries mapping dates to feasts:

```
*January*
01-18=01-18r=S Priscae Virginis=1=
01-25=01-25r=In Conversione S. Pauli Apostoli=4=
```

Format: `{date}={sancti-file}[~{alternate}]={feast-name}={rank}=[{commemoration}]`

The loader does `split(/=/)` and captures only the first two tokens: the **date key** (`$day`) and the **file reference** (`$file`). Everything after the second `=` (feast name, rank, commemoration fields) is discarded at load time — those fields are used only by the calendar-display UI, not by the file-resolution engine. The `~` character within the file-reference token separates alternate feast assignments (e.g., `01-09~01-15`); these are split later during resolution (`horascommon.pl:156`).

Lines with `XXXXX` suppress a feast that existed in a base version. The `#` prefix marks comments. `*Month*` lines are section headers.

### 7.3 Transfer Files (`Transfer/`)

Rules for transferring impeded feasts to other dates, varying by year (since Easter moves).

Transfer lines support **per-version filters** using `;;` as a delimiter:

```
01-02=Tempora/Nat2-0;;DA Newcal 1960 M1930 M1963B CAV
01-09=01-08;;1570 1888 1906 M1617 M1930 C1951 CAV
01-10=01-09~01-15;;M1930 C1951 CAV
```

The text after `;;` is a version filter: the transfer rule only applies if the active version's data matches the filter regex. If no `;;` is present, the rule applies to all versions.

---

## 8. Commemoratio Block Structure

Commemoration sections follow a fixed layout:

```
[Commemoratio4]
!Commemoratio S. Petri Apostoli       ← heading (rubric instruction)
(deinde dicuntur)                      ← optional flow directive
Ant. Tu es pastor óvium...            ← antiphon (prefixed "Ant.")
_                                      ← separator
V. Tu es Petrus.                      ← versicle
R. Et super hanc petram...            ← response
_                                      ← separator
$Oremus                               ← "Let us pray"
(sed rubrica 196 hæc versus omittuntur) ← conditional
v. Deus, qui beáto Petro...           ← prayer text
$Qui vivis                            ← concluding formula
```

---

## 9. Cross-Reference Resolution Order

When the engine resolves content for a given date, version, and hour:

1. Look up the date in the version's Kalendarium (with base-version fallback)
2. Load the Sancti file for the date
3. Load the Tempora file for the date (computed from the temporal cycle)
4. Run **occurrence** resolution: determine which takes precedence
5. Load the winning file's sections, resolving `__preamble` whole-file includes first, then per-section `@` cross-references recursively
6. Apply conditional evaluation against the active version (including stopword scoping, `~`-escaped lines)
7. For sections not present in the feast file, fall back to `Commune/` files (via `ex` directive in `[Rule]`)
8. For psalms and structural elements, load from `Psalterium/` and `Ordinarium/`
9. Language fallback at each file-load step: requested lang → dashed parent → `langfb` → Latin; rite fallback: `Cist` → `M` → Roman, `OP` → Roman

---

## 10. Parser Requirements

The parser must handle:

1. **UTF-8 with liturgical diacritics** — accented Latin vowels, ligatures (æ, œ)
2. **Section splitting** — regex-based on `[SectionName]` headers, including conditional variants
3. **Recursive `@` resolution** — with cycle detection to prevent infinite loops
4. **Regex substitution in references** — `@:Section:s/OLD/NEW/flags`
5. **`;;` psalm references** — both inline (with antiphon text) and bare
6. **`&` macro expansion** — psalm includes and liturgical fragment references
7. **`$` formula expansion** — common prayer conclusions
8. **`!` citation parsing** — distinguish scripture refs from rubrical headings
9. **Conditional evaluation** — `rubrica X`, `nisi`, `sed...omittitur`, `aut` chains
10. **Rank parsing** — `;;`-delimited fields with weight and derivation
11. **Rule directive parsing** — per-line key-value or key=value directives
12. **Language fallback** — layered chain: requested language → dashed-parent language (e.g., `Latin-Bea` → `Latin`) → `langfb` (configured fallback language) → Latin
13. **Rite-directory fallback** — when a file is not found in a rite-specific directory, the engine falls back through: `Cist` → `M` (Monastic/OSB) → Roman (no suffix); also `OP` → Roman
14. **Kalendarium lookup with version inheritance** — recursive base-version chain (using `base` for kalendar, `tbase` for transfers)

---

## 11. Statistics

| Metric | Count |
|--------|-------|
| Total files in repository | ~34,800 |
| Languages with content | 16 |
| Latin Office files (Tempora) | ~638 |
| Latin Office files (Sancti) | ~486 |
| Latin Office files (Commune) | ~59 |
| Latin Psalterium files | ~222 |
| Rubrical traditions | 4 (Roman, Monastic, Cistercian, Dominican) |
| Rubrical versions (Roman) | 6+ (1570, 1888, 1906, 1939, 1954, 1955, 1960) |
| Mass sections per file | ~12 (Introitus through Postcommunio) |
| Office sections per file | ~20+ (Invit through Commemoratio) |
