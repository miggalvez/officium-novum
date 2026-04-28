# Phase 5 — Validation Strategy and Reviewer Feedback Loop

**Status:** Accepted implementation plan; implementation started
**Date:** 2026-04-28  
**Supersedes:** the short Phase 5 validation sketch in [`docs/divinum-officium-modernization-spec.md`](divinum-officium-modernization-spec.md)  
**Depends on:**

- [`docs/phase-2-rubrical-engine-design.md`](phase-2-rubrical-engine-design.md), especially §19
- [`docs/phase-3-composition-engine-design.md`](phase-3-composition-engine-design.md), especially §15
- [`docs/phase-4-API-design.md`](phase-4-API-design.md), especially §4g
- [`docs/adr/011-phase-3-divergence-adjudication.md`](adr/011-phase-3-divergence-adjudication.md)
- [`docs/adr/014-http-api-version-language-contract.md`](adr/014-http-api-version-language-contract.md)
- [`docs/adr/015-cross-stack-adjudication.md`](adr/015-cross-stack-adjudication.md)
- [`docs/rubrical-sources.md`](rubrical-sources.md)

## 1. Purpose

Phase 5 is the project-wide quality gate for Officium Novum.

Phases 1–4 prove their own layers locally: the parser proves corpus interpretation, the rubrical engine proves the day decision, the compositor proves Hour assembly, and the API proves the public JSON contract. Phase 5 ties those surfaces together, audits their authority chain, adds a cross-stack validation harness, and turns qualified reviewer feedback into permanent regression fixtures.

The goal is not bug-for-bug compatibility with legacy Perl. The goal is liturgically correct output, reproducible adjudication, and a validation loop that can survive future corpus changes, API changes, and newly implemented rubrical families.

A shipping bug in this phase means a real user may pray the wrong Office. Phase 5 exists to make that hard.

## 2. Scope

### 2.1 In scope

- Cross-stack authority hierarchy and citation rules.
- Generalized adjudication protocol across parser, rubrical engine, compositor, and API.
- Citation audit for existing fixtures, goldens, divergence ledgers, and adjudication sidecars.
- End-to-end validation of the Parser → Rubrical Engine → Compositor → API pipeline.
- Reviewer feedback intake, triage, schema validation, privacy handling, fixture promotion, and public report indexing.
- CI gate consolidation.
- Multi-year validation expansion beyond the 2024 baseline.
- Sign-off criteria for declaring Phase 5 complete.

### 2.2 Out of scope

- Replacing per-package validation strategies.
- Phase 6 frontend acceptance testing.
- Performance and load testing, except where needed to keep validation practical.
- Pastoral judgment, devotional customization, or local custom unless represented by an explicit supported `VersionHandle` or future policy.
- Translation quality grading.
- Implementing non-Roman policy families; Phase 5 defines the validation framework they must later satisfy.

## 3. Current project baseline

Phase 5 begins from the following baseline:

- Phase 1 parser is complete.
- Phase 2 rubrical engine is complete for the implemented Roman policy families: Divino Afflatu, Reduced 1955, and Rubrics 1960.
- Non-Roman families are deferred by design and should remain explicit unsupported-policy cases until separately implemented.
- Phase 3 compositor is complete for the current Roman scope and already includes:
  - 2024 × 3 policies × 366 days × 8 Hours no-throw coverage.
  - 312 Appendix-A snapshot goldens.
  - Live Perl comparison ledgers.
  - `adjudications.json` sidecar adjudication per ADR-011.
  - 0 unadjudicated compositor rows for the 2024 Roman policy baseline.
- Phase 4 API is complete for the read-only Breviary JSON scope and already includes:
  - `/api/v1/status`
  - `/api/v1/versions`
  - `/api/v1/languages`
  - `GET /api/v1/office/{date}/{hour}`
  - `GET /api/v1/days/{date}`
  - `GET /api/v1/calendar/{year}/{month}`
  - canonical `version` handling, `rubrics` aliases, public `la`/`en` language mapping, `orthography=source|version`, deterministic cache headers, ETags, and API contract tests.

Phase 5 should not duplicate this work. It should harden, audit, and connect it.

## 4. Architectural position

```text
                    Reviewer feedback
          priests, religious, scholars, trained validators
                              │
                              ▼
             Cross-stack E2E validation harness
        Parser → Rubrical Engine → Compositor → API
                              │
                              ▼
        Per-package goldens, ledgers, sidecars, snapshots
                              │
                              ▼
                 Per-module unit and integration tests
```

Each layer has a different job.

- Unit tests catch local algorithm and type-contract mistakes cheaply.
- Package goldens and divergence ledgers catch layer-specific regressions at scale.
- Cross-stack E2E tests catch integration seams and public-consumer regressions.
- Reviewer feedback catches errors that require rubrical judgment, source interpretation, or human expertise.

