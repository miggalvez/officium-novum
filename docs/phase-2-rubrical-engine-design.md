# Phase 2 — Rubrical Engine Design

**Version:** 1.1 — Draft
**Date:** April 14, 2026
**Status:** Proposal
**Prerequisite:** Phase 1 (Parser) complete. This document depends on `docs/divinum-officium-modernization-spec.md` §5.2 and `docs/file-format-specification.md`.

**Changelog:**

- *1.1 (Apr 14, 2026)* — Four structural revisions driven by external review:
  1. Separated *Version* from *Policy*. `VersionHandle` / `ResolvedVersion` replace `RubricSystem` as the primary engine identifier; policy is derived via a data mapping (§4.3, §5, §11).
  2. Introduced `DirectoriumOverlay` (§8) as a first-class pipeline stage covering feast translation, Sancti → Tempora reassignment, `dirge1/2/3` scheduling, `HyMM-DD` hymn merge/shift, and `Stransfer` scripture redirect.
  3. Added §12 *Rule Evaluation* as a dedicated stage between occurrence and the Hour structurer. The winning feast's `[Rule]` directives become a typed `CelebrationRuleSet`; subsequent stages consume that, never the raw directives.
  4. Rewrote §16 *Hour Structuring* as an application of a `CelebrationRuleSet` plus hour-local `HourRuleSet` against an Ordinarium skeleton. Promoted Matins to §16.3 with a dedicated `MatinsPlan`, lesson sourcing, commemorated-lesson assignment, `in N loco` alternative-set handling, and `Stransfer` integration.

  Section numbering shifted from v1.0 to accommodate the new stages; see §3.1 for the revised pipeline.
- *1.0 (Apr 12, 2026)* — Initial proposal.

---

## 1. Purpose

Phase 2 encodes the decision logic that, given a civil date and a rubrical system, determines *what is prayed* on that day. The Parser (Phase 1) tells us what every text block *is*; the Rubrical Engine decides *which blocks apply*. It is a pure domain library: no I/O, no rendering, no text retrieval. Its output is a structured set of references that downstream phases resolve and compose.

This is the load-bearing wall of the project. The Parser's correctness is checkable locally against a file's `.txt` contents — a warning either fires or it doesn't. The Rubrical Engine's correctness is checkable only against the published *Ordo Recitandi* and the governing rubrical documents. A bug here means someone prays the wrong Office on a real day. Every design choice in this document is aimed at making such bugs detectable, reproducible, and fixable.

---

## 2. Scope

### 2.1 In Scope

The engine must answer this question, exhaustively, for every day of the Gregorian calendar between 1583-01-01 and a reasonable upper bound (e.g., 2099-12-31):

> **Given `(date, version)`, produce an `OrdoEntry` that fully specifies the primary celebration, all commemorations, and — for each canonical Hour — the references required to assemble that Hour.**

Here *version* is a handle into `Tabulae/data.txt` (e.g., `"Rubrics 1960 - 1960"`, `"Divino Afflatu - 1954"`) — a tuple of `(kalendar, transfer, stransfer, base, transferBase)` from which a `RubricalPolicy` is derived. See §4.3 and §5.

Concretely, Phase 2 covers:

1. **Temporal cycle computation.** Compute Easter, Septuagesima, Ash Wednesday, Ascension, Pentecost, Advent, and all other moveable observances from the date. Derive the liturgical day name (`Pasc1-0`, `Adv2-3`, `Quad5-5`, etc.) used across the corpus.

2. **Sanctoral cycle lookup.** Given a date, find the fixed-date entries from the version's effective `Kalendaria/<kalendar>.txt` (merged across the `base` inheritance chain), including alternates and `XXXXX` suppression markers.

3. **Directorium overlay.** Apply per-year directives from `Transfer/<year-key>.txt` and `Stransfer/<year-key>.txt`: feast translations (Sancti ↔ Sancti, Sancti → Tempora), `dirge1/2/3` scheduling of the Office of the Dead, `HyMM-DD` hymn merge/shift overrides, and Matins scripture redirects. This is a layer, not a set of extra candidates (see §8).

4. **Occurrence resolution.** When a temporal and sanctoral observance coincide, decide which is the "Office of the day" and what becomes a commemoration, an omission, or a transferred feast. Handles every rank class defined by each rubrical system and every privileged season's overrides.

5. **Concurrence resolution.** For Vespers (and Compline), decide how today's Second Vespers interacts with tomorrow's First Vespers. Produce the correct composite Vespers and the correct commemorations on both sides of the boundary.

6. **Translation.** For impeded feasts that are not simply suppressed or commemorated, compute the correct target date under the rules of the active system. Cross-check against the year-specific `Transfer` tables where they exist, but produce the right answer even for years not pre-tabulated.

7. **Rule evaluation.** Parse and apply the winning feast's `[Rule]` section, producing a typed `CelebrationRuleSet` of hour-agnostic structural outcomes (Matins lesson count, first/second Vespers existence, lesson-source choice, omission of commemorations, etc.). Hour-local rules are derived later as `HourRuleSet` values inside the Hour structurer (§12, §16).

8. **Commemoration assembly.** Produce the ordered list of commemorations for each Hour at which commemorations may be made, in the correct order of dignity, respecting rubrical limits (`climit1960`, privileged-season reductions, etc.).

9. **Hour structuring.** For each of Matins, Lauds, Prime, Terce, Sext, None, Vespers, Compline: take the Ordinarium skeleton for that Hour, derive an `HourRuleSet` from the hour-agnostic `CelebrationRuleSet`, evaluate the Ordinarium's paragraph-scoped conditionals against the active context, and fill slots by proper → commune → psalterium resolution. Matins is modelled separately (§16.3) because its lesson plan is structurally richer.

10. **Votive offices and ad libitum selections.** Saturday Office of Our Lady on free Saturdays; votive offices (Dead, Passion, etc.) where the user can opt in.

11. **Rubrical system support.** At minimum: *Divino Afflatu* (1911/1939/1954 variants), *Reduced 1955*, *Rubrics of 1960*. The engine is parameterised such that 1570, Monastic, Cistercian, and Dominican can be added later without redesign. Policy is selected via the version, not hard-coded per rubric symbol (§11).

### 2.2 Out of Scope

- **Text retrieval.** The engine emits references (`{path: "horas/Latin/Psalterium/Psalm81.txt", section: "Psalmus81"}`), not text bodies. Resolution belongs to Phase 3.
- **Rendering.** No HTML, no Markdown, no parallel-column layout.
- **Musical notation selection.** GABC tone selection is driven by the rubrical output but lives in Phase 3.
- **Novus Ordo.** The Liturgia Horarum of Paul VI is served by other projects.
- **Netural calendar discovery.** We target the Roman Calendar as edited in *Divinum Officium*. Particular calendars (diocesan, religious-order extensions) are supported only via the existing `version` mechanism; no new calendars are introduced by this phase.
- **Martyrology.** The daily Martyrology entry is not part of the Office structure the engine emits; it ships as its own endpoint in Phase 4.

### 2.3 Explicit Non-Goals

- **Bug-for-bug compatibility with the Perl engine.** The Perl code has known divergences from the published *Ordo* in narrow cases. Where the two disagree, the published *Ordo* wins. Legacy-matching is a quality gate (§19), not an oath.
- **Perfect performance.** The engine runs at most once per `(date, version)` per API request and the result is cacheable forever (the calendar does not change retroactively). Clarity and testability beat microseconds.

---

## 3. Architectural Position

### 3.1 Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                        Phase 1 — Parser                       │
│                                                               │
│   Corpus Loader ──▶ Text Index (queryable, in-memory)        │
│   Calendar Parsers ──▶ Kalendaria, Transfers, Stransfers      │
│   Version Registry ──▶ data.txt derivation chain              │
└────────────────────────────┬─────────────────────────────────┘
                             │ reads
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 Phase 2 — Rubrical Engine                     │
│                                                               │
│   ┌───────────────────────────────────────────────────────┐   │
│   │ Version Resolver                                      │   │
│   │   data.txt → ResolvedVersion (kalendar/transfer/...)  │   │
│   │            → RubricalPolicy (derived mapping)         │   │
│   └───────────────────────┬───────────────────────────────┘   │
│                           ▼                                   │
│   ┌──────────────┐   ┌──────────────┐                        │
│   │  Temporal    │   │  Sanctoral   │                        │
│   │  Cycle       │   │  Lookup      │                        │
│   └──────┬───────┘   └──────┬───────┘                        │
│          └──────────┬───────┘                                 │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Directorium Overlay  │  ◀── Transfer + Stransfer   │
│          │ (§8)                 │     + dirge + hymn merge   │
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Candidate Assembly   │  merges temporal+sanctoral  │
│          │ (§9)                 │  with overlay substitution  │
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Occurrence Resolver  │  rank-based precedence;     │
│          │ (§10)                │  needs only `Festum Domini` │
│          │                      │  at this stage (rank-norm)  │
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Celebration Rule Eval│  produces CelebrationRuleSet│
│          │ (§12)                │  from winner + commemorated │
│          │                      │  feasts                     │
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Transfer Computation │  for losers the policy      │
│          │ (§14)                │  marks translatable         │
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Concurrence Resolver │  consults CelebrationRuleSet│
│          │ (§13)                │  .hasFirst/.hasSecondVespers│
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Commemoration        │  respects CelebrationRuleSet│
│          │ Assembly (§15)       │  .omitCommemoration         │
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│          ┌──────────────────────┐                            │
│          │ Hour Structurer      │  Ordinarium skeleton +      │
│          │ (§16)                │  CelebrationRuleSet; derive │
│          │                      │  HourRuleSet → HourStructure│
│          └──────────┬───────────┘                            │
│                     ▼                                         │
│              OrdoEntry (typed)                                │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
                    Phase 3 — Composition
```

The engine is a **pipeline of pure stages**. Each stage consumes an immutable input and produces an immutable output; no stage mutates shared state. This is deliberately different from the Perl code, which relies on ~40 `our` globals written by `occurrence`, `concurrence`, `precedence`, etc. Globals in that engine are *implicit contracts*; in Phase 2 they become **explicit types** that flow between stages.

Only the celebration-scope rule pass appears as a standalone pipeline box. Hour-local rule derivation happens inside Hour Structuring, once the specific Hour's Ordinarium skeleton is known.

Two of these stages are worth highlighting because they do not exist in the Perl code as first-class abstractions but were implicit there:

- **Directorium Overlay (§8)** pulls together everything that `Transfer/<year>.txt` and `Stransfer/<year>.txt` can do: feast moves, temporal reassignments (`Tempora/Nat2-0`), dirge scheduling (`dirge1`, `dirge2`, `dirge3`), and hymn merge/shift (`HyMM-DD=1|2`). It runs once per date and its output is consumed by several downstream stages rather than flowing linearly.
- **Rule Evaluation (§12)** turns the winning feast's `[Rule]` section into a typed `CelebrationRuleSet` before hour structuring. This promotes ~40 scattered directive interpretations (`9 lectiones`, `Omit Hymnus Preces Suffragium`, `no secunda vespera`, `Psalmi Dominica`, `scriptura1960`, …) into an explicit contract and removes rubrical logic from Phase 3's surface area.

### 3.2 Dependency Direction

- Phase 2 depends on Phase 1's types (`Feast`, `Rank`, `KalendariumEntry`, `TransferEntry`, `ScriptureTransferEntry`, `VersionDefinition`, `RuleDirective`, `Condition`, `ConditionalScope`) and its in-memory query surface (read-only).
- Phase 2 does **not** depend on Phase 1's filesystem layer. It receives a pre-built `CorpusIndex` and calendar-table data as constructor input.
- Phase 3 depends on Phase 2's `OrdoEntry`. Phase 2 knows nothing about Phase 3.

### 3.3 Package Layout

```
packages/
├── parser/                       # Phase 1 (complete)
└── rubrics/                      # Phase 2 — @officium-novum/rubrics
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── src/
    │   ├── index.ts              # public API surface
    │   ├── engine.ts             # top-level resolveOrdo(date, config)
    │   ├── types/
    │   │   ├── ordo.ts           # OrdoEntry, HourStructure, Commemoration
    │   │   ├── version.ts        # VersionHandle, ResolvedVersion
    │   │   ├── policy.ts         # RubricalPolicy interface
    │   │   ├── directorium.ts    # DirectoriumOverlay union
    │   │   ├── rule-set.ts       # CelebrationRuleSet + HourRuleSet
    │   │   ├── candidate.ts      # Candidate, CandidateSource
    │   │   └── index.ts
    │   ├── version/
    │   │   ├── resolver.ts       # data.txt → ResolvedVersion (walks base/tbase)
    │   │   ├── policy-map.ts     # ResolvedVersion → RubricalPolicy binding
    │   │   └── index.ts
    │   ├── temporal/
    │   │   ├── easter.ts         # Gregorian computus
    │   │   ├── day-name.ts       # (date) → "Pasc1-0" etc.
    │   │   ├── season.ts         # (date) → LiturgicalSeason
    │   │   └── ember-rogation.ts
    │   ├── sanctoral/
    │   │   ├── kalendarium-lookup.ts
    │   │   └── rank-normalizer.ts
    │   ├── directorium/          # §8 — overlay stage
    │   │   ├── overlay.ts        # buildOverlay(date, version, tables)
    │   │   ├── office-substitution.ts
    │   │   ├── dirge.ts          # dirge1/2/3 scheduling
    │   │   ├── hymn-override.ts  # HyMM-DD=1|2 merge/shift
    │   │   └── scripture-redirect.ts  # Stransfer → MatinsPlan hooks
    │   ├── candidates/
    │   │   └── assemble.ts       # merge temporal + sanctoral + overlay
    │   ├── rules/                # §12 — [Rule] evaluation
    │   │   ├── evaluate.ts       # RuleDirective[] → CelebrationRuleSet
    │   │   ├── resolve-vide-ex.ts # vide/ex directive chasing
    │   │   ├── apply-conditionals.ts # paragraph-scoped conditional eval
    │   │   └── merge.ts          # feast rules + hour-scoped ordinarium rules
    │   ├── occurrence/
    │   │   ├── precedence.ts     # rank comparison under a given system
    │   │   ├── resolver.ts       # pick winner, derive commemorations
    │   │   └── tables/
    │   │       ├── precedence-1911.ts
    │   │       ├── precedence-1955.ts
    │   │       └── precedence-1960.ts
    │   ├── concurrence/
    │   │   ├── vespers-class.ts
    │   │   └── resolver.ts
    │   ├── transfer/
    │   │   ├── compute.ts        # perpetual translation rules
    │   │   └── reconcile.ts      # cross-check against Transfer/<year>.txt
    │   ├── commemoration/
    │   │   ├── assemble.ts
    │   │   └── limits.ts         # climit1960, privileged-season reductions
    │   ├── hours/
    │   │   ├── skeleton.ts       # load + cache Ordinarium per Hour
    │   │   ├── apply-rule-set.ts # common skeleton × HourRuleSet transform
    │   │   ├── matins.ts         # MatinsPlan builder (§16.3)
    │   │   ├── lauds.ts
    │   │   ├── minor-hours.ts
    │   │   ├── vespers.ts
    │   │   └── compline.ts
    │   ├── policy/
    │   │   ├── divino-afflatu.ts # shared by the 1939/1954 DA versions
    │   │   ├── reduced-1955.ts
    │   │   ├── rubrics-1960.ts
    │   │   └── _shared/          # pure helpers used by multiple policies
    │   └── diagnostics/
    │       └── warnings.ts
    └── test/
        ├── unit/
        ├── snapshot/             # per-version snapshot matrices
        └── ordo/                 # ingested Ordo Recitandi ground truth
