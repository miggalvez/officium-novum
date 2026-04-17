# Phase 2g-beta Matins Corpus Inventory (Pre-Implementation)

Date: 2026-04-16

This inventory captures direct corpus observations made before any Phase 2g-beta code changes.

## Files surveyed

- `upstream/web/www/horas/Ordinarium/Matutinum.txt`
- `upstream/web/www/horas/Latin/Sancti/08-15.txt`
- `upstream/web/www/horas/Latin/Sancti/10-07.txt`
- `upstream/web/www/horas/Latin/Tempora/Adv1-0.txt`
- `upstream/web/www/horas/Latin/Tempora/Pent17-6.txt`
- Additional 1-nocturn control sample: `upstream/web/www/horas/Latin/Tempora/Pasc0-2.txt`

## Confirmed section/header shape

### 1) Ordinarium Matins skeleton (`Ordinarium/Matutinum.txt`)

Heading markers are top-level `#...` headers, six total:

1. `#Incipit`
2. `#Invitatorium`
3. `#Hymnus`
4. `#Psalmi cum lectionibus`
5. `#Oratio`
6. `#Conclusio`

No finer-grained `#...` headings exist for per-nocturn antiphons, versicles, lessons, or responsories.

### 2) 9-lesson festal shape (`Sancti/08-15.txt`)

Observed Matins-relevant sections:

- `[Invit]`
- `[Hymnus Matutinum]`
- Single `[Ant Matutinum]` block containing 9 antiphon lines
- `[Nocturn 1 Versum]`, `[Nocturn 2 Versum]`, `[Nocturn 3 Versum]`
- `[Lectio1]` ... `[Lectio9]`
- `[Responsory1]` ... `[Responsory9]`

Important layout facts:

- Antiphon lines encode psalm references in `;;NN` tails (for example `...;;8`, `...;;18`, ... `...;;97`).
- There are no `[Psalmus Matutinum N]` sections.
- There is no `[Te Deum]` section in the feast file; a `&teDeum` marker may appear inside a lesson block.

### 3) Rubrical variant feast (`Sancti/10-07.txt`)

Observed Matins-relevant sections:

- `[Invit]`
- `[Hymnus Matutinum]` plus `(rubrica 196)` variants
- Single `[Ant Matutinum]` with 9 antiphon lines, each carrying `;;NN`
- `[Nocturn 1 Versum]`, `[Nocturn 2 Versum]`, `[Nocturn 3 Versum]`
- `[Lectio1]` ... `[Lectio9]` with alternate/rubrical variants (`[Lectio8]`, `[Lectio8] (rubrica 196)`, `[Lectio9] (rubrica 196)`)
- `[Responsory1]` ... `[Responsory8]` (no explicit `[Responsory9]` section in this file)

### 4) Sunday temporal file (`Tempora/Adv1-0.txt`)

Observed Matins-relevant sections:

- `[Lectio1]` ... `[Lectio9]`
- `[Responsory1]` ... `[Responsory9]`

Not present in this file:

- `[Invit]`
- `[Hymnus Matutinum]`
- `[Ant Matutinum]`
- `[Nocturn N Versum]`

This confirms fallback-heavy seasonal files exist where Matins plan inputs are incomplete at section level.

### 5) Ember Saturday temporal file (`Tempora/Pent17-6.txt`)

File contains only:

- `[Officium]`
- `[Rank]`
- `[Rule]`

No Matins-specific sections are present.

## Antiphon index -> nocturn partitioning (for plan model)

From the observed 9-line `[Ant Matutinum]` files and the `;;NN` tail encoding:

- Standard 9-lesson shape partitions antiphons by index:
  - indices 1-3 -> nocturn 1
  - indices 4-6 -> nocturn 2
  - indices 7-9 -> nocturn 3

From 1-nocturn control sample (`Tempora/Pasc0-2.txt`, rule `1 nocturn`):

- 1-nocturn shape uses only first-nocturn material (indices 1-3 when antiphons are indexed as a set).

## Additional implementation-facing observations

- Matins section naming in source files uses `[Invit]` (not `[Invitatorium]`).
- Lesson and responsory section names are compact (`[Lectio1]`, `[Responsory1]`), with no space before the index.
- Rubrical section variants are common (`(rubrica 196)`, underscore suffices, and alternate-locus section names), so lookup must tolerate location/gate selection and missing direct sections.