Reviewer feedback is evidence. It is not itself an authority. A reviewer report becomes actionable only after it is reproduced and adjudicated against the authority hierarchy below, or after it is recorded as a formal expert consultation for an otherwise ambiguous case.

## 5. Authority hierarchy

Phase 5 preserves the core Phase 2 and ADR-011 principle: legacy Perl is a comparison target, not an oracle. It also clarifies the cross-stack hierarchy so published breviaries and dispositive corpus lines are handled consistently.

Adjudication authority is ordered as follows:

1. **Published Ordo Recitandi** for the relevant year, community, and calendar scope.
2. **Governing rubrical books**, including the rubrical sources indexed in [`docs/rubrical-sources.md`](rubrical-sources.md).
3. **Published breviaries and dispositive source corpus lines**, when they directly attest the text, feast structure, or file-level source fact being disputed.
4. **In-repo ADRs or recorded expert consultations**, only for cases where the preceding sources are genuinely ambiguous or incomplete.
5. **Legacy Perl output**, as a comparison artifact only.

No divergence may be resolved by “matching Perl” alone. Every accepted adjudication must carry a citation. A citation may point to an Ordo edition and page, a rubrical book paragraph, a published breviary reference, a corpus `.txt` path and line, an in-repo ADR, or a reviewer report ID that itself records a formal consultation.

### 5.1 Relationship to Phase 2 §19.1

Phase 2 §19.1 lists published breviaries after legacy Perl as cross-check sources. Phase 5 refines that order for cross-stack adjudication: a published breviary or source corpus line outranks Perl when it is directly dispositive for the disputed text or structure.

This is not a reversal of Phase 2. It is a clarification of the same rule: cite the governing source; do not canonize the comparison harness.

## 6. Validation responsibilities by layer

| Layer | What its tests must prove | Primary authority | Phase 5 action |
|---|---|---|---|
| `parser` | Legacy `.txt` files parse losslessly; section headers, directives, language blocks, references, and line identities are stable. | File-format specification and corpus content. | Audit fixtures for citation/source-path traceability. |
| `rubrical-engine` | `resolveDayOfficeSummary` chooses the correct celebration, rank, commemoration set, transfer, concurrence, and Hour structure. | Ordo Recitandi and rubrical books. | Ensure divergence sidecars and Ordo snapshots use Phase 5 citation schema. |
| `compositor` | `composeHour` emits the correct structure and text runs for the resolved day, including psalmody, lessons, commemorations, antiphons, directives, and warnings. | Resolved corpus, rubrical books, published breviaries, and adjudicated Ordo cases. | Preserve 2024 zero-unadjudicated baseline; expand sidecar schema as needed. |
| `api` | DTO shape, public language tags, version normalization, error model, cache headers, ETags, and serialization boundaries remain stable. | Phase 4 API design and ADR-014. | Keep API contract gate; integrate a small consumer-facing E2E matrix. |
| Cross-stack | A real client hitting the API receives liturgically correct, source-backed, stable output. | All of the above. | Add Phase 5 E2E harness and reviewer-report fixture lifecycle. |

## 7. Coverage model

Phase 5 uses five coverage tiers.

### Tier 0 — Per-module tests

Owned by each package. These remain in `packages/*/test/` and continue to run under `pnpm -r test`.

Phase 5 does not replace these tests.

### Tier 1 — Full sweep, no-throw

CI-gated. Runs the broadest practical composition matrix and asserts that no supported Roman policy/date/hour combination throws.

Current baseline:

```text
2024 × 3 Roman policies × 366 days × 8 Hours = 8,784 compositions
```

This tier proves mechanical robustness. It does not prove content correctness.

### Tier 2 — Content goldens and package snapshots

CI-gated. Includes package-owned content assertions:

- Compositor Appendix-A snapshots:

```text
13 canonical dates × 3 policies × 8 Hours = 312 snapshots
```

- Rubrical-engine Ordo snapshots and divergence ledgers.
- API contract matrix from Phase 4 §4g.

Goldens are regenerated only in commits that intentionally change the expected output. Intended diffs must be explained in the commit message, changelog, or adjoining adjudication entry.

### Tier 3 — Cross-stack E2E snapshots

CI-gated once stable. Small by design.

This tier exercises the public path a consumer actually uses:

```text
Parser → Rubrical Engine → Compositor → API route → public JSON response
```

The Phase 5 E2E matrix should not duplicate the full API contract gate. Its job is to catch integration seams and externally visible regressions.

Recommended initial E2E matrix:

```text
3 policies × 3 dates × 3 Hours × 2 language modes
```

Where:

- policies are the canonical Roman baseline handles for Divino Afflatu, Reduced 1955, and Rubrics 1960;
- dates include one ordinary date, one high-rubrical-complexity date, and one transferred/commemoration-heavy date;
- Hours include `matins`, `lauds`, and `vespers`;
- language modes include `lang=la` and `lang=la,en`.

Assertions should include:

- HTTP status.
- Public DTO shape.
- canonical `VersionHandle` in metadata.
- public language tags, not corpus language names.
- cache headers and deterministic ETag behavior.
- material content anchors for celebration title, rank/class, Hour name, at least one psalm/lesson/antiphon anchor where appropriate, and warnings shape.
- no serialization of live policy objects.

### Tier 4 — Multi-year expansion

Promoted gradually from informational to gated.

Suggested years:

- 2023 — recent non-leap baseline.
- 2025 — ordinary-year regression set after the 2024 leap-year baseline.
- 2026 — current/future-facing year for newly reported reviewer cases.

Promotion states:

```text
exploratory → candidate → gated
```

Rules:

- Exploratory years may have unadjudicated rows and are not blocking.
- Candidate years may block only on no-throw failures and schema failures.
- Gated years must reach the same standard as the baseline year: 0 unadjudicated rows for the packages and policies included in the gate set.

### Tier 5 — Reviewer-submitted fixtures

CI-gated after acceptance and fixture landing.

A reviewer report is not a test until it is:

1. received through an approved intake channel;
2. reduced to a reproducible request;
3. adjudicated against the authority hierarchy;
4. classified;
5. converted into a package-owned fixture or E2E assertion;
6. indexed publicly by report ID.

## 8. Artifact inventory

Recommended Phase 5 artifact locations:

```text
.github/
  ISSUE_TEMPLATE/
    reviewer-report.yml

docs/
  phase-5-validation-strategy-reviewer-feedback-loop.md
  REVIEWER_REPORTS.md
  adr/
    015-cross-stack-adjudication.md

packages/
  parser/
    test/
      ...existing parser tests...

  rubrical-engine/
    test/
      divergence/
        adjudications.json
      ordo/
        ...Ordo snapshots...

  compositor/
    test/
      __goldens__/
        ...Appendix-A snapshots...
      divergence/
        adjudications.json
        ADJUDICATION_LOG.md

  api/
    test/
      ...Phase 4 contract tests...

  validation/
    package.json
    vitest.config.ts
    src/
      schemas/
        reviewer-report.schema.ts
        adjudication.schema.ts
        citation.schema.ts
      audit-citations.ts
      audit-reviewer-privacy.ts
    test/
      e2e/
        office-route.e2e.test.ts
        snapshots/
      reviewer-reports/
        accepted/
        rejected/
        fixtures/
```

The current workspace includes `packages/*`, so a `packages/validation` private package is preferable to a root-level `tests/e2e` directory unless `pnpm-workspace.yaml` is expanded. This keeps Phase 5 checks inside `pnpm -r test` without special casing.

Private reviewer contact details must not live in the public fixture tree.

## 9. Generalized adjudication protocol

ADR-011 solves compositor divergence adjudication with a hand-maintained sidecar keyed by stable row identity. Phase 5 generalizes that protocol across all packages.

ADR-015 formalizes:

- the cross-stack authority hierarchy;
- sidecar schema requirements;
- citation requirements;
- classification taxonomy;
- privacy rules for reviewer-derived fixtures;
- CI behavior for adjudicated and unadjudicated rows;
- when an ADR is required instead of a sidecar-only entry.

### 9.1 Classification taxonomy

ADR-011’s compositor-specific taxonomy is retained but broadened.

Every adjudicated row or accepted reviewer report must carry exactly one classification:

| Classification | Meaning | Fixture action |
|---|---|---|
| `parser-bug` | Corpus parsing, reference resolution, section identity, or language-block handling is wrong. | Parser regression fixture. |
| `engine-bug` | The rubrical decision is wrong: celebration, commemoration, transfer, concurrence, rank, color, or Hour structure. | Rubrical-engine Ordo/edge-case fixture. |
| `compositor-bug` | The day decision is right, but Hour composition emits wrong text, structure, order, directive, warning, or slot expansion. | Compositor golden or targeted regression fixture. |
| `api-bug` | Public request handling, DTO shape, language mapping, cache behavior, error model, or serialization is wrong. | API contract or E2E fixture. |
| `corpus-bug` | The source `.txt` corpus itself contains an error or inconsistency. | Corpus patch or upstream issue, plus regression fixture. |
| `perl-bug` | Officium Novum matches the primary source; legacy Perl disagrees. | Track in `docs/upstream-issues.md`; no code change unless needed to preserve correct behavior. |
| `ordo-ambiguous` | Ordo and governing books do not decide the case clearly. | ADR or recorded expert consultation. |
| `source-ambiguous` | Corpus/breviary witnesses conflict or are incomplete. | ADR or source-note fixture; avoid silent normalization. |
| `rendering-difference` | Surface-only difference with no liturgical effect. | Normalize if useful; otherwise sidecar classification. Use sparingly. |
| `report-invalid` | Reviewer report is malformed, unsupported, not reproducible, or contrary to the cited source. | Close report; no fixture unless needed to protect against future confusion. |
| `duplicate` | Same issue as an earlier report or ledger row. | Link to canonical report ID or row key. |