```

Three directories are worth noting as structural load-bearers:

- `version/` — canonicalises the `data.txt` mapping. Everywhere else in the engine, "what system are we running?" is answered by `ResolvedVersion`, not by a string like `'rubrics-1960'`. The policy binding is a data mapping in `policy-map.ts`, not a conditional branch in business logic.
- `directorium/` — §8's overlay. Each file handles one overlay concern (office substitution, dirge, hymn override, scripture redirect) producing typed outputs; the `overlay.ts` entry-point composes them.
- `rules/` — §12's evaluation layer. `CelebrationRuleSet` is the pre-hour contract between rubrical resolution and the hour structurer; `HourRuleSet` is derived per hour from it. No hour-building code consults raw `[Rule]` lines directly.

---

## 4. Data Model

### 4.1 Primary Output

```typescript
// types/ordo.ts
export interface OrdoEntry {
  /** ISO-8601 civil date (YYYY-MM-DD) */
  readonly date: string;

  /** Serialization-safe descriptor of the version under which this entry was
   *  computed. Public output carries data only; the live RubricalPolicy
   *  object remains internal to the engine. */
  readonly version: VersionDescriptor;

  /** The primary Office of the day */
  readonly celebration: Celebration;

  /** Ordered list of commemorations (highest dignity first) */
  readonly commemorations: readonly Commemoration[];

  /** Per-Hour structural references. Not every key is always present;
   *  e.g. on a day when Lauds is suppressed by a vigil-to-festum pattern,
   *  the record does not contain 'lauds'. */
  readonly hours: Readonly<Partial<Record<HourName, HourStructure>>>;

  /** The liturgical season, as of this date */
  readonly season: LiturgicalSeason;

  /** Liturgical color for the day. Commemorations may carry their own. */
  readonly color: LiturgicalColor;

  /** If translation moved this feast here, the original date */
  readonly transferredFrom?: string;

  /** Directorium overlay that applied to this date, if any. Empty overlay
   *  is represented as `undefined`, not an empty object. */
  readonly overlay?: DirectoriumOverlay;

  /** Diagnostics the engine wants to surface without failing. */
  readonly warnings: readonly RubricalWarning[];
}

export interface Celebration {
  /** Reference into the Text Index: the feast's root file */
  readonly feastRef: FeastReference;

  /** Resolved rank under the active rubrical system */
  readonly rank: ResolvedRank;

  /** Which cycle emitted this celebration */
  readonly source: 'temporal' | 'sanctoral' | 'votive';

  /** If a Vigil is being celebrated today, the Vigil's own reference */
  readonly vigil?: FeastReference;

  /** If within an Octave, the octave's root feast and day number (1–8) */
  readonly withinOctave?: { feastRef: FeastReference; day: number };
}

export interface Commemoration {
  readonly feastRef: FeastReference;
  readonly rank: ResolvedRank;
  readonly reason: CommemorationReason;
  readonly color?: LiturgicalColor;

  /** Which Hours this commemoration is made at. In 1960 many commemorations
   *  are made only at Lauds and Vespers of the winning feast. */
  readonly hours: readonly HourName[];
}

export type CommemorationReason =
  | 'occurrence-impeded'     // same-day feast lost to a higher rank
  | 'concurrence'            // first/second Vespers adjacency
  | 'octave-continuing'      // within a running octave
  | 'privileged-feria'       // Advent/Lent feria commemorated on feast
  | 'sunday'                 // Sunday commemorated on impeding feast
  | 'votive';

export interface ResolvedRank {
  /** Free-form name as seen in the corpus (e.g. "Duplex I. classis") */
  readonly name: string;

  /** Numeric weight used for precedence comparison. Derived per system. */
  readonly weight: number;

  /** The rubrical class symbol actually used by the active system
   *  ('I', 'II', 'III', 'IV' for 1960; 'dupl-i', 'dupl-ii', 'dupl',
   *  'semidupl', 'simplex' for 1911). */
  readonly classSymbol: string;
}

export interface FeastReference {
  /** Canonical path into the Text Index (language-agnostic) */
  readonly path: string;

  /** Stable feast identifier (e.g. 'Sancti/01-25') */
  readonly id: string;

  /** Title as found in the feast's definition, Latin */
  readonly title: string;
}

export type HourName =
  | 'matins' | 'lauds' | 'prime' | 'terce' | 'sext'
  | 'none' | 'vespers' | 'compline';

export type LiturgicalSeason =
  | 'advent' | 'christmastide' | 'epiphanytide'
  | 'septuagesima' | 'lent' | 'passiontide'
  | 'eastertide' | 'ascensiontide' | 'pentecost-octave'
  | 'time-after-pentecost' | 'time-after-epiphany';

export interface RubricalWarning {
  readonly code: string;                // stable, greppable identifier
  readonly message: string;
  readonly severity: 'info' | 'warn' | 'error';
  readonly context?: Record<string, string>;
}
```

### 4.2 Hour Structure

The Perl engine interleaves structural decisions with text assembly (`getpsalm`, `gethymn`, etc. both pick *and* fetch). Phase 2 separates the two. The output of the Hour Structurer is a **set of typed slot references** — not text.

```typescript
export interface HourStructure {
  readonly hour: HourName;
  readonly slots: Readonly<Partial<Record<SlotName, SlotContent>>>;

  /** Seasonal/rank-driven special directives this Hour must observe.
   *  E.g. ['omit-gloria-patri', 'add-alleluia', 'preces-feriales']. */
  readonly directives: readonly HourDirective[];
}

export type SlotName =
  | 'incipit'
  | 'invitatory' | 'hymn' | 'psalmody'
  | 'martyrology' | 'de-officio-capituli'
  | 'chapter' | 'responsory' | 'versicle'
  | 'antiphon-ad-benedictus' | 'canticle-ad-benedictus'
  | 'antiphon-ad-magnificat' | 'canticle-ad-magnificat'
  | 'antiphon-ad-nunc-dimittis' | 'canticle-ad-nunc-dimittis'
  | 'oration' | 'lectio-brevis' | 'benedictio'
  | 'commemoration-antiphons'
  | 'commemoration-versicles' | 'commemoration-orations'
  | 'suffragium' | 'preces' | 'final-antiphon-bvm'
  | 'doxology-variant' | 'te-deum' | 'conclusion';

export type SlotContent =
  | { kind: 'single-ref'; ref: TextReference; hymnOverride?: HymnOverrideMeta }
  | { kind: 'ordered-refs'; refs: readonly TextReference[] }
  | { kind: 'psalmody'; psalms: readonly PsalmAssignment[] }
  | { kind: 'prime-martyrology' }
  | { kind: 'empty' } // explicitly suppressed slot
  | { kind: 'matins-invitatorium'; source: InvitatoriumSource }
  | { kind: 'matins-nocturns'; nocturns: readonly NocturnPlan[] }
  | { kind: 'te-deum'; decision: 'say' | 'replace-with-responsory' | 'omit' };

export interface PsalmAssignment {
  readonly psalmRef: TextReference;     // resolves to the psalm text
  readonly antiphonRef?: TextReference; // antiphon before/after
}

export interface TextReference {
  /** Path into Phase 1's Text Index */
  readonly path: string;
  /** Section within that file */
  readonly section: string;
  /** Optional line selector — already resolved by Phase 1's reference
   *  resolver where possible, otherwise passed through verbatim. */
  readonly selector?: string;
  /** Optional owning office used for name substitution when inherited
   *  common text renders on behalf of a proper office. */
  readonly nameSourcePath?: string;
}

export interface HymnOverrideMeta {
  readonly mode: 'merge' | 'shift';
  readonly hymnKey: string;
  readonly source: 'overlay';
}

export type HourDirective =
  | 'omit-gloria-patri'              // e.g. Triduum
  | 'omit-alleluia'                  // Septuagesima onward
  | 'add-alleluia'                   // Paschal Time
  | 'add-versicle-alleluia'
  | 'preces-feriales'                // ferial preces at Lauds/Vespers
  | 'preces-dominicales'             // Sunday preces at Prime/Compline where the policy retains them
  | 'suffragium-of-the-saints'       // outside privileged seasons
  | 'omit-suffragium'                // within privileged seasons or on feasts
  | 'genuflection-at-oration'        // Ember Wednesdays etc.
  | 'short-chapter-only'             // e.g. during Triduum
  | 'dirge-vespers'
  | 'dirge-lauds';

export type ComplineSource =
  | { kind: 'vespers-winner'; celebration: Celebration }
  | { kind: 'ordinary' }
  | { kind: 'triduum-special'; dayName: string };

export interface HourStructure {
  readonly hour: HourName;
  readonly source?: ComplineSource; // Compline-only concurrence source
  readonly slots: Readonly<Partial<Record<SlotName, SlotContent>>>;
  readonly directives: readonly HourDirective[];
}
```

This slot map is the canonical Phase 2 contract and should track the exported
types in `packages/rubrical-engine/src/types/hour-structure.ts`, not an earlier
planning sketch. Phase 2 remains complete for the Roman scope as a decision
layer, but the Phase 3 burn-down showed that the schema was not frozen: bounded
structural additions still surfaced when the compositor reached real source
families that needed richer seams than the initial model exposed.

The Roman 3h work widened the schema in exactly that way without reopening the
Phase 2 occurrence/concurrence/transfer architecture. Recent additions included
`incipit`, `martyrology`, `de-officio-capituli`, `lectio-brevis`,
`benedictio`, Matins-specific rich slots (`matins-invitatorium`,
`matins-nocturns`, `te-deum`), and Lucan canticle slots for Lauds/Vespers/
Compline. See ADR-013 for the canticle-slot decision and the changelog entries
for the Prime Martyrology / `De Officio Capituli` / Matins-benediction
follow-up work.

### 4.3 Input Configuration — Version as Primary Identifier

The engine is configured with a `VersionHandle`, not a `RubricSystem`. This matches how the Perl code actually indexes into `Tabulae/data.txt` (see file-format spec §7.1): a DO version is a distinct identity with its own `kalendar`, `transfer`, `stransfer`, `base`, and `transferBase` fields. Two versions may share a rubrical policy yet disagree on their calendar (e.g., `"Rubrics 1960 - 1960"` and `"Rubrics 1960 - 2020 USA"` both run 1960 rubrics but against different sanctoral calendars). Conflating version and policy loses the inheritance chains that the calendar-side resolution needs.

```typescript
// types/version.ts

