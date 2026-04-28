# Divinum Officium Modernization Specification

**Version:** 1.0 — Draft  
**Date:** April 12, 2026  
**Status:** Proposal  
**Author:** Miguel (Sacramentum)

---

## 1. Executive Summary

The [Divinum Officium](https://github.com/DivinumOfficium/divinum-officium) project is a long-standing, community-maintained application that generates the traditional Roman Breviary and Missal texts. Its current architecture — monolithic Perl CGI scripts parsing section-based flat text files and rendering HTML server-side — tightly couples liturgical data, rubrical logic, and presentation. This coupling makes it difficult to support new output formats, third-party integrations, multilingual composition, or cost-efficient hosting.

This document specifies an incremental modernization path that preserves the project's editorial integrity while decoupling its architecture into discrete, testable layers. The guiding principle is **evolutionary, not revolutionary**: each phase delivers standalone value, produces no liturgical regressions, and does not disrupt the existing editorial workflow until a replacement is proven correct.

---

## 2. Design Principles

1. **Liturgical correctness is non-negotiable.** Every phase must be validated against known-good outputs before it replaces anything. One misplaced commemoration or dropped feast is a shipping bug that people will pray incorrectly from.

2. **The texts are a scholarly corpus, not application data.** They must remain in version-controlled, human-readable, diffable files. Git history, blame, and pull-request review are features, not limitations.

3. **Incremental delivery over big-bang rewrites.** Each phase produces a usable artifact (a library, a test suite, an API) independent of subsequent phases.

4. **Separate what changes at different rates.** The texts change editorially (slowly, with review). The rubrical rules are essentially fixed per rubrical system. The presentation layer changes with platform needs. These three concerns must live in separate modules.

5. **Cost-consciousness.** The current maintainers have signaled concern about hosting costs (issue #5003). The new architecture should be cheaper and simpler to operate than the current one, not more expensive.

---

## 3. Current Architecture (As-Is)

```
┌─────────────────────────────────────────────────┐
│              Perl CGI Application                │
│                                                  │
│  ┌────────────┐  ┌───────────┐  ┌─────────────┐ │
│  │ .txt File  │  │ Rubrical  │  │    HTML      │ │
│  │  Parsing   │◄─┤  Logic    │──┤  Rendering   │ │
│  │            │  │ (embedded)│  │  (embedded)  │ │
│  └─────┬──────┘  └───────────┘  └─────────────┘ │
│        │                                         │
│        ▼                                         │
│  ┌──────────────────┐                            │
│  │  Filesystem      │                            │
│  │  web/www/horas/  │                            │
│  │  web/www/missa/  │                            │
│  │  *.txt files     │                            │
│  └──────────────────┘                            │
└─────────────────────────────────────────────────┘
```

**Key pain points:**

- Rubrical logic is scattered across multiple Perl scripts with no single authoritative module.
- Text retrieval requires live filesystem parsing at request time.
- HTML generation is interleaved with text assembly, making alternative outputs (JSON, EPUB, PDF) impractical.
- No test suite comparing generated output against known-correct *Ordo* data.
- EPUB generation depends on customized Perl scripts tightly coupled to the rendering layer.
- Multilingual text composition requires navigating parallel directory trees at the filesystem level.

---

## 4. Target Architecture (To-Be)

```
┌──────────────────────────────────────────────────────────────┐
│                      Git Repository                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Canonical Source Texts (.txt / .yaml)                 │  │
│  │  web/www/horas/*, web/www/missa/*                      │  │
│  │  (editorially maintained, version-controlled)          │  │
│  └─────────────────────┬──────────────────────────────────┘  │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Parser Layer       │
              │   (Phase 1)          │
              │                      │
              │  Reads .txt files    │
              │  Emits typed objects │
              └──────────┬───────────┘
                         │
            ┌────────────┼────────────┐
            ▼                         ▼
 ┌─────────────────────┐  ┌─────────────────────┐
 │  Rubrical Engine     │  │  Text Index          │
 │  (Phase 2)           │  │  (Phase 1b)          │
 │                      │  │                      │
 │  Calendar + Ordo     │  │  In-memory or        │
 │  Precedence tables   │  │  Postgres read model │
 │  Occurrence rules    │  │  Queryable by feast,  │
 │  Concurrence rules   │  │  hour, language       │
 └──────────┬───────────┘  └──────────┬───────────┘
            │                         │
            └────────────┬────────────┘
                         ▼
              ┌──────────────────────┐
              │  Composition Engine  │
              │  (Phase 3)           │
              │                      │
              │  Assembles an Hour   │
              │  from rubrical       │
              │  decisions + text    │
              │  blocks              │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  API Layer           │
              │  (Phase 4)           │
              │                      │
              │  REST / JSON         │
              │  Read-only           │
              │  Stateless           │
              └──────────┬───────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │  Web       │ │  Mobile    │ │  Export     │
   │  Frontend  │ │  Clients   │ │  (EPUB,    │
   │  (Phase 6) │ │  (future)  │ │   PDF)     │
   └────────────┘ └────────────┘ └────────────┘
```

---

## 5. Phased Roadmap

### Phase 1 — Parser Layer and Canonical Schema

**Goal:** Transform the legacy `.txt` files into typed, validated internal objects without moving or reformatting the source files.

**Scope:**

1. **Analyze the existing file format.** Document every `[Section]` header convention, inline directive, cross-reference pattern, and language-variant convention used across the `horas/` and `missa/` directories. Produce a written format specification.

2. **Define a canonical schema.** Design typed data structures representing the atomic units of the corpus:
   - `Feast` — rank, class, color, Calendar entry, temporal/sanctoral designation.
   - `Hour` — structure definition (which psalms, antiphons, chapters, hymns, versicles, orations, commemorations).
   - `TextBlock` — a keyed, multilingual text unit (e.g., an antiphon in Latin + translations).
   - `Rubric` — an inline rubrical instruction attached to a text block.
   - `Reference` — a cross-reference to a common text (e.g., psalms from the Psalterium, commons from the Commune Sanctorum).

3. **Write the parser.** A module that reads the `.txt` files from their current filesystem locations and emits instances of the canonical schema. The parser should:
   - Accept a base directory path (so it can run against the existing repo checkout).
   - Resolve all `@`-references and includes to their targets.
   - Validate structural integrity (missing sections, broken references) and emit warnings.
   - Be idempotent and side-effect-free.

4. **Build a text index.** Once parsed, the objects should be held in an in-memory index queryable by feast, hour, language, and rubrical system. This index is the read-side projection; the files remain the source of truth. Optionally, this index can be serialized to a JSON or SQLite snapshot for faster cold starts.

**Language choice:** TypeScript (Node.js) or Rust. TypeScript offers faster iteration and aligns with a future Node-based API; Rust offers correctness guarantees and could compile to WASM for browser-side use. Either way, the parser must be a standalone package with its own `package.json` or `Cargo.toml`, not embedded in an application.

**Deliverable:** A `@divinum-officium/parser` package that can be imported by any downstream consumer. Published to npm or crates.io.

**Validation:** Parse the entire corpus without errors. Spot-check 50+ representative feasts across all supported languages against the current rendered output.

---

### Phase 2 — Rubrical Engine

**Goal:** Encode the rubrical decision logic as an isolated, fully tested domain library independent of any I/O, rendering, or text retrieval.

**This is the hardest phase and the load-bearing wall of the entire project.** It deserves its own design document before implementation begins.

#### 2.1 Scope of Rubrical Systems

The engine must support at minimum three rubrical configurations:

| System | Governing Documents | Key Characteristics |
|---|---|---|
| **Divino Afflatu (1911)** | *Rubricae Generales Breviarii* (1911 typical edition) | Full semidouble/double ranking, most commemorations, pre-1955 Holy Week |
| **Simplified Rubrics (1955)** | *Cum Nostra* (1955), decree of the SRC | Reduced vigils, simplified octave system, revised Holy Week |
| **1960 Rubrics** | *Rubricarum Instructum* (1960) | Four-class ranking, further reduction of commemorations, most commonly used today |

Future support for the 1570 rubrics or the Dominican rite would be valuable but is not in scope for v1.

#### 2.2 Core Responsibilities

The engine must answer one fundamental question:

> **Given a date and a rubrical system, what is the complete Ordo for that day?**

This means:

1. **Temporal cycle calculation.** Determine the liturgical season, week, and feria from the date. Compute Easter and all moveable feasts. Handle Septuagesima, Quinquagesima, Ember Days, Rogation Days.

2. **Sanctoral cycle lookup.** Determine which fixed feast(s) fall on the given date.

3. **Occurrence resolution.** When a temporal and sanctoral observance fall on the same day, determine which takes precedence according to the precedence tables. Handle:
   - Translation (transferring) of impeded feasts.
   - Simplification of feasts (1955+).
   - Omission of feasts in privileged seasons.
   - Perpetually impeded feasts and their resolution.

4. **Concurrence resolution.** When first Vespers of tomorrow's feast compete with second Vespers of today's feast, determine which prevails and whether a commemoration is made.

5. **Commemoration assembly.** List all commemorations to be made at Lauds, Vespers, and (where applicable) other Hours, in correct order of dignity.

6. **Structural determination.** For each Hour, specify:
   - Which psalms are used (ferial, festal, or proper).
   - Which antiphon set applies.
   - Whether the *Deus in adjutorium* or *Domine labia mea* is used.
   - The chapter, hymn, versicle, and oration.
   - Any special modifications (e.g., *Preces* on ferial days, *Suffragium* in certain seasons).

#### 2.3 Interface Design

```typescript
interface OrdoEntry {
  date: string;                    // ISO 8601
  rubricSystem: '1911' | '1955' | '1960';
  celebration: Celebration;        // The primary feast/feria
  rank: Rank;                      // I–IV class (1960) or double/semidouble/simple (pre-1960)
  color: LiturgicalColor;
  season: LiturgicalSeason;
  transferredFrom?: string;        // Original date if translated
  commemorations: Commemoration[]; // Ordered by dignity
  hours: Map<HourName, HourStructure>;
}

interface HourStructure {
  psalms: PsalmReference[];
  antiphons: TextReference[];
  chapter: TextReference;
  hymn: TextReference;
  versicle: TextReference;
  oration: TextReference;
  commemorationOrations: TextReference[];
  suffragium?: TextReference;
  preces?: TextReference;
  specialRubrics: string[];        // e.g., "Omit hymn at Prime in Passiontide"
}
```

The engine must be a **pure function**: `(date, rubricSystem) → OrdoEntry`. No I/O. No text fetching. It emits references (keys) to text blocks, not the text itself. Text resolution is the Composition Engine's job (Phase 3).

#### 2.4 Validation Strategy

This is where correctness is proven or disproven.

1. **Obtain published Ordo data.** Acquire the *Ordo Recitandi* for multiple years (many are available in digitized form). These are the authoritative reference for what the Office should be on any given day.

2. **Build snapshot tests.** For each rubrical system, select a representative set of at least 200 dates covering:
   - Every liturgical season.
   - Every rank of feast.
   - Occurrence conflicts (e.g., Annunciation in Holy Week).
   - Concurrence edge cases.
   - Transferred feasts.
   - Ember Days and Rogation Days.
   - Octaves (pre-1955).
   - Privileged ferias (Ash Wednesday, Holy Week, Christmas Eve).
   - The full Holy Week / Sacred Triduum sequence under each rubrical system.

3. **Compare against legacy output.** Run the existing Perl application for each test date and capture its output as a baseline. The new engine's `OrdoEntry` must produce equivalent liturgical decisions. Divergences are bugs until proven otherwise against the published *Ordo*.

4. **Continuous regression suite.** Every future change to the engine must pass the full snapshot suite. Add new snapshots as edge cases are discovered.

**Deliverable:** A `@divinum-officium/rubrics` package. Standalone. No dependency on the parser or any I/O layer.

---

### Phase 3 — Composition Engine

**Goal:** Given an `OrdoEntry` from the Rubrical Engine and access to the Text Index from the Parser, assemble the complete, ordered text of any Hour in any supported language.

**Scope:**

1. **Resolve text references.** The `OrdoEntry` contains keys (e.g., `psalm:109`, `antiphon:commune-virginum:ad-magnificat`). The Composition Engine looks up each key in the Text Index and retrieves the actual text in the requested language(s).

2. **Handle multilingual composition.** Support returning text in a single language or in parallel columns (e.g., Latin + English). The output structure must accommodate both.

3. **Apply inline rubrical modifications.** Some text blocks have conditional content (e.g., "In Paschal Time, add Alleluia"). The Composition Engine applies these based on the liturgical context from the `OrdoEntry`.

4. **Produce a format-agnostic output.** The output should be a structured document object — an ordered tree of typed nodes:

```typescript
interface ComposedHour {
  date: string;
  hour: HourName;
  celebration: string;
  language: string[];
  sections: Section[];
}

interface Section {
  type: 'psalm' | 'antiphon' | 'chapter' | 'hymn' | 'versicle'
      | 'oration' | 'rubric' | 'heading' | 'commemoration';
  texts: Record<string, string>;  // language code → text content
  reference?: string;              // canonical key for citation
}
```

This object can then be serialized to JSON (for the API), rendered to HTML (for the web frontend), or transformed to EPUB/PDF by downstream consumers. **The Composition Engine never produces HTML.**

**Deliverable:** A `@divinum-officium/compositor` package.

**Validation:** For each snapshot test date, compose every Hour and compare the assembled text blocks against the legacy Perl output. Differences in ordering, missing texts, or incorrect substitutions are bugs.

---

### Phase 4 — Read-Only API

**Goal:** Expose the Composition Engine over HTTP as a stateless, read-only JSON API.

**Scope:**

1. **Core endpoint:**

```
GET /api/v1/office/{date}/{hour}
  ?version=Rubrics%201960%20-%201960
  &lang=la,en
```

Returns a public DTO adapted from the current `ComposedHour` surface. The API
uses canonical `version` handles; `rubrics=1960` is a compatibility alias that
normalizes immediately to a `VersionHandle`.

2. **Calendar endpoint:**

```
GET /api/v1/calendar/{year}/{month}
  ?version=Rubrics%201960%20-%201960
```

Returns lightweight day summaries for the month. Useful for calendar UIs. The
API does not invent liturgical fields that the engine does not expose; for
example, celebration color is omitted until the rubrical engine owns it.

3. **Feast lookup:**

```
GET /api/v1/feasts?id={feast-id}
  ?version=Rubrics%201960%20-%201960
  &lang=la
```

Returns all text blocks associated with a feast, independent of date. Useful for reference and study.

4. **Health and metadata:**

```
GET /api/v1/status
GET /api/v1/versions      → lists canonical handles and support status
GET /api/v1/languages     → lists supported languages
```

**Framework:** A lightweight HTTP framework — Fastify (Node.js) or Actix (Rust) — is sufficient. No ORM needed; the Text Index is loaded at startup. The API server should start in under 2 seconds.

**Caching:** Responses for any given `(date, hour, rubrics, lang)` tuple are deterministic and immutable (the liturgical calendar does not change retroactively). Aggressive HTTP caching (`Cache-Control: public, max-age=86400`) and optional edge caching (Cloudflare, etc.) should be used. This directly addresses cost containment.

**Authentication:** None for v1. The API is read-only and serves public-domain liturgical texts. Rate limiting is sufficient for abuse prevention.

**Documentation:** Auto-generated OpenAPI 3.1 spec from route definitions. Published alongside the API.

**Deliverable:** A deployable API server with OpenAPI documentation.

---

### Phase 5 — Snapshot Testing and Legacy Comparison

**Goal:** Build a comprehensive automated test harness that proves the new stack produces liturgically identical output to the legacy Perl application.

This phase runs in parallel with Phases 1–4 and is arguably the most important quality gate.

**Scope:**

1. **Legacy output capture.** Write a harness that drives the existing Perl application (via Docker or direct invocation) for a matrix of inputs:
   - 365+ dates across a full liturgical year (or multiple years for transferred-feast coverage).
   - All supported Hours (Matins, Lauds, Prime, Terce, Sext, None, Vespers, Compline).
   - All three rubrical systems.
   - At least two languages (Latin + one vernacular).
   
   Capture the rendered HTML output and parse it into a normalized structure for comparison.

2. **New output generation.** For the same input matrix, run the new Parser → Rubrical Engine → Composition Engine pipeline and capture the `ComposedHour` output.

3. **Diff engine.** Compare the two outputs structurally:
   - Same psalms in same order?
   - Same antiphons?
   - Same orations and commemorations in same order of dignity?
   - Same hymn?
   - Same special rubrical notes?

   Produce a report listing matches, mismatches, and unresolved differences.

4. **Canonical adjudication.** For each mismatch, determine whether the legacy output or the new output is correct by consulting the published *Ordo* and the governing rubrical documents. Document the resolution. Some legacy bugs may be discovered in this process — these should be reported upstream.

5. **CI integration.** The snapshot suite runs on every pull request. No merge is permitted if the match rate drops below the established baseline.

**Deliverable:** A `tests/snapshots/` directory with captured expected outputs and a CI-integrated test runner.

---

### Phase 6 — Frontend

**Goal:** Build a modern, lightweight web frontend that consumes the API.

**This is the last phase, not the first.** The frontend is a pure consumer of the API. It can be built by a different team, on a different timeline, with different technology choices, without affecting the backend.

**Scope:**

1. **Technology:** A single-page application using React, Vue, or Svelte. No micro-frontends. A single codebase is appropriate for the scope of this project.

2. **Core views:**
   - **Daily Office view.** Select a date, rubrical system, and language(s). Display the composed Hour with proper typographic formatting (red rubrics, black text, differentiated psalm tones).
   - **Calendar view.** Monthly calendar grid showing feast names, ranks, and colors. Click-through to the Daily Office view.
   - **Settings.** Rubrical system selection, language preferences, display options (font size, parallel columns vs. sequential).

3. **Offline support.** Service worker caching of API responses for the current week. The deterministic nature of the API makes this straightforward.

4. **Hosting.** Static site deployment (Vercel, Netlify, Cloudflare Pages, or a simple Nginx container). No server-side rendering is needed since the API handles all data composition.

5. **Accessibility.** Semantic HTML, proper heading hierarchy, screen reader support, keyboard navigation. People pray the Office in many contexts, including with visual impairments.

**Deliverable:** A deployed web application.

---

## 6. What About a Database?

A common instinct is to migrate the texts into a database (MongoDB, PostgreSQL, etc.) early in the process. **This document recommends against that as a near-term step.** Here is the reasoning:

| Concern | Files in Git | Database |
|---|---|---|
| Editorial review (diffs, blame, PRs) | Native | Requires additional tooling |
| Provenance and audit trail | Native (git log) | Must be built |
| Queryability | Requires parser + index | Native |
| Deployment simplicity | Clone the repo | Requires a running database server |
| Cost | Zero | Non-zero (hosting, backups) |
| Community contribution | Standard GitHub workflow | Higher barrier to entry |

The correct approach is:

1. **Source of truth:** `.txt` (or migrated `.yaml`) files in the Git repository.
2. **Read-side index:** Built at application startup by the Parser. Held in memory or serialized to SQLite/JSON for faster cold starts.
3. **Future database (if needed):** If query patterns emerge that cannot be served by the in-memory index — e.g., full-text search across the entire corpus, or complex cross-referencing for a scholarly concordance tool — then a PostgreSQL instance with JSONB columns is the appropriate choice. This is a Phase 7+ decision, not a Phase 1 decision.

---

## 7. Infrastructure and Deployment

**Development:**

- Docker Compose for local development: one container for the API (with source texts mounted), one for the frontend dev server.
- The legacy Perl application runs in its own container for snapshot comparison testing.

**Production:**

- The API is a single stateless process. It can run on a $5/month VPS, a Railway or Fly.io instance, or a container on an existing server.
- The frontend is a static site. Free-tier hosting on any CDN platform.
- Edge caching (Cloudflare free tier) handles traffic spikes (e.g., Holy Week, major feasts).

**Cost estimate:** Substantially lower than the current Perl CGI hosting. A stateless API serving cached JSON is orders of magnitude cheaper to operate than a Perl application doing live filesystem parsing and HTML generation on every request.

---

## 8. Migration and Cutover

The modernization does **not** require a hard cutover. The recommended approach:

1. **Phases 1–4:** The new API runs alongside the legacy application. The legacy site continues to serve users.
2. **Phase 5:** Snapshot testing reaches >99% match rate across the full test matrix. Remaining divergences are documented and adjudicated.
3. **Phase 6:** The new frontend launches in beta, linked from the legacy site. Users can opt in.
4. **Cutover:** When the beta has been stable for a full liturgical year (covering all seasons, feasts, and edge cases), the legacy application is retired and the new frontend becomes the default.

A full liturgical year of parallel operation is not excessive. It is the minimum responsible timeline for an application people pray from daily.

---

## 9. Non-Goals

To keep scope manageable, the following are explicitly **not** in scope for this modernization:

- **New rubrical systems** (1570, Dominican, Ambrosian). The architecture should accommodate them, but implementation is deferred.
- **User accounts or personalization.** The API is read-only and stateless.
- **Chant notation or audio.** Integration with chant databases (e.g., Gregobase) is a future possibility enabled by the API architecture, but not part of this effort.
- **Mobile native apps.** The API enables them; building them is a separate project.
- **Novus Ordo support.** The project is specifically for the traditional Roman Rite. The *Novus Ordo* Liturgy of the Hours is served by other tools (e.g., iBreviary, Universalis).

---

## 10. Open Questions

1. **Source file format migration.** Should the `.txt` files be migrated to a more structured format (YAML, JSON) as part of Phase 1, or should the parser continue to consume the legacy format indefinitely? Migrating improves parseability but creates a large, noisy diff in the repository and may disrupt other contributors.

2. **Language choice.** TypeScript vs. Rust for the core libraries. TypeScript is faster to develop and has a larger contributor pool. Rust offers stronger correctness guarantees for the rubrical engine. A hybrid approach (Rust engine compiled to WASM, TypeScript API layer) is possible but adds complexity.

3. **Governance.** Who has merge authority over the rubrical engine? Changes to occurrence/concurrence logic affect liturgical correctness and should require review by someone with rubrical expertise, not just code review.

4. **Licensing.** The current project is GPL-3.0. The new packages should maintain this license. Confirm compatibility with any dependencies.

5. **Upstream relationship.** Is this modernization intended to be adopted by the existing `DivinumOfficium` organization, or developed as a parallel project? This affects repository structure, naming, and community communication.

---

## Appendix A — Representative Snapshot Test Dates

The following dates should be included in the minimum snapshot test suite. They cover the most common rubrical edge cases:

| Date | Why It Matters |
|---|---|
| March 25 (any year) | Annunciation — frequently impeded by Lent or Holy Week; translation rules differ by rubrical system |
| Variable: Ash Wednesday | Privileged feria; no feast can displace it |
| Variable: Palm Sunday through Easter Sunday | Full Holy Week sequence; 1955 reforms changed the Triduum structure |
| December 24 | Christmas Eve — privileged vigil with proper Office structure |
| December 25 | Christmas — three Masses, proper Office with octave (pre-1955) |
| January 1 | Circumcision / Octave of Christmas; concurrence with St. Sylvester |
| January 6 | Epiphany — privileged octave (pre-1955) |
| June 24 | Nativity of St. John the Baptist — I class feast with vigil |
| June 29 | Ss. Peter and Paul — I class feast with vigil and octave (pre-1955) |
| August 15 | Assumption — I class feast with vigil and octave (pre-1955) |
| November 1–2 | All Saints / All Souls — unique Office structure on Nov 2 |
| Variable: Corpus Christi | Thursday after Trinity Sunday; octave (pre-1955) |
| Variable: Ember Days | Seasonal; proper Mass and Office texts |
| Variable: Rogation Days | Monday–Wednesday before Ascension |
| Any Saturday in Ordinary Time | Votive Office of Our Lady on free Saturdays |
| February 2 | Purification — Candlemas; occurrence issues in Septuagesima |
| March 19 | St. Joseph — possible impeding by Lent; transferred feast scenarios |
| Any day with 2+ concurring feasts | Tests concurrence resolution and commemoration ordering |

This list is illustrative. The full test matrix should include every day of at least two complete liturgical years under each rubrical system.

---

## Appendix B — Glossary

| Term | Definition |
|---|---|
| **Concurrence** | When first Vespers of tomorrow's feast overlap with second Vespers of today's feast. Rules determine which prevails. |
| **Commemoration** | A brief remembrance (antiphon, versicle, oration) of an impeded feast made within the Office of the prevailing feast. |
| **Feria** | A weekday without a feast, or a weekday whose assigned feast is of insufficient rank to override the ferial Office. |
| **Occurrence** | When two feasts fall on the same calendar day. Precedence rules determine which is celebrated and which is impeded. |
| **Octave** | An eight-day liturgical celebration of a major feast. Largely suppressed in the 1955 reforms. |
| **Ordo** | The annual calendar directive published by a diocese or religious order specifying the Office and Mass for each day. |
| **Rubrics** | The rules governing the structure and performance of the liturgy. Printed in red (*ruber*) in liturgical books. |
| **Translation** | The transfer of an impeded feast to the next available day. Rules vary by rubrical system and feast rank. |
| **Suffragium** | Commemorations of saints made at Lauds and Vespers on certain ferial days outside privileged seasons. |