### 9.2 Sidecar schema

Each package may keep its own sidecar, but the schema shape should be shared.

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "key": "<stable row key>",
      "package": "compositor",
      "classification": "perl-bug",
      "status": "adjudicated",
      "citation": {
        "sourceType": "ordo",
        "sourceId": "fssp-ordo-2024",
        "edition": "2024",
        "publisher": "FSSP",
        "page": 47,
        "section": null,
        "paragraph": null,
        "corpusPath": null,
        "lineStart": null,
        "lineEnd": null,
        "adr": null,
        "reportId": null,
        "archiveRef": null,
        "excerptPolicy": "brief-public-excerpt"
      },
      "summary": "Legacy Perl omits the commemoration, but the Ordo lists it for this date.",
      "notes": "Keep the summary short; put long reasoning in an ADR.",
      "createdAt": "2026-04-28",
      "updatedAt": "2026-04-28"
    }
  ]
}
```

### 9.3 Citation rules

Accepted adjudications require a structured citation object.

```yaml
citation:
  sourceType: ordo | rubrical-book | breviary | corpus | adr | consultation | reviewer-report | none
  sourceId: fssp-ordo-2024
  edition: 2024
  publisher: FSSP
  page: 47
  section: null
  paragraph: null
  corpusPath: null
  lineStart: null
  lineEnd: null
  adr: null
  reportId: null
  archiveRef: null
  checksum: null
  excerptPolicy: none | brief-public-excerpt | private-only
```

Rules:

- `engine-bug`, `compositor-bug`, `api-bug`, `parser-bug`, `corpus-bug`, `perl-bug`, `ordo-ambiguous`, and `source-ambiguous` require a non-`none` citation.
- `rendering-difference` may cite the normalizer code, an ADR, or the corpus line establishing the retained form.
- `report-invalid` must cite either the current implementation evidence, the source that contradicts the report, or the reason it was not reproducible.
- Copyrighted sources should be referenced by edition/page/paragraph. Public excerpts must be brief and optional. Long excerpts belong in private notes, not the public repo.

## 10. Reviewer feedback loop

Reviewer feedback is the genuinely new Phase 5 surface. It gives clergy, religious, scholars, and trained lay validators a way to turn lived use into test fixtures.

### 10.1 Reviewer audience

Intended reviewers:

- clergy and religious who pray the Office daily;
- liturgical scholars;
- maintainers of Ordo or breviary resources;
- trained lay validators with demonstrable rubrical competence.

Reviewer qualifications help triage reports. They do not override the authority hierarchy.

### 10.2 Intake channels

Use three channels, introduced in order of implementation complexity.

#### Channel 1 — Email

Lowest-friction intake.

- Dedicated address, for example `reports@...`.
- Maintainer transcribes the report into the public schema.
- Private identity/contact details remain outside the public repo.
- Best for clergy and religious who do not use GitHub.

The transcription procedure, public report ID format, and private-data storage
rule live in [`docs/REVIEWER_REPORTS.md`](REVIEWER_REPORTS.md).

#### Channel 2 — GitHub issue template

Structured intake for technical users.

Recommended file:

```text
.github/ISSUE_TEMPLATE/reviewer-report.yml
```

The issue template should collect request metadata, expected output, actual output, citation, and calendar scope. It should warn users not to include private personal details unless they want them public.

The Phase 5 intake template is [`../.github/ISSUE_TEMPLATE/reviewer-report.yml`](../.github/ISSUE_TEMPLATE/reviewer-report.yml).

#### Channel 3 — Hosted demo “Report this” button

Deferred until the hosted demo exists.

The button should capture the exact request and build provenance automatically, then ask the reporter only for the disagreement, expected behavior, citation, and optional contact.

Do not collect IP fingerprints in v1. Use bot protection or rate limiting if abuse appears. The validation benefit of fingerprinting is low; the privacy cost is not.

### 10.3 Public report schema

Public reviewer reports are safe to commit.

```yaml
schemaVersion: 1
id: rr-2026-0001
submittedAt: 2026-04-28T14:30:00-05:00
submittedVia: email | github-issue | demo-button | maintainer
reviewer:
  reviewerKind: clergy | religious | scholar | trained-lay | maintainer | anonymous
  attribution: anonymous | public-name-opt-in
  publicName: null
context:
  calendarScope: universal-roman | local | institute | unknown
  locality: null
  communityOrUse: null
  ordoFamily: rubrics-1960 | reduced-1955 | divino-afflatu | unknown
request:
  date: 2026-04-28
  version: Rubrics 1960 - 1960
  hour: lauds
  languages:
    - la
    - en
  langfb: null
  orthography: version
  strict: false
  apiVersion: v1
  apiPath: /api/v1/office/2026-04-28/lauds?version=Rubrics%201960%20-%201960&lang=la,en&orthography=version
  appBuildSha: null
  apiBuildSha: null
  upstreamSha: null