/** A version string as it appears in data.txt (the "version" column). */
export type VersionHandle = string & { readonly __brand: 'VersionHandle' };

/** Fully resolved version: identity + tables + policy binding. */
export interface ResolvedVersion {
  readonly handle: VersionHandle;              // "Rubrics 1960 - 1960"
  readonly kalendar: string;                   // "1960"
  readonly transfer: string;                   // "1960"
  readonly stransfer: string;                  // "1960"
  readonly base?: VersionHandle;               // inheritance for Kalendaria
  readonly transferBase?: VersionHandle;       // inheritance for Transfer
  readonly policy: RubricalPolicy;             // derived via policy-map
}

/** Public DTO form used in OrdoEntry and API responses. */
export interface VersionDescriptor {
  readonly handle: VersionHandle;
  readonly kalendar: string;
  readonly transfer: string;
  readonly stransfer: string;
  readonly base?: VersionHandle;
  readonly transferBase?: VersionHandle;
  readonly policyName: PolicyName;
}

// types/policy.ts — see §11 for the full shape
export interface RubricalPolicy {
  readonly name: string;                       // "divino-afflatu" | "reduced-1955" | ...
  // ... behavioral contract
}

// types/directorium.ts — see §8
export interface DirectoriumOverlay {
  readonly officeSubstitution?: FeastReference;
  readonly dirgeDirective?: DirgeDirective;
  readonly hymnOverride?: HymnOverride;
  readonly scriptureTransfer?: ScriptureTransferEntry;
}
```

```typescript
// Engine configuration
export interface RubricalEngineConfig {
  readonly corpus: CorpusIndex;                  // from Phase 1
  readonly kalendarium: KalendariumTable;        // from Phase 1
  readonly yearTransfers: YearTransferTable;     // from Phase 1
  readonly scriptureTransfers: ScriptureTransferTable; // from Phase 1
  readonly versionRegistry: VersionRegistry;     // parsed data.txt
  readonly version: VersionHandle;               // the active DO version
  readonly policyOverride?: RubricalPolicy;      // test-only; normally derived
  readonly startYear: number;
  readonly endYear: number;
}
```

**Version → Policy binding.** A small table in `version/policy-map.ts` binds each known `VersionHandle` to its `RubricalPolicy`:

```typescript
// version/policy-map.ts (excerpt)
export const VERSION_POLICY: ReadonlyMap<VersionHandle, RubricalPolicy> = new Map([
  ['Tridentine - 1570',              tridentine1570Policy],
  ['Tridentine - 1888',              tridentine1570Policy],   // same policy
  ['Tridentine - 1906',              tridentine1570Policy],
  ['Divino Afflatu - 1939',          divinoAfflatuPolicy],
  ['Divino Afflatu - 1954',          divinoAfflatuPolicy],    // same policy
  ['Reduced - 1955',                 reduced1955Policy],
  ['Rubrics 1960 - 1960',            rubrics1960Policy],
  ['Rubrics 1960 - 2020 USA',        rubrics1960Policy],      // different calendar
  ['Monastic - 1963',                monastic1963Policy],
  // ...
]);
```

This mapping is data, not a switch statement. Adding a new localised 1960 calendar requires adding one row, not editing the resolver.

**Why a handle rather than a branded enum.** The registry is populated from `data.txt`, which upstream may extend. A closed enum would require an engine release every time upstream adds a calendar (e.g., diocesan particular calendars). The handle is validated on engine construction: unknown handles produce a fatal error there, not at runtime during resolution.

**Policy override.** `policyOverride` is for tests (run the 1960 calendar against the 1911 policy to verify policy isolation). Production callers never set it.

### 4.4 Type Philosophy

- **Discriminated unions everywhere.** `SlotContent`, `Commemoration.reason`, `Candidate.source` all use `kind`/`source` tags rather than optional fields. This prevents "you forgot to set the antiphon" bugs and mirrors the Parser's approach to `TextContent`.
- **`readonly` on every field.** An `OrdoEntry` is immutable once produced. Stage-to-stage handoff is handled by constructing new objects, not mutating existing ones.
- **No `any`, no `unknown` leaks.** The engine's public API uses only fully-typed structures. Internal intermediate types are equally typed; diagnostic payloads use `Record<string, string>` only.
- **Warnings as data.** Every non-fatal oddity (missing Commune, unresolvable transfer, unexpected rank string) becomes a `RubricalWarning` pushed to the output. No throws outside programmer-error paths.

---

## 5. Version Resolution

Before any temporal or sanctoral work begins, the engine materialises a `ResolvedVersion` from the configured `VersionHandle`. This is a one-time operation at engine construction; the result is held read-only on the engine instance.

```typescript
// version/resolver.ts
export function resolveVersion(
  handle: VersionHandle,
  registry: VersionRegistry,
  policyMap: ReadonlyMap<VersionHandle, RubricalPolicy>,
): ResolvedVersion {
  const row = registry.get(handle);
  if (!row) throw new Error(`Unknown version: ${handle}`);
  const policy = policyMap.get(handle);
  if (!policy) throw new Error(`No policy binding for version: ${handle}`);
  return {
    handle,
    kalendar: row.kalendar,
    transfer: row.transfer,
    stransfer: row.stransfer,
    base: row.base,
    transferBase: row.transferBase,
    policy,
  };
}
```

For `OrdoEntry`, the engine projects `ResolvedVersion` to a plain `VersionDescriptor`:

```typescript
export function describeVersion(version: ResolvedVersion): VersionDescriptor {
  return {
    handle: version.handle,
    kalendar: version.kalendar,
    transfer: version.transfer,
    stransfer: version.stransfer,
    base: version.base,
    transferBase: version.transferBase,
    policyName: version.policy.name,
  };
}
```

The effective **kalendar** for the version is the merge of the version's own `Kalendaria/<kalendar>.txt` with every ancestor's kalendar via the `base` chain. The Parser already provides `KalendariumTable.resolveEffective(handle)` for this; the rubrical engine just asks for it once. Likewise, year-specific `Transfer` and `Stransfer` lookups follow the `transferBase` chain.

**Policy is a function of the version, not of the date.** A single engine instance resolves exactly one `(version, policy)` pair. A web server supporting multiple rubrical systems instantiates one engine per version and routes requests to the correct one, or (if churn is acceptable) instantiates per request. The engine itself is stateless enough that either strategy is fine; see §21 question 2.

**Fallback behaviour.** If a lookup (kalendarium entry, transfer rule, scripture transfer) fails in the active version, the engine walks the appropriate inheritance chain before giving up. The chain is data-driven (from `data.txt`); no code changes when new versions are introduced.

---

## 6. Temporal Cycle

### 6.1 Gregorian Computus

Easter Sunday is computed with the Anonymous Gregorian algorithm (Meeus/Jones/Butcher). The Perl code's `geteaster` in `Date.pm:92` is a literal transliteration of this; we implement it fresh in TypeScript with a citation in comments.

```typescript
// temporal/easter.ts
export function gregorianEaster(year: number): { month: number; day: number } {
  // Meeus/Jones/Butcher Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  // ... (deterministic integer arithmetic only)
}
```

All derived moveables are offsets from Easter:

| Observance              | Offset from Easter |
|-------------------------|--------------------|
| Septuagesima Sunday     | −63 days           |
| Sexagesima Sunday       | −56                |
| Quinquagesima Sunday    | −49                |
| Ash Wednesday           | −46                |
| Palm Sunday             | −7                 |
| Maundy Thursday         | −3                 |
| Good Friday             | −2                 |
| Holy Saturday           | −1                 |
| Easter Sunday           | 0                  |
| Ascension Thursday      | +39                |
| Pentecost Sunday        | +49                |
| Trinity Sunday          | +56                |
| Corpus Christi          | +60                |
| Sacred Heart (Friday)   | +68                |

Advent I is the Sunday closest to St. Andrew (Nov 30); the Perl `getadvent` chooses "the Sunday on or after Nov 27, or Nov 27 itself if Sunday," giving a date range of Nov 27 – Dec 3.

### 6.2 Day-Name Derivation

Every corpus file keyed by temporal position uses a day-name like `Pasc2-0` (Second Sunday after Easter, Sunday = 0) or `Pent21-3` (21st week after Pentecost, Wednesday). The function `dayNameFor(date)` must replicate the Perl `getweek` behaviour exactly, because these strings index into the Tempora directory.

The algorithm, in outline:

1. Compute Easter for `year` and for `year − 1` if the date is before that year's Advent I.
2. Determine which "anchor" applies: Advent, Christmastide (`Nat*`), Epiphany (`Epi*`), Septuagesima (`Quadp*`), Lent (`Quad*`), Passiontide (`Quad5/6`), Easter (`Pasc0–6`), Pentecost / Time after Pentecost (`Pent*`), or post-Epiphany time (`Epi1…6` renumbered as `Pent*` in some years).
3. From the anchor, compute the week offset.
4. Append `-<dayofweek>` where `0 = Sunday … 6 = Saturday`, **except** for Christmas Day and a handful of other fixed temporal entries whose file is `Nat1.txt`, not `Nat1-5.txt`.

This is exhaustively covered by `temporal/day-name.test.ts` with ≥200 dates across multiple years, mirroring the Perl outputs.

### 6.3 Season Classification

`season.ts` returns a `LiturgicalSeason` given a date. It is a coarser view than the day-name and is used only for seasonal directives (Alleluia, Suffragium, colour, Preces class).

### 6.4 Ember and Rogation Days

Implemented in `ember-rogation.ts`:

- **Ember days** — Wednesday, Friday, Saturday of the weeks following (a) the First Sunday of Lent, (b) Pentecost, (c) Holy Cross (Sep 14), (d) Saint Lucy (Dec 13). Each set has its own proper texts.
- **Rogation days** — Monday, Tuesday, Wednesday before Ascension.

These are produced as flags on the day's temporal candidate, not as separate feasts: they modify the existing ferial Office rather than replacing it.

### 6.5 Octaves (pre-1955)

Octaves are modelled as an attribute of the primary celebration plus a ferial day name. For each Octave-bearing feast (Christmas, Epiphany, Easter, Pentecost, Ascension, Corpus Christi, Sacred Heart, Sts. Peter & Paul, Assumption, Nativity of the BVM, All Saints, Immaculate Conception, plus any local ones), the engine knows:

- The octave day (+8) with its own rank (*octava*).
- The intervening days (+1..+7), each with its own ferial-within-octave rank.
- Whether the octave is privileged (*privilegiata*) and at what level: this affects what impedes it.

In 1955, most octaves are suppressed; only Christmas, Easter, and Pentecost survive. In 1960, only Christmas, Easter, and Pentecost, with further reductions. The system-specific policy object (§11) owns this list; the temporal module exposes it only as an annotation on candidates.

---

## 7. Sanctoral Cycle

### 7.1 Kalendarium Lookup

The Parser already produces `KalendariumTable` — a `Map<string, KalendariumEntry[]>` keyed by `MM-DD`. Lookup consults the resolved version, which carries the full inheritance chain:

```typescript
// sanctoral/kalendarium-lookup.ts
export function sanctoralCandidates(
  date: Date,
  version: ResolvedVersion,
  kalendarium: KalendariumTable,
): readonly SanctoralCandidate[] {
  const key = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const entries = kalendarium.resolveEffective(version.handle).get(key) ?? [];
  return entries
    .filter(entry => !entry.suppressed)
    .flatMap(entry => resolveAlternates(entry, version));
}
```

`resolveAlternates` handles the `=...=...=` alternate syntax: a primary entry with zero or more alternate entries distinguished by rank or (rarely) by condition. Each becomes its own `SanctoralCandidate`.

### 7.2 Kalendarium Inheritance Chain

The `VersionRegistry` (from `data.txt`) gives each version a parent via `base`. Sanctoral lookup walks the chain using `ResolvedVersion.base`:

```
version = "Rubrics 1960 - 1960"
  → kalendar = "1960"      (primary table; file lists only differences)
  → base    = "Reduced - 1955"
       → kalendar = "1955"
       → base    = "Divino Afflatu - 1954"
            → kalendar = "1954"
            ...