output:
  permalink: null
  apiResponseFixture: null
  excerpt: null
disagreement:
  scope: feast | commemoration | psalter | lesson | antiphon | hymn | versicle | rubric | color | dto | cache | other
  expected: ""
  actual: ""
citation:
  sourceType: ordo | rubrical-book | breviary | corpus | adr | consultation | reviewer-report | none
  sourceId: null
  edition: null
  publisher: null
  page: null
  section: null
  paragraph: null
  corpusPath: null
  lineStart: null
  lineEnd: null
  adr: null
  reportId: null
  archiveRef: null
  checksum: null
  excerptPolicy: none
triage:
  status: submitted
  resolution: null
  classification: null
  fixtureStatus: none
  ownerPackage: null
  duplicateOf: null
  decidedBy: null
  decidedAt: null
  publicSummary: ""
notes: ""
```

### 10.4 Private reviewer data schema

Private reviewer data must not be committed to the public repository.

Store it in a private tracker, encrypted notes, or a separate private reports repository.

```yaml
reportId: rr-2026-0001
name: null
contact: null
affiliation: null
qualification: null
consentToAttribution: false
consentToFollowUp: true
privateNotes: ""
```

Public artifacts may refer to the report by ID. They must not expose contact details, affiliation, or qualification unless the reviewer explicitly opts in.

### 10.5 Triage state model

Keep workflow state, resolution, classification, and fixture state separate.

```yaml
triage:
  status: submitted | triaged | reproducing | adjudicating | implemented | closed
  resolution: accepted | rejected | duplicate | not-reproducible | external-consultation-needed | out-of-scope | null
  classification: parser-bug | engine-bug | compositor-bug | api-bug | corpus-bug | perl-bug | ordo-ambiguous | source-ambiguous | rendering-difference | report-invalid | duplicate | null
  fixtureStatus: none | pending | landed
  ownerPackage: parser | rubrical-engine | compositor | api | validation | docs | upstream | null
  duplicateOf: rr-2026-0000 | null
  decidedBy: null
  decidedAt: null
```

### 10.6 Triage workflow

```text
submitted
  │
  ▼
triaged
  │
  ├─► rejected / duplicate / out-of-scope / not-reproducible
  │
  ▼
reproducing
  │
  ▼
adjudicating
  │
  ├─► external-consultation-needed
  │
  ├─► accepted + fixture pending
  │
  └─► rejected with citation
  │
  ▼
implemented
  │
  ▼
closed
```

A report is accepted only when:

- the request is reproducible;
- the disagreement is specific enough to test;
- the cited source supports the reviewer, or an ADR/consultation resolves the ambiguity in the reviewer’s favor;
- the owning package is identified;
- a fixture or ledger entry can be added.

A report is rejected when:

- it is not reproducible;
- it applies to a local calendar or community not represented by the selected `VersionHandle`;
- it contradicts the cited source;
- it asks for pastoral customization rather than a rubrical correction;
- it is a translation-style concern outside Phase 5 scope;
- it lacks enough information after reasonable maintainer reconstruction.

Rejections should still be answered with a citation or precise reason. A terse but sourced rejection is better than a polite fog machine.

### 10.7 Fixture lifecycle

Accepted reports become fixtures in the owning layer.

| Report type | Owning layer | Fixture target |
|---|---|---|
| Wrong feast, rank, transfer, concurrence, commemoration, or color. | `rubrical-engine` | Ordo snapshot, edge-case test, or divergence sidecar entry. |
| Correct day but wrong Hour structure or text. | `compositor` | Golden snapshot or targeted regression test. |
| Public JSON shape, language tags, cache, ETag, or error issue. | `api` | Contract test. |
| Full consumer-visible bug spanning packages. | `validation` | E2E snapshot plus package-owned regression. |
| Bad corpus content. | Corpus/upstream tracking | Corpus patch if local; `docs/upstream-issues.md` if upstream. |

Fixture commits must reference the report ID.

Example commit footer:

```text
Reviewer-Report: rr-2026-0001
Adjudication: engine-bug
Citation: FSSP Ordo 2026, p. 47
```

### 10.8 Public report index

Add an append-only public index:

```text
docs/REVIEWER_REPORTS.md
```

Minimum columns:

| Report ID | Date received | Status | Resolution | Classification | Owner | Public summary | Fixture |
|---|---:|---|---|---|---|---|---|

Include accepted, rejected, duplicate, and out-of-scope reports, but keep rejected entries minimal. Do not publish private details or long source excerpts.

`docs/REVIEWER_REPORTS.md` also records the maintainer procedure for assigning
`rr-YYYY-NNNN` IDs and transcribing email reports safely.

Recommended rejected categories:

- `not-reproducible`
- `local-calendar-mismatch`
- `citation-supports-current-output`
- `duplicate`
- `out-of-scope`
- `insufficient-information`

## 11. Cross-stack E2E harness implementation

### 11.1 Package location

Create a private package:

```text
packages/validation/
```

Rationale: `pnpm-workspace.yaml` currently includes `packages/*`, so placing the harness in `packages/validation` makes `pnpm -r test` and `pnpm -r typecheck` include it automatically.

### 11.2 Test strategy

The E2E harness should instantiate the API app in-process rather than launching a network server. The test should hit the same route handler path and DTO adapters as a real HTTP request.

Recommended pattern:

```text
build test resources
  → create API app
  → inject GET /api/v1/office/{date}/{hour}?version=...&lang=...
  → assert status, headers, DTO shape, and content anchors
  → compare stable snapshot where useful
```

### 11.3 Matrix

Initial matrix:

```yaml
policies:
  - Divino Afflatu - 1954
  - Reduced - 1955
  - Rubrics 1960 - 1960

dates:
  - 2024-01-01   # fixed high-ranking feast baseline
  - 2024-03-19   # St. Joseph / Lent / transfer-sensitive family
  - 2024-03-31   # Easter 2024

hours:
  - matins
  - lauds
  - vespers

languageModes:
  - lang=la
  - lang=la,en
```

The exact dates may be replaced with Appendix-A dates if those are already canonicalized elsewhere. Keep the matrix small enough that a snapshot diff remains reviewable.

### 11.4 Snapshot policy

Use snapshots for stable public DTO fragments, not for every line of every Hour.

Prefer assertion anchors such as:

```yaml
expected:
  status: 200
  version.handle: Rubrics 1960 - 1960
  request.hour: lauds
  languages:
    - la
    - en
  celebration.titleIncludes: Pascha
  hasCacheControl: true
  hasEtag: true
  disallowKeys:
    - Latin
    - English
    - policy
```

Only snapshot full JSON when the response is short or when the test intentionally protects a specific public contract.

## 12. Citation audit implementation

Add a validation script in `packages/validation`:

```text
packages/validation/src/audit-citations.ts
```

The audit should scan:

- package adjudication sidecars;
- divergence ledgers where classification is rendered;
- reviewer report fixtures;
- E2E snapshot manifests;
- any golden manifest introduced by Phase 5.

The current Phase 5d audit record and migration backlog live in
[`docs/phase-5-citation-audit.md`](phase-5-citation-audit.md).

Rules:

1. Every adjudicated divergence has a classification.
2. Every non-`report-invalid` accepted item has a non-empty citation.
3. Every citation uses a recognized `sourceType`.
4. Ordo citations include edition/year and page or equivalent locator.
5. Corpus citations include path and line range when the corpus is dispositive.
6. ADR citations point to an existing ADR file.
7. Reviewer-report citations point to an existing public report ID.
8. Public reviewer fixtures contain no private contact fields.

Suggested commands:

```json
{
  "scripts": {
    "test": "vitest run && pnpm run audit:citations && pnpm run audit:reviewer-privacy",
    "typecheck": "tsc --noEmit",
    "audit:citations": "tsx src/audit-citations.ts",
    "audit:reviewer-privacy": "tsx src/audit-reviewer-privacy.ts"
  }
}
```

## 13. CI gates and informational signals

The maintained CI command mapping is recorded in
[`docs/CI_GATES.md`](CI_GATES.md). The required workflow is
`.github/workflows/ci.yml`.

| Signal | Command or owner | Gate | Threshold |
|---|---|---:|---|
| Workspace typecheck | `pnpm -r typecheck` | Block | Must pass. |
| Workspace tests | `pnpm -r test` | Block | Must pass. |
| Phase 3 no-throw sweep | `pnpm -r test` via compositor package | Block | 0 exceptions for gate-set years. |
| Phase 3 goldens | `pnpm -r test` via compositor package | Block | 0 unintended diffs. |
| Phase 4 API contract tests | `pnpm -r test` via API package | Block | Must pass. |
| Phase 5 E2E harness | `pnpm -r test` via validation package | Block | Must pass. |
| Citation audit | `pnpm -r test` via validation package | Block | 0 missing required citations. |
| Reviewer privacy audit | `pnpm -r test` via validation package | Block | 0 public private-field leaks. |
| Reviewer report audit | `pnpm -r test` via validation package | Block | 0 schema or fixture errors. |
| 2024 Roman compositor sign-off | `pnpm -C packages/compositor verify:phase-3-signoff` | Block | 0 unadjudicated rows, <800 lines per source file, and no pending SHAs. |
| Newly added candidate years | divergence sidecars | Transitional block | <10 unadjudicated rows per policy per year during promotion window. |
| Promoted gate-set years | divergence sidecars | Block | 0 unadjudicated rows. |
| Multi-year exploratory/candidate coverage | `pnpm -r test` via validation package | Informational until gated | Tracked in `packages/validation/fixtures/multi-year/phase-5-years.json`. |
| Reviewer report triage SLO | `docs/REVIEWER_REPORTS.md` / dashboard | Informational | Target: triaged within 14 days. |
| Upstream Perl issue filing | `docs/upstream-issues.md` | Informational | Tracked, not blocking. |

The `<10` threshold is only a promotion-window allowance for newly added years. It must not lower the already-burned-down 2024 baseline.

## 14. Multi-year expansion plan

### 14.1 Year selection

Start with years that add meaningful rubrical variation without exploding the validation surface.

Recommended order:

1. **2025** — ordinary-year follow-up after the 2024 leap-year baseline.
2. **2023** — recent prior ordinary year useful for regression comparison.
3. **2026** — live/current year for reviewer reports and hosted-demo validation.

### 14.2 Promotion workflow

```text
exploratory
  - generated locally or in scheduled CI
  - failures do not block PRs
  - useful for trend visibility

candidate
  - included in normal CI
  - blocks on no-throw failures and schema errors
  - allows <10 unadjudicated rows per policy per year

gated
  - included in normal CI
  - requires 0 unadjudicated rows
  - unintended diffs block merge
```

The current multi-year dashboard and 2025 candidate promotion record live in
[`docs/phase-5-multi-year-status.md`](phase-5-multi-year-status.md).

### 14.3 Storage policy

- Commit small JSON/Markdown ledgers directly.
- Prefer normalized compact JSON over giant pretty snapshots for year-scale data.
- Use compression only if repository size becomes a measurable problem.
- Use Git LFS only as a last resort.
- Preserve human-readable summaries even if raw details are compressed.

## 15. Sub-phase implementation plan

### 5a — Phase 5 design and ADR-015

Deliverables:

- `docs/phase-5-validation-strategy-reviewer-feedback-loop.md`
- `docs/adr/015-cross-stack-adjudication.md`

ADR-015 decides:

- authority hierarchy;
- generalized sidecar schema;
- classification taxonomy;
- citation object;
- reviewer report privacy rule;
- package ownership rules;
- CI thresholds for baseline, candidate, and gated years.

Acceptance criteria:

- ADR-015 is accepted.
- Phase 2/3/4 docs remain authoritative for their package-local validation strategies.
- The README status inconsistency around Phase 5/Phase 6 is corrected if still present.

### 5b — Shared schemas and validation package scaffold

Deliverables:

- `packages/validation/package.json`
- shared TypeScript schemas for citation, adjudication sidecar entries, and reviewer reports;
- schema tests;
- citation audit script;
- reviewer privacy audit script.
- reviewer report fixture audit script.

Acceptance criteria:

- `pnpm -r typecheck` includes `packages/validation`.
- `pnpm -r test` includes `packages/validation`.
- Existing adjudication sidecars either validate or have a documented migration task.

### 5c — Reviewer intake v1

Deliverables:

- `.github/ISSUE_TEMPLATE/reviewer-report.yml`
- email-transcription procedure in `docs/REVIEWER_REPORTS.md`;
- public report ID format;
- private reviewer-data storage decision;
- `docs/REVIEWER_REPORTS.md` initial skeleton.
- reviewer report fixture audit wired into `packages/validation`.

Acceptance criteria:

- A maintainer can create a public report without exposing private contact information.
- The issue template captures enough metadata to reproduce the request.
- Public reports validate against the schema.

### 5d — Cross-stack authority audit

Deliverables:

- citation audit applied to existing sidecars and ledgers;
- missing-citation backlog;
- migration of existing adjudication entries to the Phase 5 citation object where practical.

Acceptance criteria:

- Existing 2024 baseline entries either pass the citation audit or have explicit migration exceptions.
- No accepted adjudication lacks a source locator.
- Corpus-line citations include path and line range where the corpus itself is dispositive.

### 5e — End-to-end snapshot harness

Deliverables:

- in-process API E2E tests in `packages/validation`;
- small cross-stack matrix;
- public DTO anchor assertions;
- stable snapshots where useful.

Acceptance criteria:

- The harness exercises real parser/engine/compositor/API integration.
- It does not duplicate the full Phase 4 API contract matrix.
- It blocks on public DTO regressions and material content anchor regressions.

### 5f — CI gate consolidation

Deliverables:

- consolidated CI gate table matched to actual package scripts;
- `pnpm -r test` and `pnpm -r typecheck` as the top-level required checks;
- validation package audit scripts wired into its `test` script;
- documentation for candidate vs gated multi-year thresholds.

Acceptance criteria:

- The documented gates match the commands CI actually runs.
- The 2024 Roman baseline remains at 0 unadjudicated rows.
- Candidate-year exceptions cannot silently become permanent.

### 5g — Multi-year expansion

Deliverables:

- one additional year promoted to candidate or gated status;
- ledger/adjudication sidecar entries for the new year;
- dashboard or summary output showing unadjudicated counts by policy/year.

Acceptance criteria:

- At least one non-2024 year is in the gate set or candidate set.
- Transfer-sensitive cases are represented.
- Newly added years have explicit promotion status.

### 5h — Reviewer pilot and sign-off

Deliverables:

- at least one real or maintainer-seeded reviewer report processed end-to-end;
- resulting fixture landed;
- public report index updated;
- Phase 5 sign-off checklist completed.

Acceptance criteria:

- One report flows through: submitted → triaged → adjudicated → fixture landed → public index updated.
- The fixture is owned by the correct package.
- The report ID appears in the commit or fixture metadata.

The Phase 5h sign-off record lives in
[`docs/phase-5-signoff.md`](phase-5-signoff.md), and the pilot report is
`rr-2026-0001`.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Reviewer triage bottleneck. | Structured intake, citation requirement, report categories, public index, and clear rejection rules. |
| Reviewer reports become de facto authorities. | State explicitly that reports are evidence; sources and adjudication decide. |
| Privacy leakage. | Split public report schema from private reviewer data; add privacy audit. |
| Citation drift as Ordo editions change. | Cite edition/year/page; archive only where licensing permits; store checksums for local private copies when useful. |
| Adversarial or non-mainstream reports. | Require citations; distinguish universal Roman, local, institute, and unknown calendar scope. |
| E2E harness becomes brittle. | Keep matrix small; use content anchors rather than full-response snapshots where possible. |
| Multi-year validation balloons. | Use promotion states; keep exploratory years informational until burned down. |
| API contract and E2E tests duplicate each other. | API package owns full contract behavior; Phase 5 E2E owns cross-stack consumer path. |
| Copyright exposure. | Public artifacts use source locators and brief excerpts only; long excerpts stay private or are omitted. |
| Non-Roman policy confusion. | Phase 5 defines the framework only; non-Roman families get their own source index, reviewer pool, and gate when implemented. |

## 17. Open questions and recommended defaults

### 17.1 Same repo or separate reports repo?

Recommended default: same repo for public, redacted report fixtures and `docs/REVIEWER_REPORTS.md`; separate private storage for contact details.

Reason: tests belong near the code they protect. Private data does not.

### 17.2 Should the demo collect IP or fingerprint data?

Recommended default: no.

Capture exact request/build metadata instead. Add bot protection only if abuse requires it.

### 17.3 Should rejected reports be public?

Recommended default: publish a minimal rejected-report index by ID and reason category, not full rejected report bodies.

This preserves accountability without publicly embarrassing mistaken reporters or leaking private context.

### 17.4 Does Phase 5 own upstream bug filing?

Recommended default: Phase 5 owns detection, classification, and tracking. Actual upstream filing remains a maintainer workflow tracked in [`docs/upstream-issues.md`](upstream-issues.md).

### 17.5 Are non-Roman policies covered?

Recommended default: covered by the framework, not by the Roman Phase 5 sign-off gate.

When Tridentine, Monastic, Cistercian, or Dominican policies are implemented, each family must receive:

- its own authority hierarchy details;
- source index;
- Ordo or equivalent validation strategy;
- reviewer pool assumptions;
- promotion threshold.

## 18. Success criteria

Phase 5 is complete when all of the following are true:

1. `docs/phase-5-validation-strategy-reviewer-feedback-loop.md` is merged.
2. ADR-015 generalizing ADR-011 across packages is accepted.
3. Reviewer feedback schema, intake, triage, privacy handling, and public index are operational.
4. At least one reviewer-submitted or maintainer-seeded report flows end-to-end:

```text
submitted → triaged → adjudicated → fixture landed → public index updated
```

5. `packages/validation` exists and is included in `pnpm -r typecheck` and `pnpm -r test`.
6. Cross-stack E2E harness is CI-gated.
7. Citation audit passes for gate-set adjudication artifacts.
8. Reviewer privacy audit passes.
9. Each Roman policy reports 0 unadjudicated rows for the 2024 baseline in compositor and engine ledgers.
10. At least one additional year is promoted to candidate or gated status with documented thresholds.
11. The CI gate table in this document matches actual scripts.
12. README phase numbering is consistent: Phase 5 is validation; Phase 6 is frontend.

## 19. Suggested initial PR sequence

1. **PR 1:** Add Phase 5 doc and ADR-015.
2. **PR 2:** Add `packages/validation` scaffold and schemas.
3. **PR 3:** Add citation audit and migrate existing sidecars enough to pass or report known exceptions.
4. **PR 4:** Add reviewer issue template and `docs/REVIEWER_REPORTS.md`.
5. **PR 5:** Add E2E harness and initial small matrix.
6. **PR 6:** Consolidate CI gates and document exact commands.
7. **PR 7:** Add first reviewer-report fixture.
8. **PR 8:** Promote first additional year to candidate or gated status.

This sequence keeps every PR reviewable and avoids turning Phase 5 into one grand liturgical thunderclap.