```

The `Kalendaria/1960.txt` file contains only *differences* from `1955`. The effective kalendar is the merge of all ancestors, with descendants winning on conflict. `KalendariumTable.resolveEffective(handle)` computes this once and caches per handle.

### 7.3 Rank Normalization

Ranks in the corpus files use many forms (`Duplex`, `Duplex I. classis`, `Semiduplex`, `Simplex`, `Festum`, `Commemoratio`, `0`, `3`, `Octava privilegiata II. ordinis`, ...). The Parser has already parsed these into `Rank` values. Phase 2 normalises further: each `Rank` is mapped to a `ResolvedRank` under the active policy. The mapping tables live in `policy/<policy-name>.ts` and are the primary authority for "what is a duplex under *Divino Afflatu*?" vs. "what is a I class feast under *Rubrics 1960*?".

---

## 8. Directorium Overlay

`Tabulae/Transfer/<year-key>.txt` and `Tabulae/Stransfer/<year-key>.txt` do more than move feasts between dates. File-format spec §7.3 catalogues the full range: the same files can reassign the day's office to a temporal file (`01-02=Tempora/Nat2-0`), schedule the Office of the Dead (`dirge1=01-23 02-03 02-20`), override major hymns (`Hy05-18=1`, `Hy04-13=2`), and redirect Matins scripture lessons (`~R` / `~B` / `~A` operation codes). The Parser already distinguishes these as a discriminated `TransferEntry` union.

The engine consumes them as a single **overlay**, produced once per date:

```typescript
// types/directorium.ts
export interface DirectoriumOverlay {
  /** If the overlay substitutes the day's office outright, this points to
   *  the replacement — which may live under Sancti/ OR Tempora/. */
  readonly officeSubstitution?: FeastReference;

  /** If the overlay schedules the Office of the Dead appended to Vespers
   *  (dirge1) or Lauds (dirge2/dirge3) on this date, the directive. */
  readonly dirgeDirective?: DirgeDirective;

  /** Hymn merge (type 1) or shift (type 2) per rule XX.3. */
  readonly hymnOverride?: HymnOverride;

  /** Scripture-transfer entry redirecting a Matins lesson source. */
  readonly scriptureTransfer?: ScriptureTransferEntry;
}

export interface DirgeDirective {
  readonly which: 1 | 2 | 3;
  readonly attachedTo: 'vespers' | 'lauds';  // 1 → vespers; 2,3 → lauds
}

export interface HymnOverride {
  readonly hymnKey: string;     // "Hy05-18"
  readonly mode: 'merge' | 'shift';
}
```

### 8.1 Construction

```typescript
// directorium/overlay.ts
export function buildOverlay(
  date: Date,
  version: ResolvedVersion,
  year: number,
  yearTransfers: YearTransferTable,
  scriptureTransfers: ScriptureTransferTable,
): DirectoriumOverlay {
  const yearKey = Tabulae.yearKeyForEaster(year);     // per Phase 1 convention
  const sday = `${pad(date.getMonth()+1)}-${pad(date.getDate())}`;

  const rawTransfers = yearTransfers.lookup(version.transfer, yearKey, sday,
                                             { chain: version.transferBase });
  const rawStransfer = scriptureTransfers.lookup(version.stransfer, yearKey, sday,
                                                  { chain: version.transferBase });

  return {
    officeSubstitution: extractOfficeSubstitution(rawTransfers),
    dirgeDirective:     extractDirge(rawTransfers, sday),
    hymnOverride:       extractHymnOverride(rawTransfers, sday),
    scriptureTransfer:  rawStransfer ?? undefined,
  };
}
```

The four sub-extractors each consume the same `rawTransfers` array and each filters for their own `TransferEntry.kind` (`transfer` | `dirge` | `hymn`). If none of the four fires, the overlay is the empty object (the type allows all four fields to be absent); downstream stages treat an absent field as "no directive."

### 8.2 Fan-out

Unlike most stages, the overlay's output is consumed by three different downstream stages, not passed linearly:

| Overlay field          | Consumer                                    |
|------------------------|---------------------------------------------|
| `officeSubstitution`   | §9 Candidate Assembly (may replace today's temporal or sanctoral candidate) |
| `dirgeDirective`       | §16 Hour Structurer (Vespers / Lauds)       |
| `hymnOverride`         | §16 Hour Structurer (Matins / Lauds / Vespers hymn slot) |
| `scriptureTransfer`    | §16.3 Matins plan (lesson source for first nocturn) |

The `OrdoEntry.overlay` field preserves the overlay on the final output for downstream inspection and for test snapshots. Two runs on dates that produced non-empty overlays should produce identical overlays.

### 8.3 Semantics of `officeSubstitution`

The most subtle case is when the overlay says `01-02=Tempora/Nat2-0`: on this specific date in this specific year, the office of the day *is* the Second Sunday after the Nativity, regardless of what the calendar would otherwise indicate. The engine handles this by **replacing** the temporal candidate during candidate assembly rather than by adding a new candidate. The replacement is sourced from the Tempora directory (not Sancti), which the pathname carries explicitly.

When `officeSubstitution` points to a Sancti reference (`01-08` reassigning to the feast originally at `01-09`), the treatment is the same but the source directory differs. The overlay does not distinguish; candidate assembly does.

### 8.4 Dirge Scheduling

`dirge1=...` lists dates on which the Office of the Dead is appended to Vespers; `dirge2=...` and `dirge3=...` list dates for the first and second post-Lauds slots respectively (the numbering convention is from *Rubricae 1570*). The Hour structurer consumes `DirgeDirective` as a flag on the Hour's directive set; it does not inflate it to a separate Hour.

### 8.5 Hymn Overrides

`Hy05-18=1;;DA` means: on May 18, under versions whose filter matches `DA`, merge the major hymns according to rule XX.3. `=2` means shift instead. These are Hour-slot directives; the Hour structurer's hymn-selection logic consults them before falling back to proper / commune / Ordinarium.

### 8.6 Scripture Transfer

Consumed exclusively by the Matins plan (§16.3). The `~R` / `~B` / `~A` operation codes are passed through to Matins and interpreted there; the overlay layer does not evaluate them itself.

---

## 9. Candidate Assembly

Before resolution, the engine builds a flat, typed list of everything in play for the day:

```typescript
export interface Candidate {
  readonly feastRef: FeastReference;
  readonly rank: ResolvedRank;
  readonly source: 'temporal' | 'sanctoral' | 'vigil' | 'octave'
                 | 'transferred-in' | 'overlay-substitution';

  /** Present only if source === 'transferred-in' (a feast that was moved
   *  to this date from an earlier impeded date). */
  readonly transferredFrom?: string;

  /** For octaves: the octave day number (1 = infra octavam day 1, 8 = octave day) */
  readonly octaveDay?: number;

  /** If this candidate is a vigil of another feast, that feast */
  readonly vigilOf?: FeastReference;

  /** Flags collected from the source (privileged, perpetuum, etc.) */
  readonly flags: ReadonlySet<CandidateFlag>;
}

export interface CandidateAssemblyResult {
  readonly candidates: readonly Candidate[];
  readonly impeded: readonly Candidate[];
}
```

### 9.1 Inputs

1. The temporal candidate for the day (always exactly one: a Sunday, a ferial weekday, a Triduum day, …).
2. Zero or more sanctoral candidates from the kalendarium (§7).
3. The `DirectoriumOverlay.officeSubstitution` (§8.3), if present.
4. Zero or more feasts that were transferred *into* today from an earlier impeded date (computed in §14 for prior dates; the engine maintains a per-year translation map).
5. If today is within an octave of a previously-celebrated feast, the "within-octave" ferial candidate.
6. Any vigil day corresponding to a feast with today as its vigil date.

### 9.2 Overlay Substitution Semantics

If the overlay carries an `officeSubstitution`, it **replaces** the corresponding base candidate rather than adding to the list:

- Substitution targeting `Tempora/...` replaces the natural temporal candidate.
- Substitution targeting `Sancti/...` replaces the natural sanctoral candidate of the same `MM-DD` (if any) or is treated as an additional sanctoral candidate (if the kalendarium had none for today).

The replaced base candidate is recorded on a `warnings` entry for traceability (`code: 'overlay-replaced-base-candidate'`).

### 9.3 Commutativity

Assembly is order-independent: the output is a `CandidateAssemblyResult` whose `candidates` list has no semantic ordering and whose `impeded` list is a transfer-work queue for §14. All rank-based decisions happen in §10 (Occurrence). The assembly stage is intentionally dumb — it just enumerates.

---

## 10. Occurrence Resolution

### 10.1 The Precedence Problem

Given a list of candidates, the engine must decide:

- Which single candidate is the **winner** — the Office of the day.
- Which candidates become **commemorations** (and at which Hours).
- Which candidates are **omitted** entirely.
- Which candidates are **transferred** to a later date.

The decision depends on (a) ranks under the active system, (b) seasonal rules (Advent/Lent/Passiontide/Triduum behave specially), (c) per-rubrical-system precedence tables, and (d) certain feast-specific overrides (e.g., Annunciation in Holy Week).

### 10.2 Precedence Tables

Each rubrical system ships a **precedence table** — an ordered list of classes, with each entry specifying:

- Its weight (higher beats lower).
- Whether it can *impede* a given other class.
- Whether, when impeded, it is *omitted*, *commemorated*, or *transferred* (and under what conditions).
- Whether it is a *privileged feria* (some classes never lose to any feast).

```typescript
// occurrence/tables/precedence-1960.ts
export const PRECEDENCE_1960: readonly PrecedenceRow[] = [
  { class: 'I-privilegiata', weight: 100, onImpededBy: 'never' },
  { class: 'I',              weight: 90,  onImpededBy: 'transfer-if-beaten' },
  { class: 'II',             weight: 80,  onImpededBy: 'commemorate' },
  // ...
];
```

The data in these tables is derived from the governing documents:

- **1911** — *Rubricae Generales Breviarii* §§ I–VI on occurrence.
- **1955** — *Cum Nostra* §§ II–IV and the revised *Tabella Praecedentiae*.
- **1960** — *Rubricarum Instructum* §§ 91–99 and the four-class *Tabella Dierum Liturgicorum*.

Each row carries a citation comment pointing at the originating paragraph in the rubrical source. This matters because *why* a rule exists is how you resolve edge cases later.

### 10.3 Resolution Algorithm

```typescript
// occurrence/resolver.ts
export function resolveOccurrence(
  candidates: readonly Candidate[],
  temporal: TemporalContext,
  policy: RubricalPolicy,
): OccurrenceResult {
  // 1. Apply per-season preemptions: in the Triduum, everything yields.
  //    In Lent, sanctoral yields to the feria unless the feast is I class
  //    (1960) / double of the first class (pre-1960) / sufficiently ranked.
  const seasonFiltered = policy.applySeasonPreemption(candidates, temporal);

  // 2. Sort by weight descending, tie-break by canonical ordering
  //    (temporal > sanctoral on equal rank, except where the feast is
  //    a double of greater dignity than the Sunday — season-specific).
  const ordered = [...seasonFiltered].sort(policy.compareCandidates);

  // 3. Walk the ordered list, applying the precedence table:
  const [winner, ...rest] = ordered;
  const result: CandidateDecision[] = [{ cand: winner, fate: 'winner' }];

  for (const cand of rest) {
    const row = policy.precedenceRow(cand.rank.classSymbol);
    const fate = row.decide(cand, winner, temporal, ordered);
    // fate ∈ {'commemorate', 'omit', 'transfer'}
    result.push({ cand, fate });
  }

  return toOccurrenceResult(result);
}
```

The critical property: `policy.compareCandidates` and `row.decide` together encode *all* the system-specific nuance. No branching on `policy.name === 'rubrics-1960'` appears outside the `policy/` directory. Adding a new rubrical policy means writing a new policy file, not editing the resolver.

### 10.4 Edge Cases the Algorithm Must Handle

These are the cases that break naïve implementations. Each has a dedicated snapshot test.

1. **Annunciation (Mar 25) in Holy Week.** Under 1911, transferred to Monday after Low Sunday. Under 1960, transferred to the Monday after Low Sunday as well, but the commemoration rules differ.
2. **St. Joseph (Mar 19) on Palm Sunday.** Transferred. The target date itself depends on the system.
3. **St. Matthias (Feb 24) in leap years.** Moves to Feb 25. The bisextile handling is a persistent source of bugs in calendar code.
4. **Double feasts in the Christmas octave.** Pre-1955: each day of the octave is a double itself; in 1955+ the octave is simplified.
5. **Immaculate Conception (Dec 8) on the Second Sunday of Advent.** In 1911, Dec 8 takes precedence; in 1955+, still takes precedence but the commemoration of the Sunday is made.
6. **Good Shepherd Sunday vs. impeding feasts.** Resolution differs across editions.
7. **Vigil of Epiphany conflicting with Sunday.** Vigils of I class feasts have special rank 5 "vigil" that behaves differently from other vigils.
8. **Ember Saturday in Advent with a III class sanctoral feast.** The feast yields; Ember Saturday retains its proper Office.
9. **Two sanctoral feasts on the same day.** (Rare but occurs: e.g., Aug 9 under some calendars.) Higher rank wins, lower becomes commemoration *if its rank permits*.

### 10.5 Privileged Feriae

Certain weekdays are **privileged** and cannot be impeded by any feast short of the highest class:

- Ash Wednesday
- Monday, Tuesday, Wednesday of Holy Week
- Maundy Thursday, Good Friday, Holy Saturday (yield to nothing)
- Vigil of Christmas (Dec 24)
- Rogation Monday

The policy object exposes `isPrivilegedFeria(temporalCandidate)` and `feriaPrivilegeLevel(...)` so the resolver can short-circuit: when a privileged feria meets a lower-ranked sanctoral, the feast is not just commemorated — in some cases it is transferred; in others, simply omitted for the year.

---

## 11. Rubrical Policy Interface

The extensibility point of the engine is the `RubricalPolicy`:

```typescript
// types/policy.ts
export interface RubricalPolicy {
  /** Stable identifier used in diagnostics and test snapshots. */
  readonly name: PolicyName;   // 'divino-afflatu' | 'reduced-1955' | 'rubrics-1960' | ...

  /** Map the raw Parser Rank → a ResolvedRank under this policy. */
  resolveRank(raw: Rank, context: RankContext): ResolvedRank;

  /** Row lookup for precedence table. */
  precedenceRow(classSymbol: string): PrecedenceRow;

  /** Seasonal rules — may suppress or downgrade candidates. */
  applySeasonPreemption(
    candidates: readonly Candidate[],
    temporal: TemporalContext,
  ): readonly Candidate[];

  /** Total order over candidates. Strict weak ordering. */
  compareCandidates(a: Candidate, b: Candidate): number;

  /** Concurrence decision — see §13. */
  resolveConcurrence(today: OccurrenceResult, tomorrow: OccurrenceResult,
                     temporal: TemporalContext): ConcurrenceResult;

  /** Commemoration limits — climit1960 et al. */
  limitCommemorations(commems: readonly Commemoration[],
                      context: HourContext): readonly Commemoration[];

  /** Consume a feast's raw RuleDirective[] and produce a typed
   *  CelebrationRuleSet. Most of the evaluation is policy-agnostic mechanics
   *  in rules/evaluate.ts, but this hook lets a policy override defaults
   *  (e.g., what "9 lectiones" means when the rubric is silent). See §12. */
  buildCelebrationRuleSet(feast: Feast, context: RuleEvalContext): CelebrationRuleSet;

  /** Hour-structure directives keyed off season/rank and the merged rules. */
  hourDirectives(hour: HourName, celebration: Celebration,
                 celebrationRules: CelebrationRuleSet,
                 hourRules: HourRuleSet,
                 temporal: TemporalContext): ReadonlySet<HourDirective>;

  /** Octave behaviour — which survive, at what level. */
  octavesEnabled(feastRef: FeastReference): OctaveLevel | null;

  /** Transfer targeting rule. Given an impeded feast, where does it go? */
  transferTarget(cand: Candidate, fromDate: Date, until: Date,
                 dayContext: (d: Date) => TemporalContext): Date | null;
}

export type PolicyName =
  | 'tridentine-1570'
  | 'divino-afflatu'
  | 'reduced-1955'
  | 'rubrics-1960'
  | 'monastic-tridentine'
  | 'monastic-divino'
  | 'monastic-1963'
  | 'cistercian-1951'
  | 'cistercian-altovadense'
  | 'dominican-1962';
```

The 10-member list covers every Breviary row in `Tabulae/data.txt`. Phase 2a expanded the illustrative 7-member draft to bind all 15 handles rather than refusing three pre-1955 monastic and one Cistercian variant at resolution time (see ADR-001). Distinct historical rubrical traditions get their own `PolicyName` even when their `data.txt` columns partially overlap; if Phase 2c research shows two are rubrically identical, collapsing them is a one-row edit in `version/policy-map.ts` plus removing a member from this union.

Each file under `policy/` exports one instance. The engine receives a pre-selected policy via the `version` → policy-map binding (§4.3); `RubricalEngineConfig.policyOverride` is a test-only escape hatch.

### 11.1 Why Distinct Policies, Not One Parameterised Policy

An early temptation is "one policy object with a `name` field branching everywhere." This leads to the same sprawling conditional mess the Perl code has. Separate policy files — one per policy name, reused across multiple versions that share that policy — cost duplication but buy **isolation**: a fix to 1960 cannot silently break 1911. Shared helpers live in `policy/_shared/`; system-specific rules live in exactly one place. Multiple versions (`"Rubrics 1960 - 1960"`, `"Rubrics 1960 - 2020 USA"`) point to the same `rubrics-1960` policy via the policy map.

---

## 12. Rule Evaluation

The winning feast's `[Rule]` section is a compact, highly-expressive DSL for structural decisions: how many Matins lessons, which psalm scheme, which slots to suppress, whether the feast has first and second Vespers, where lessons come from, how doxologies are specialised, papal-name binding, hymn doxology variants, and so on. File-format spec §6 (lines 613–654) catalogues the vocabulary.

Under the Perl implementation, each directive is consulted ad hoc by whichever routine happens to need it during HTML generation. This scatters rubrical logic throughout rendering code. In Phase 2, **`[Rule]` evaluation is a dedicated stage** that first produces one typed `CelebrationRuleSet` per celebration, then lets each hour derive a local `HourRuleSet` from that plus its Ordinarium skeleton. Downstream stages consume those typed results; none of them parses rule lines.

### 12.1 Where It Sits

In the pipeline (§3.1), celebration-rule evaluation runs **after** occurrence (once the winner is known) but **before** concurrence. This ordering is not arbitrary:

- Concurrence decisions depend on the feast's `no secunda vespera` / `no prima vespera` directives, which live in the rules.
- Commemoration assembly depends on whether the winner omits commemorations.
- Hour structuring depends on everything else, plus hour-scoped Ordinarium rules merged later.

A small set of occurrence-relevant flags (notably `Festum Domini`) is resolved during rank normalisation instead — those flags modify the candidate's rank weight, which occurrence already consumes.

### 12.2 `CelebrationRuleSet` and `HourRuleSet`

```typescript
// types/rule-set.ts
export interface CelebrationRuleSet {
  /** Matins shape — nocturns and lessons per nocturn. Defaults per policy. */
  readonly matins: MatinsRuleSpec;

  /** Vespers existence. Defaults true for feasts with a Vespers
   *  section; overridden by `no prima vespera` / `no secunda vespera`. */
  readonly hasFirstVespers: boolean;
  readonly hasSecondVespers: boolean;

  /** Lesson-source directives (`Lectio1 tempora`, `Lectio1 OctNat`, `scriptura1960`). */
  readonly lessonSources: readonly LessonSourceOverride[];

  /** `in 3 Nocturno Lectiones ex Commune in 3 loco` — lesson-set index selection. */
  readonly lessonSetAlternates: readonly LessonSetAlternate[];

  /** `Feria Te Deum` — say Te Deum despite ferial day. */
  readonly teDeumOverride?: 'forced' | 'suppressed';

  /** `Festum Domini` — occurrence-level flag (see §12.1). */
  readonly festumDomini: boolean;

  /** `OPapaM=...`, `CPapaC=...` — papal-name injections for office / commemoration. */
  readonly papalNames?: PapalNameBindings;

  /** `Sub unica concl` — multiple orations joined under one conclusion. */
  readonly conclusionMode: 'separate' | 'sub-unica';

  /** `Antiphonas horas` — use proper antiphons at the minor Hours when available. */
  readonly antiphonScheme: AntiphonScheme;

  /** `Doxology=Nat` and similar — celebration-wide hymn / Prime-responsory doxology selector. */
  readonly doxologyVariant?: string;

  /** `Omit Commemoratio` — applied before §15 commemoration assembly. */
  readonly omitCommemoration: boolean;

  /** Raw passthrough for policy-specific directives not yet modelled here.
   *  The existence of this bucket is itself a diagnostic: emit a warning
   *  for each directive that lands in it. */
  readonly unmapped: readonly RuleDirective[];
}

export interface HourRuleSet {
  readonly hour: HourName;

  /** Set of slot names to explicitly suppress for this Hour. */
  readonly omit: readonly OmittableSlot[];

  /** Psalter selection (ferial / dominica / festal / proper). */
  readonly psalterScheme: PsalterScheme;

  /** Per-slot psalm overrides, e.g. `Psalm5Vespera=116`. */
  readonly psalmOverrides: readonly PsalmOverride[];

  /** `Minores sine Antiphona` — minor Hours without antiphons. */
  readonly minorHoursSineAntiphona: boolean;

  /** `Psalmi minores ex Psalterio` — minor Hours use ferial psalms from Psalterium. */
  readonly minorHoursFerialPsalter: boolean;

  /** `Capitulum Versum 2` + hour-scoped variants. */
  readonly capitulumVariant?: CapitulumVariant;
}

export interface MatinsRuleSpec {
  readonly lessonCount: 3 | 9 | 12;
  readonly nocturns: 1 | 3;
  readonly rubricGate?: 'always' | PolicyName;  // e.g. "9 lectiones 1960"
}

export interface LessonSourceOverride {
  readonly lesson: LessonIndex;
  readonly source: LessonSource;
}

export interface LessonSetAlternate {
  readonly lesson: LessonIndex;
  readonly alternate: AlternateLocation;
}

export interface PsalmOverride {
  readonly slot: PsalmSlotKey;
  readonly psalm: PsalmReference;
}

export type OmittableSlot =
  | 'hymnus' | 'preces' | 'suffragium'
  | 'invitatorium' | 'tedeum' | 'gloria-patri';

export type AntiphonScheme =
  | 'default'
  | 'proper-minor-hours';

export type PsalterScheme =
  | 'ferial' | 'dominica' | 'festal' | 'proper';
```

`CelebrationRuleSet` is intentionally **hour-agnostic**. It contains the parts of the feast's `[Rule]` section that later non-hour stages need, plus Matins-wide structure, plus celebration-wide selectors later consumed by particular Hours (`Doxology=Nat`, `Antiphonas horas`). Anything whose meaning is truly hour-scoped (`Psalmi Dominica`, `Psalm5Vespera=116`, `Capitulum Versum 2 ad Laudes`, `Minores sine Antiphona`) is deferred to `HourRuleSet`, which is derived inside Hour Structuring from the `CelebrationRuleSet`, the active Hour, and the Hour's Ordinarium skeleton.

### 12.3 Evaluation Order

```
policyDefault(context)
  → mergeFeastRules(winner.feast.rules, context)
    → mergeCommemoratedLessonRules(commemorations, context)
      → CelebrationRuleSet

for each hour H:
  policyHourDefault(H, context)
    → mergeHourScopedOrdinariumRules(H, ordinarium[H], context)
      → mergeHourScopedFeastRules(H, winner.feast.rules, context)
        → HourRuleSet
```

Each merge is a pure function. `CelebrationRuleSet` exists before concurrence and commemoration; `HourRuleSet` exists only once a specific Hour is being built. Conflicts resolve toward the later contributor, with diagnostics emitted when the later contributor silently overrides a non-default earlier value.

### 12.4 Integration with `vide` and `ex`

`vide Sancti/01-01` and `ex Sancti/12-25m3;` in a `[Rule]` section direct the evaluator to inherit rules from another feast file. `rules/resolve-vide-ex.ts` handles the reference chase, using Phase 1's reference resolver for the actual file fetch. Cycles are detected and reported as warnings. `ex` is a whole-file base; `vide` is a narrower selective fallback. The inherited directives are then split into celebration-level and hour-level buckets by the same evaluator.

### 12.5 Paragraph-Scoped Conditionals

The Ordinarium skeletons contain paragraph-scoped conditionals (file-format spec §9 item 6, and the `ConditionalScope` type in the Parser). These are **not** `[Rule]` directives — they are inline conditional blocks inside the Hour skeleton. `rules/apply-conditionals.ts` evaluates them against a `RuleEvalContext` carrying:

- The active `ResolvedVersion`.
- The current liturgical season and day-name.
- The winning celebration and commemorations.
- The `CelebrationRuleSet` and the current `HourRuleSet`.

The conditional's output is a concrete text block or an explicit suppression. The result is consumed by Hour Structuring (§16), not by Rule Evaluation itself; but the evaluator owns the conditional-evaluation primitive because its context is the same.

### 12.6 Diagnostics

Every rule directive not mapped to a known `CelebrationRuleSet` or `HourRuleSet` slot lands in `CelebrationRuleSet.unmapped` and produces a `RubricalWarning` with code `rule-unmapped`. This is how new or rare directives surface during implementation: as data, not as silent no-ops.

---

## 13. Concurrence Resolution

Concurrence is the least intuitive part of the rubrics. At Vespers, the liturgical day of today overlaps the liturgical day of tomorrow:

- Hours I–None on a given civil day always belong to today's Office.
- **Vespers is shared**: it is simultaneously Second Vespers of today and First Vespers of tomorrow.
- **Compline follows Vespers**: if tomorrow won the Vespers, today's Compline is tomorrow's.

The engine processes this by computing `OccurrenceResult` **and** `CelebrationRuleSet` for both `today` and `tomorrow`, then running `resolveConcurrence` on the pair. Concurrence consults `CelebrationRuleSet.hasFirstVespers` and `CelebrationRuleSet.hasSecondVespers` before any class-based decision: a feast with `no prima vespera` in its rules does not compete for First Vespers regardless of rank, and a feast with `no secunda vespera` yields the Vespers to the following day unconditionally. Only when both candidates are live does the class matrix (§13.1) apply.

### 13.1 Concurrence Classes

Each celebration has a **Vespers class**:

- *Totum* — feast has full Second/First Vespers of its own.
- *Capitulum* — only from the chapter onward is proper; psalms come from today.
- *Nihil* — feast has no Vespers (many lesser feasts).

Combined with rank, this determines the concurrence outcome:

| Today class | Tomorrow class | Outcome (1960)              |
|-------------|----------------|-----------------------------|
| Higher      | Lower          | Today's Second Vespers; commemorate tomorrow |
| Lower       | Higher         | Tomorrow's First Vespers; commemorate today  |
| Equal       | Equal          | Today's Second Vespers prevails (*praestantior*) |
| Equal *nobilior*-tie | | Complex: falls to the per-system tie-break |

Historical systems use additional dignities (*privilegiata*, *festiva*, *semiplena* from capitulo, ...). The 1955 and 1960 simplifications collapse several of these. The `concurrence/tables/*.ts` files encode the full matrix per policy.

### 13.2 Compline

Compline is almost always the Compline *of the day's Vespers winner*. Exceptions: in the Triduum, Compline follows a special pattern; on some ferial days 1960 uses a "Compline of the ordinary" regardless of the day's feast. `compline.ts` (in `hours/`) consumes the concurrence result and emits its structure.

---

## 14. Transfer Computation

The Directorium Overlay (§8) already supplies year-specific transfers when a `Tabulae/Transfer/<year-key>.txt` entry applies. This section covers the **rule-driven** computation used when no table entry exists for the current `(version, year, date)` tuple.

### 14.1 When This Stage Runs

Candidate Assembly (§9) emits `impeded: Candidate[]` for any feast whose proper date has been displaced — either by the overlay signalling `officeSubstitution` away from the feast, or by occurrence (§10) classifying the loser as transferable rather than commemorable under the active policy. `transfer/compute.ts` consumes this list and emits `Transfer[]`, each giving the feast and its computed target date.

The output is fed back into the engine for the *target* date: when `resolveOrdo(target)` runs, the transferred feast enters Candidate Assembly with `source: 'transferred-in'` and its original date recorded on `transferredFrom`.

### 14.2 The Walk

```typescript
// transfer/compute.ts
export function computeTransferTarget(
  impeded: Candidate,
  fromDate: Date,
  version: ResolvedVersion,
  policy: RubricalPolicy,
  dayContext: (d: Date) => TemporalContext,
  overlayFor: (d: Date) => DirectoriumOverlay,
  maxDays: number = 60,
):
  | { readonly target: Date; readonly reason: TransferReason }
  | { readonly target: null; readonly reason: 'perpetually-impeded' };
```

The walk advances one day at a time. A target is accepted when **all** hold:

- The temporal day on the target does not outrank the impeded feast under `policy.precedence`.
- No existing sanctoral feast of equal-or-higher rank is already assigned to the target.
- The target's season is not one the policy forbids transferring into (e.g., Holy Week under 1960).
- The target's overlay (from the Directorium for that date, if any) does not already place another feast there.

60 days bounds the search. The longest realistic gap (Annunciation → Low Monday) is four weeks, so the bound is safe. Exceeding it returns `'perpetually-impeded'` — extremely rare in practice, a data-quality signal worth surfacing.

### 14.3 Reconciliation with the Overlay

When the overlay and the rule-driven computation both produce a target, the overlay **wins**: diocesan authorities or the calendar's compilers have chosen a specific day for a specific year, possibly for pastoral reasons beyond the rubrics. If they disagree, the engine emits `transfer-table-overrides-rule` as a warning and uses the overlay's target. This warning is a Phase-5 data-quality signal, not an error.

When the overlay is silent and the rule-driven computation succeeds, the computed target is authoritative.

### 14.4 Scripture Transfers

`Stransfer/<year-key>.txt` governs which Matins scripture pericopes are read when the Office of the day displaces the scheduled scripture course. Scripture transfers arrive via the Directorium Overlay as `overlay.scriptureTransfer` and are consumed by §16.3 Matins, which uses the overlay's `operation` code (`R` replace, `B` begin, `A` append) to splice the correct pericope into the day's lesson sources. The rule-driven transfer computation above does not touch scripture transfers.

---

## 15. Commemoration Assembly

### 15.1 Inputs

- The winning celebration.
- Occurrence losers that the policy flagged as "commemorate."
- Concurrence outputs on the Vespers boundary.
- Continuing-octave ferial commemorations.
- Suffragium (pre-1955 only): commemoration of saints made at Lauds/Vespers on ferial days outside privileged seasons.

If the winner's `CelebrationRuleSet.omitCommemoration` is true (from `Omit Commemoratio` in the feast's `[Rule]` section), this stage returns an empty commemoration list regardless of inputs. This is why Commemoration Assembly runs after Rule Evaluation (§12) — the omission is a rule-derived decision, not a policy default.

### 15.2 Ordering

Commemorations are ordered by **dignity** within the list, not by source. The policy's `compareCommemorations` defines the total order: class first, then a system-specific tie-breaker (proper order of the feast in the calendar, privileged vs. ordinary, etc.).

### 15.3 Limits

1960 rubrics dramatically reduce the number of commemorations (`climit1960` in the Perl code at `horascommon.pl:1743`). The rule is roughly: at most *one* commemoration at Lauds and Vespers on feasts of the I or II class, zero on days of the I class of the Lord (Easter, etc.). The policy's `limitCommemorations` captures this.

### 15.4 Per-Hour Attachment

Not every Hour receives every commemoration:

- **Matins**: generally no commemorations, but commemorated feasts can contribute a replacement Lectio9 when `CelebrationRuleSet.lessonSources` route the ninth lesson to them (see §16.3).
- **Lauds**: all commemorations, each as antiphon + versicle + oration, with the oration order mirroring the antiphon order.
- **Minor Hours (Prime / Terce / Sext / None)**: no commemorations under most systems.
- **Vespers**: all commemorations (subject to limits).
- **Compline**: no commemorations.

The output `Commemoration.hours` field carries this per-instance; Phase 3 uses it to emit the right slots in the right Hours.

---

## 16. Hour Structuring

Each `hours/<hour>.ts` module is a pure function producing a typed `HourStructure`:

```typescript
export function structureLauds(
  celebration: Celebration,
  commemorations: readonly Commemoration[],
  celebrationRules: CelebrationRuleSet,
  ordinarium: OrdinariumSkeleton,
  temporal: TemporalContext,
  version: ResolvedVersion,
  policy: RubricalPolicy,
  corpus: CorpusIndex,
): HourStructure;
```

The signature is uniform across the eight Hour modules. Four inputs deserve explicit mention:

- **`celebrationRules`** — the merged `CelebrationRuleSet` from §12, already accounting for the feast and commemorated-feast lesson routing. Hour modules never re-parse `[Rule]` directives.
- **`ordinarium`** — the `OrdinariumSkeleton` for this Hour, already preamble-resolved by Phase 1. The skeleton is a tree of slots (some fixed, some conditional).
- **`temporal`** — the day's seasonal context.
- **`policy`** — the rubrical policy, consulted for things the rules do not cover (e.g. Paschal *Alleluia* insertion, Gloria Patri suppression in the Triduum — these are policy-uniform, not feast-specific).

### 16.1 The Skeleton-Application Model

The Ordinarium provides the skeleton: the ordered list of slots (`invitatorium`, `hymnus`, `antiphona1`, `psalmus1`, ..., `capitulum`, `versus`, `benedictus`, `oratio`, ...). Each hour builder first derives a local `HourRuleSet` from the `CelebrationRuleSet`, the hour-scoped feast directives, and the hour-scoped Ordinarium rules. Each slot is then resolved in order by the pipeline:

1. **Suppression check.** If `hourRules.omit` contains this slot's key (e.g. `hymnus` for the Triduum), the slot is dropped.
2. **Conditional application.** If the skeleton slot carries an inline conditional, evaluate it via `rules/apply-conditionals.ts` with the `RuleEvalContext` for this celebration and Hour. A false conditional drops the slot; a true one produces its content.
3. **Proper lookup.** Consult the celebration's feast file at the corresponding section (e.g. `[HymnusL]` for Lauds hymn). Phase 1's reference resolver already handles `@` cross-references, Commune fallback, and seasonal substitution.
4. **Skeleton fallback.** When the feast is silent, use the Ordinarium's own content for the slot.
5. **Season-global transforms.** Apply Paschal *Alleluia* insertion at antiphon endings; suppress *Gloria Patri* in the Triduum; insert *Alleluia, alleluia* at versicles during Paschaltide. These are policy-driven transforms applied to the resolved text, not slot-level decisions.

Every step is pure: given the same inputs, the same output. The policy's, `CelebrationRuleSet`'s, and `HourRuleSet`'s behaviour is deterministic by construction.

### 16.2 Psalter Selection

Under the Roman Psalter of St. Pius X (1911) — still authoritative for *Divino Afflatu* and 1960 — the psalms of each Hour depend on:

- The day of the week (the ferial psalter).
- `hourRules.psalterScheme` — `ferial`, `dominica`, `festal`, or `proper`, set by the winning feast's rules plus hour-scoped overrides.
- `hourRules.psalmOverrides` — per-slot overrides like `Psalm5Vespera=116`.
- For Sundays outside specific seasons, the Sunday distribution.
- Specific feasts that override via proper psalmody (Christmas, Epiphany, Easter, etc. have their own psalms at certain Hours).

```typescript
export function selectPsalmody(
  hour: HourName,
  celebration: Celebration,
  hourRules: HourRuleSet,
  temporal: TemporalContext,
  policy: RubricalPolicy,
): readonly PsalmAssignment[];
```

The function's decision tree is explicit:

1. If `hourRules.psalmOverrides` name this slot, use the named psalm.
2. Else if `hourRules.psalterScheme === 'proper'` or the feast provides proper psalmody, use the feast's list.
3. Else if `hourRules.psalterScheme === 'festal'`, use the commune's festal set.
4. Else if `hourRules.psalterScheme === 'dominica'` or the day is an eligible Sunday, use the Sunday distribution.
5. Else use the ferial psalter for this weekday.

Antiphon-selection mirrors the same tree; when `celebrationRules.antiphonScheme === 'proper-minor-hours'` and the current Hour is Prime, Terce, Sext, or None, the builder prefers the celebration's proper minor-hour antiphons before falling back. The policy then applies Paschal *Alleluia* to every antiphon ending and suppresses doubling on simpler-rank days under 1960.

### 16.3 Matins

Matins is the most structurally variable Hour and carries the largest share of rule-driven branching. It deserves its own model.

#### 16.3.1 `MatinsPlan`

`hours/matins.ts` begins by producing a typed plan before touching any text:

```typescript
// types/matins.ts
export interface MatinsPlan {
  readonly nocturns: 1 | 3;
  readonly totalLessons: 3 | 9 | 12;
  readonly lessonsPerNocturn: readonly number[];  // e.g. [3,3,3] or [12]
  readonly invitatorium: InvitatoriumSource;
  readonly hymn: HymnSource;
  readonly nocturnPlan: readonly NocturnPlan[];
  readonly teDeum: 'say' | 'replace-with-responsory' | 'omit';
}

export interface NocturnPlan {
  readonly index: 1 | 2 | 3;
  readonly psalmody: readonly PsalmAssignment[];
  readonly antiphons: readonly AntiphonReference[];
  readonly versicle: VersicleSource;
  readonly lessons: readonly LessonPlan[];
  readonly responsories: readonly ResponsorySource[];
}

export interface LessonPlan {
  readonly index: LessonIndex;        // 1..12
  readonly source: LessonSource;      // scripture | patristic | commemorated
  readonly gateCondition?: Condition; // for `in N loco` alternate sets
}
```

The plan is derived from three inputs: `celebrationRules.matins` (nocturn/lesson counts), `celebrationRules.lessonSources` (per-lesson routing), and `celebrationRules.lessonSetAlternates` (the `in 3 Nocturno Lectiones ex Commune in 3 loco` directive family).

#### 16.3.2 Lesson Sourcing

Each lesson has a `LessonSource` discriminated union:

```typescript
export type LessonSource =
  | { readonly kind: 'scripture'; readonly pericope: PericopeRef; readonly course: ScriptureCourse }
  | { readonly kind: 'scripture-transferred'; readonly pericope: PericopeRef; readonly op: 'R' | 'B' | 'A' }
  | { readonly kind: 'patristic'; readonly reference: ReferencePath }
  | { readonly kind: 'hagiographic'; readonly reference: ReferencePath }
  | { readonly kind: 'commemorated'; readonly feast: FeastReference; readonly lessonIndex: LessonIndex }
  | { readonly kind: 'homily-on-gospel'; readonly gospel: PericopeRef };
```

Resolution order for the ninth (or final) lesson when a commemorated feast is present:

1. If `celebrationRules.lessonSources` explicitly route `lectio9` to `{ kind: 'commemorated', feast: X }`, that wins.
2. Else if the policy's `hourDirectives('matins').commemoratedLessonSlot` says "Lectio9 goes to the principal commemoration," build a `{ kind: 'commemorated' }` source for it automatically.
3. Else the feast's own Lectio9 applies.

#### 16.3.3 Scripture Transfer Application

`overlay.scriptureTransfer` (from §8) carries the Directorium's scripture-transfer entry for the date. The lesson builder applies it this way:

- **`R` (replace)** — the scheduled pericope is discarded; the transfer's target pericope takes its place in the nocturn.
- **`B` (begin)** — the scripture course is rewound to begin at the target pericope on this date.
- **`A` (append)** — the target pericope is appended to the day's reading after the scheduled one, increasing the lesson count by one.

These operations change the `MatinsPlan.nocturnPlan[*].lessons` entries, not the count specified by `celebrationRules.matins.lessonCount` — except `A`, which increments.

#### 16.3.4 Alternate Lesson Sets (`in N loco`)

The file-format spec allows a feast file to carry multiple lesson sets gated by a condition: `in 3 Nocturno Lectiones ex Commune in 3 loco`, or `Lectio4 in 2 loco`. The parser records these with a location index. `celebrationRules.lessonSetAlternates` route a given lesson index to the right alternate:

```typescript
export type AlternateLocation = { readonly location: 1 | 2 | 3; readonly gate?: Condition };
```

The matins plan builder picks the alternate whose gate condition evaluates true for the current `RuleEvalContext`, falling back to location `1` when no alternate applies.

#### 16.3.5 Hymn, Invitatorium, Te Deum

- `invitatorium` comes from the feast when present, else the season's Psalterium entry. `hourRules.omit` with `invitatorium` suppresses the whole block.
- `hymn` resolution uses `celebrationRules.doxologyVariant` when present (e.g. `Doxology=Nat` substitutes the Christmas doxology), else the celebration defaults. Papal hymns use `celebrationRules.papalNames` to inject the reigning pontiff's name.
- `teDeum` is resolved by: `celebrationRules.teDeumOverride` if set (the `Feria Te Deum` or suppress-Te-Deum directives); else the policy's day-class rule. In the standard case, the 9th responsory replaces the Te Deum on ferial days of 1960; doubles and Sundays retain it.

#### 16.3.6 Length

`hours/matins.ts` is expected to be the longest module in the package — on the order of 600–800 lines. Splitting it too early creates coupling we cannot predict yet. Splitting happens after the full test surface is passing, driven by natural seams (plan-building vs. text-fetching vs. transform-application).

---

## 17. Top-Level API

```typescript
// src/index.ts
export { createRubricalEngine, type RubricalEngine } from './engine.js';
export * from './types/index.js';

// src/engine.ts
export interface RubricalEngine {
  /** The headline API. Deterministic and pure given the same config. */
  resolveOrdo(date: Date | string): OrdoEntry;

  /** Batch interface; same semantics but cache-friendly. */
  resolveOrdoRange(fromInclusive: Date, toInclusive: Date): readonly OrdoEntry[];

  /** Cheap preview: which feast wins today? No Hour structuring. */
  resolveDayOfficeSummary(date: Date | string): DayOfficeSummary;

  /** Introspection for Phase 4 /api/v1/rubrics. */
  readonly config: Readonly<RubricalEngineConfig>;

  /** The resolved version descriptor the engine is bound to. */
  readonly version: ResolvedVersion;
}

export function createRubricalEngine(config: RubricalEngineConfig): RubricalEngine;
```

Key properties:

- **Deterministic.** `resolveOrdo('2024-03-25')` returns the same `OrdoEntry` every call for the same config.
- **Pure.** No I/O, no `Date.now()` dependence, no randomness.
- **Serializable output.** `OrdoEntry` uses plain objects and arrays only at its public boundary. Any internal `Map` / `Set` use is projected to DTO form before return. This matters for Phase 4 caching.
- **Version-bound.** Each engine instance is bound to one `ResolvedVersion`. Version switching is handled at the orchestration layer (Phase 4 instantiates one engine per served version), not by mutating the engine.

---

## 18. Implementation Strategy

Phase 2 is large. It is broken into eight sub-phases, each independently shippable with its own test surface. The sub-phases follow the pipeline order (§3.1), ensuring that dependencies are satisfied before dependents are built.

### Phase 2a — Foundations (version + temporal + sanctoral lookup)

- Types: `OrdoEntry`, `Candidate`, `ResolvedRank`, `FeastReference`, `VersionHandle`, `ResolvedVersion`, `VersionDescriptor`, supporting unions.
- `version/registry.ts`, `version/resolve.ts` — reads `data.txt`, builds `ResolvedVersion`, validates handles, binds to policy via `VERSION_POLICY` map.
- `temporal/easter.ts`, `temporal/day-name.ts`, `temporal/season.ts`.
- `sanctoral/kalendarium-lookup.ts`, `sanctoral/rank-normalizer.ts`.
- `candidates/assemble.ts` (simplest version — no transfers, no overlay yet).
- **Deliverable**: `resolveDayOfficeSummary(date)` returns the list of candidates plus the "naive winner" (highest raw rank). Version resolution works for all 18 entries in `data.txt`.
- **Phase 2a implementation note**: the summary currently also carries the day's `TemporalContext` (`dayName`, `weekStem`, `season`, etc.) as a diagnostic/testing aid. This is intentionally richer than the minimum deliverable and may remain as a stable convenience surface.
- **Test**: day-name matches Perl `getweek` for every date across 5 liturgical years; candidate list matches for the same dates; every `data.txt` version resolves to a valid `ResolvedVersion` with a bound policy.

### Phase 2b — Directorium Overlay

- `directorium/overlay.ts` — builds the per-date overlay from the resolved version's `transfer` and `stransfer` handles, applying `versionFilter`, `dirgeN`, `HyMM-DD=K`, and `Tempora/<path>` substitutions.
- `directorium/dirge.ts` — walks Lauds/Vespers on flagged days.
- Integrated with `candidates/assemble.ts`: overlay's `officeSubstitution` replaces or reorders candidates.
- **Deliverable**: candidate lists for every date in the corpus correctly reflect Directorium substitutions across all three headline versions.
- **Test**: all ~170 dates present in the `Tabulae/Transfer/*.txt` files produce the expected substitutions; `dirge1`/`dirge2`/`dirge3` are attached to the right Lauds/Vespers; papal-hymn selection via `HyMM-DD=K` agrees with Perl.

### Phase 2c — Occurrence for 1960

- `policy/rubrics-1960.ts` and its precedence table.
- `occurrence/resolver.ts` wired to the 1960 policy.
- **Deliverable**: `resolveOrdo()` for 1960 produces `celebration` + raw `commemorations` (no transfer computation, no concurrence, no rule evaluation, no Hour structuring yet).
- **Test**: Ordo Recitandi snapshots for 1960 across a full year.

### Phase 2d — Rule Evaluation

- `rules/evaluate.ts` — builds `CelebrationRuleSet` from policy defaults → feast → commemorated-lesson routing, and provides helpers for per-hour `HourRuleSet` derivation.
- `rules/resolve-vide-ex.ts` — follows `vide` / `ex` chains using the Phase 1 reference resolver.
- `rules/apply-conditionals.ts` — evaluates paragraph-scoped conditionals with a `RuleEvalContext`.
- `docs/adr/002-two-scope-rule-evaluation.md` — recommended write-up recording why celebration-level rule evaluation and hour-level rule derivation remain distinct.
- `CelebrationRuleSet`, `HourRuleSet`, `MatinsRuleSpec`, supporting types in `types/rule-set.ts`.
- **Deliverable**: every candidate produces a valid `CelebrationRuleSet`, and every hour can derive a valid `HourRuleSet`; unmapped directives are surfaced as warnings.
- **Test**: for every feast file in the corpus, produce a `CelebrationRuleSet` and assert key invariants (e.g. `matins.lessonCount ∈ {3,9,12}`); for every Hour, derive an `HourRuleSet` and assert hour-scoped invariants (`psalterScheme` is known; omittable slots are legal for that Hour); track `unmapped` count per policy as a regression signal.

### Phase 2e — Transfer Computation and Vigils

- `transfer/compute.ts`, `transfer/reconcile.ts`.
- Vigil handling in `candidates/assemble.ts`.
- **Test**: Annunciation in Holy Week for 5+ years; St. Joseph transfer cases; Feb 24/25 in leap years; reconciliation warnings fire precisely when the rule-driven target disagrees with the overlay's target.

### Phase 2f — Concurrence and Compline

- `concurrence/vespers-class.ts`, `concurrence/resolver.ts`.
- `hours/compline.ts` minimal structure.
- Celebration-rule integration: concurrence respects `hasFirstVespers` / `hasSecondVespers`.
- **Test**: every Vespers boundary in a full year under 1960.

### Phase 2g — Hour Structuring (Matins last)

- All modules in `hours/` **except** Matins. Can parallelize: one contributor per Hour.
- Psalter selection for both Roman (1911/1960) and Pian (only used by the Pius X corpus).
- `hours/matins.ts` is **its own sub-phase deliverable** — built after the other Hours are stable because its test surface and complexity dwarf the rest. Includes `MatinsPlan`, `LessonSource`, scripture-transfer application, and `in N loco` alternates.
- **Deliverable**: complete `OrdoEntry.hours` for all eight Hours.
- **Test**: snapshot comparison against Perl output for every Hour of every day in a full year; Matins-specific tests for scripture-transfer operation codes, commemorated-lesson routing, and alternate-set selection.

### Phase 2h — 1911 and 1955 Policies

- `policy/divino-afflatu.ts`, `policy/reduced-1955.ts`, their precedence tables, octave handling.
- **Deliverable**: `resolveOrdo()` for all three headline versions.
- **Test**: system-matrix snapshots; divergence reports; every version in `data.txt` that maps to one of these three policies produces a valid OrdoEntry on every date in a full year.

### Build and Dependency Discipline

- No runtime dependencies outside `@officium-novum/parser`. No `date-fns`, no `luxon`: date math is small enough to write correctly and stable enough to trust.
- `tsconfig` in strict mode, `noUncheckedIndexedAccess` on, `exactOptionalPropertyTypes` on. The Parser is already configured this way.
- Vitest for tests, matching Phase 1's setup.
- CI matrix: every PR runs unit tests + the ordo snapshot suite. Baseline match rate must not regress.

---

## 19. Validation Strategy

Validation is where the engine is proved correct. It is as much work as implementation and must be funded accordingly.

### 19.1 Ground Truth Sources

1. **Ordo Recitandi** — the annual calendar directives published by various dioceses and religious communities. Several decades are digitized. These are the primary authority on "what is prayed on this day."
2. **The governing rubrical books** — *Rubricae Generales Breviarii Romani* (1911), *Cum Nostra* and *Ritus Servandus* (1955), *Rubricarum Instructum* (1960). These are the *why*.
3. **The legacy Divinum Officium Perl output** — a secondary reference. Matches it where the Ordo does; deviates from it, with documentation, where the Ordo shows the Perl is wrong.
4. **Published breviaries** — *Breviarium Romanum* editions of 1914, 1955, 1962 for cross-checking specific feasts' structures.

See `docs/rubrical-sources.md` for the project's canonical index of the external source families and their current `VersionHandle` / policy-family mapping.

Online calendars and ordos that are not themselves published Ordo Recitandi
books may still be useful as secondary cross-checks. The current fixture home
for `1962ordo.today` is
`packages/rubrical-engine/test/fixtures/external/1962ordo-today`; it is scoped
to `rubrics-1960` investigation and must not be treated as primary authority.

### 19.2 Test Surfaces

**Unit tests** — one per exported function in `temporal/`, `sanctoral/`, `occurrence/`, etc. Each operates on small inputs: a single date, a small candidate list, a specific policy. Target coverage: 100% of branches in `policy/*.ts`; ≥95% in the resolvers.

**Snapshot tests — Ordo matrix**: For each of the three rubrical systems, ingest at least one full Ordo Recitandi year and assert every day's `celebration.title` and `commemorations[].title` match. Start with 1960 (the system with the most available Ordo data), then 1955, then 1911. Snapshots live in `test/ordo/<system>/<year>.json`.

**Snapshot tests — Perl comparison**: A harness runs the Perl `horas.pl` for each date in a matrix and captures the first-paragraph headline ("Feria III infra Hebdomadam III in Quadragesima ~ IV. classis ..."). The engine's `OrdoEntry` is asserted to produce an equivalent headline. Divergences are logged to `test/divergence/<system>-<year>.md` with the Ordo cited as the adjudicator.

**Property-based tests**: A small set of invariants that must hold for every date:

- `resolveOrdo(d).date === ISO(d)`.
- The `celebration.rank.weight` is greater than or equal to every `commemoration.rank.weight`.
- If `resolveOrdo(d).transferredFrom !== undefined`, the original date resolves to a non-transferred `OrdoEntry` on that date.
- No `Commemoration` appears in `hours` for an Hour that does not receive commemorations under the policy.
- For each day `d`, the concurrence outcome at `d` Vespers is consistent with the `d+1` Vespers computation.

**The Triduum test**: Palm Sunday through Easter Sunday, every Hour, every rubrical system. The Triduum is where structural quirks concentrate. A passing Triduum test is strong evidence of general correctness.

### 19.3 Appendix A Dates

The modernization spec (§Appendix A) enumerates a minimum set of test dates. Each is a dedicated test file in `test/edge-cases/` with its expected `OrdoEntry` shape committed.

### 19.4 Divergence Adjudication Protocol

When the engine disagrees with the Perl:

1. Look up the Ordo Recitandi for the date.
2. If the Ordo agrees with the engine: the Perl has a bug. Document in `upstream-issues.md` for later filing.
3. If the Ordo agrees with the Perl: the engine has a bug. File it in the repo issue tracker with the reproducing test case.
4. If the Ordo is ambiguous or the case is not addressed: consult the governing document (1911/1955/1960). Document the interpretation in an ADR under `docs/adr/`.
5. If still unresolved: consult a subject-matter expert. Record the consultation and resolution.

No divergence is ever resolved by "matching the Perl" alone. Every resolution carries a citation.

### 19.5 Regression Discipline

Every Ordo snapshot that passes becomes part of the CI baseline. Any change that drops a previously-passing day is a blocking failure: the change must be reverted, the snapshot adjudicated, or the regression fixed before merge.

---

## 20. Risks

### 20.1 Under-Specified Rubrical Corners

The governing documents do not exhaustively cover every combinatorial case. Certain questions ("may the Suffragium be said on a commemorated double in 1911?") admit multiple readings. Where this happens, we:

- Follow the Perl behavior if it aligns with published Ordo,
- Otherwise adopt the consensus of contemporary commentators (O'Connell's *The Celebration of Mass*; Fortescue-O'Connell-Reid on the Breviary),
- Document the choice in an ADR,
- Expose it as a configurable policy flag if the choice is plausibly debatable.

### 20.2 Calendar Edition Drift

The `1960` kalendar has seen editorial refinements in *Divinum Officium* over the years. We pin a commit of `upstream/` and note the SHA. Edition drift in upstream is a data issue, not an engine issue, but it surfaces through the engine's tests.

### 20.3 Octave Handling Complexity

Pre-1955 octaves are the single most error-prone area. We build octave support last (Phase 2f), behind a complete policy interface, so that issues surface after the rest of the engine is stable.

### 20.4 Performance for Full-Year Batching

`resolveOrdoRange(year)` is ~366 invocations. Naïve runtime should be well under a second. If profiling reveals allocation hotspots in `candidates/assemble.ts` or `rules/evaluate.ts` (the stages with frequent small-array and small-map construction), we cache per-date artefacts keyed by `(date, version)`. No other optimization is planned in v1.

### 20.5 Monastic and Dominican Rites

Present in the corpus but explicitly out of scope for v1. The `RubricalPolicy` interface is designed to accommodate them without refactor. A proof-of-concept `policy/monastic-1963.ts` is not required for Phase 2 sign-off but is welcome as a structural validation.

---

## 21. Open Questions

1. **Multi-year Ordo ingestion.** How many years of digitized Ordo Recitandi do we realistically acquire for the snapshot matrix? One year per system is a minimum; three is comfortable; more is ideal for transferred-feast coverage.
2. **Engine-per-version vs. parameterised call.** Phase 4's API accepts a `?version=` parameter. Do we instantiate one engine per resolved version at startup (simplest, maps cleanly onto `ResolvedVersion` immutability), or allow the engine itself to be parameterised per call? The `createRubricalEngine(config)` signature currently implies the former. Per-call parameterisation would require the engine's caches to key on `(date, version)` rather than `date` alone — acceptable if beneficial. Deferring until Phase 4 API design settles.
3. **Votive Office input surface.** Votive offices (Dead, Sacred Heart, Our Lady on Saturdays) are user choices, not calendar derivations. Do they live as a field on `RubricalEngineConfig` (one engine knows a default votive) or as a per-call parameter? Likely the latter, but deferring until Phase 4 API design settles.
4. **ADR format.** We need a lightweight Architecture Decision Record convention for adjudications. Proposed: one `.md` file per decision under `docs/adr/NNN-short-title.md`, Markdown with a fixed header (`Status: accepted | superseded | deprecated`, `Date:`, `Context:`, `Decision:`, `Consequences:`). First ADR candidates: **ADR-001 `VersionHandle` as the primary engine binding**, recording why the engine keys on `ResolvedVersion` rather than on a `RubricSystem` enum; and **ADR-002 `Two-scope rule evaluation`**, recording why `[Rule]` handling is split between `CelebrationRuleSet` and per-hour `HourRuleSet` derivation instead of flattened into one record.
5. **Unmapped-rule discovery loop.** During Phase 2d, `CelebrationRuleSet.unmapped` will accumulate warnings for directives we have not yet modelled. The plan is to triage these weekly until Phase 2g: each warning either gets promoted to a typed field on `CelebrationRuleSet` or `HourRuleSet`, or is formally classified as "intentionally unmapped because it affects only Phase 3 rendering." We need an agreed-upon cadence and an owner for that triage.
6. **Language for the engine.** The modernization spec left the TypeScript vs. Rust question open; Phase 1 chose TypeScript. Phase 2 inherits that choice unless strong reason surfaces otherwise. No such reason is currently visible.

---

## 22. Success Criteria

Phase 2 is "done" when all of the following hold:

1. `@officium-novum/rubrics` package published to the monorepo with `createRubricalEngine(config)` exposed.
2. Every version in `data.txt` resolves to a valid `ResolvedVersion` with a bound policy; invalid or orphaned handles fail at construction time with a clear error.
3. `resolveOrdo(date)` produces a non-empty, fully typed `OrdoEntry` for every date in `[1920-01-01, 2099-12-31]` under each of the three headline policies (`divino-afflatu`, `reduced-1955`, `rubrics-1960`) — no exceptions, no throws.
4. Ordo snapshot match rate ≥99% per policy per ingested year.
5. All Appendix A edge-case dates pass under all three policies.
6. `CelebrationRuleSet.unmapped` is empty for every winning celebration on every date in a full year under the three headline policies, and hour derivation emits no `rule-unmapped` warnings for the winning Hours. (Non-winning-candidate unmapped directives may remain as triage backlog.)
7. CI green; typecheck green; zero `any`, zero `ts-ignore`.
8. Full-year batch resolution under 2 seconds on a modern laptop for any single version.
9. Documented divergences (`test/divergence/`) fewer than 10 per policy per year, each with a resolution plan or an ADR.
10. The three policy files are each under 800 lines and share no implementation details with each other via mutable state.

Meeting these criteria unblocks Phase 3 (Composition Engine), which consumes `OrdoEntry` and resolves its references against the Phase 1 Text Index to produce final ordered text.

---

## Appendix A — Legacy Perl Cross-Reference

The table below maps key Perl subroutines to their Phase 2 counterparts. It is a reading aid, not a literal port guide: the Perl code is mutative and globally-scoped, while Phase 2 is pure and typed. Where Perl uses ten `our $...` assignments to communicate, Phase 2 returns a typed object.

| Perl (file:line)                          | Phase 2 equivalent                                                 |
|-------------------------------------------|--------------------------------------------------------------------|
| `Date.pm:geteaster`                       | `temporal/easter.ts::gregorianEaster`                              |
| `Date.pm:getweek`                         | `temporal/day-name.ts::dayNameFor`                                 |
| `Date.pm:getadvent`                       | `temporal/day-name.ts::adventOne`                                  |
| `DivinumOfficium::data.txt` parsing       | `version/registry.ts` + `version/resolve.ts`                       |
| `Directorium.pm:get_from_directorium`     | `directorium/overlay.ts::buildOverlay` + `sanctoral/kalendarium-lookup.ts` |
| `Directorium.pm:transfered`               | `transfer/reconcile.ts::isTransferred`                             |
| `Directorium.pm:dirge`                    | `directorium/dirge.ts` → `overlay.dirgeDirective`                  |
| `Directorium.pm:hymnmerge` / `hymnshift`  | `directorium/overlay.ts::resolveHymnOverride` (`HyMM-DD=K`)        |
| `horascommon.pl:occurrence`               | `occurrence/resolver.ts::resolveOccurrence`                        |
| `horascommon.pl:concurrence`              | `concurrence/resolver.ts::resolveConcurrence`                      |
| `horascommon.pl:precedence`               | `engine.ts::resolveOrdo` (top-level orchestration)                 |
| `horascommon.pl:climit1960`               | `policy/rubrics-1960.ts::limitCommemorations`                      |
| `horascommon.pl:gettempora`               | `temporal/season.ts::seasonalContext`                              |
| `horascommon.pl:emberday`                 | `temporal/ember-rogation.ts`                                       |
| `horascommon.pl:nomatinscomm`             | `rules/evaluate.ts` → `CelebrationRuleSet.omitCommemoration`       |
| `horascommon.pl:nooctnat`                 | `policy/rubrics-1960.ts::octavesEnabled`                           |
| Scattered `[Rule]` directive handlers     | `rules/evaluate.ts` + `rules/apply-conditionals.ts`                |
| Scattered `vide` / `ex` inheritance       | `rules/resolve-vide-ex.ts`                                         |
| Scattered `Stransfer` application         | `hours/matins.ts` consumes `overlay.scriptureTransfer`             |
| `horas.pl:horas`                          | (not in scope — belongs to Phase 3)                                |
| `specials.pl`                             | (not in scope — Phase 3)                                           |

Total Perl lines in scope to port-or-replace: ~4,000 of the ~17,500-line `cgi-bin/` tree. The remainder handles HTML rendering, string interpolation, and language-specific tooling and is Phase 3's concern.

## Appendix B — Glossary Extensions

(Terms additional to the modernization spec's Appendix B.)

| Term | Definition |
|---|---|
| **Candidate** | A feast or feria under consideration for the Office of the day, prior to occurrence resolution. |
| **Commune** | A set of shared texts used when a feast lacks its own proper (e.g., *Commune Martyrum*). Referenced via `@C10`, `@C4`, etc. in corpus files. |
| **Concurrence** | See §13. The Vespers-boundary problem where today's Second Vespers and tomorrow's First Vespers coincide. |
| **Dirge** | A ceremonial lamentation sung on specific penitential days; signalled by the Directorium Overlay's `dirgeDirective`. |
| **Directorium Overlay** | The per-date effect of the `transfer`/`stransfer` tables bound to a `ResolvedVersion` — feast substitution, dirges, hymn overrides, and scripture transfers. See §8. |
| **MatinsPlan** | The typed plan produced by `hours/matins.ts` before any text is fetched — nocturns, lesson counts, lesson sources, Te Deum decision. See §16.3.1. |
| **Nobilior** | "More noble" — a tie-break term in the Tabella Concurrentiae for feasts of equal rank. |
| **Octave day** | The eighth day of an octave, often itself a feast of significance (*dies octava*). |
| **Praestantior** | "More eminent" — synonym for *nobilior* in some manuals; "that which prevails at Vespers in concurrence." |
| **Privilegiata** | Of a class that cannot be impeded by all but the highest-ranked competitors. |
| **ResolvedVersion** | An immutable record binding a `VersionHandle` to its kalendar, transfer/stransfer tables, base chain, and policy. The engine's primary calibration input. See §4.3, §5. |
| **RubricalPolicy** | The family of rules shared by several versions (e.g. `rubrics-1960`). A policy is selected by looking up the version's handle in `VERSION_POLICY`. |
| **CelebrationRuleSet** | The typed, hour-agnostic evaluation of `[Rule]` directives for one celebration: Matins shape, Vespers existence, lesson sources, commemoration omission, and celebration-wide selectors such as doxology or proper minor-hour antiphons. See §12.2. |
| **HourRuleSet** | The hour-local rule record derived from `CelebrationRuleSet` plus the Hour's Ordinarium skeleton: psalter scheme, slot omissions, capitulum variant, and other truly hour-scoped outcomes. See §12.2. |
| **Suffragium** | See modernization spec Appendix B. Note: its Phase 2 representation is a `HourDirective`, not a `Commemoration`, because it is a fixed formula rather than a per-feast entry. |
| **Transfer vs. commemoration vs. omission** | Three distinct fates a losing candidate may meet. The active policy's precedence table determines which applies per class and situation. |
| **VersionHandle** | A branded string naming one row of `data.txt` (e.g. `"Rubrics 1960 - 1960"`). Opaque at the type level — only `version/resolve.ts` may construct one. |
