# Reviewer Reports

This is the public index for Phase 5 reviewer reports.

Reviewer feedback is evidence, not an authority by itself. Reports become
actionable only after they are reproduced and adjudicated against the Phase 5
authority hierarchy in ADR-015:

1. Published Ordo Recitandi for the relevant year, community, and calendar
   scope.
2. Governing rubrical books.
3. Published breviaries and dispositive source corpus lines.
4. In-repo ADRs or recorded expert consultations for genuinely ambiguous cases.
5. Legacy Perl output as a comparison artifact only.

Do not publish private reviewer identity, contact, affiliation, or qualification
details here unless the reviewer explicitly opted into public attribution.

## Report ID Format

Use this stable public ID format:

```text
rr-YYYY-NNNN
```

- `YYYY` is the calendar year in which the report was received.
- `NNNN` is a zero-padded sequence number assigned by maintainers.
- IDs are never reused, even if a report is later rejected or closed as a
  duplicate.

Example:

```text
rr-2026-0001
```

## Intake Channels

### GitHub Issue Template

Use `.github/ISSUE_TEMPLATE/reviewer-report.yml` for public GitHub intake. It
collects the request metadata, calendar scope, disagreement, citation locator,
and privacy confirmation needed to reproduce the case.

When transcribing a GitHub issue into a public fixture:

1. Assign the next `rr-YYYY-NNNN` report ID.
2. Convert the issue fields into the public reviewer-report schema.
3. Preserve request metadata exactly, including `version`, `hour`, `languages`,
   `orthography`, `strict`, API path, and build SHAs when supplied.
4. Keep source excerpts brief and prefer source locators.
5. Add or update the index row below.

### Email Transcription

Email is the lowest-friction channel for clergy, religious, scholars, and
validators who do not use GitHub.

When transcribing an email report:

1. Assign the next `rr-YYYY-NNNN` report ID.
2. Copy only public-safe report data into the public schema.
3. Store private identity, contact, affiliation, qualification, follow-up
   consent, and long private notes outside the public repository.
4. Record `submittedVia: email`.
5. Set `reviewer.reviewerKind` from the report if clear; otherwise use
   `anonymous`.
6. Set `reviewer.attribution: anonymous` unless the reviewer explicitly opted
   into public-name attribution.
7. Reconstruct the request metadata from the report or follow up privately when
   date, version, hour, language, or source locator is missing.
8. Add a short public summary to the index row.

Private reviewer data may be kept in a private tracker, encrypted notes, or a
separate private reports repository. It must not be committed here.

### Hosted Demo

The hosted demo report button is deferred until Phase 6. When it exists, it
should prefill request/build metadata and then route reports through the same
public schema and index used for GitHub and email reports.

## Public Index

| Report ID | Date received | Status | Resolution | Classification | Owner | Public summary | Fixture |
|---|---:|---|---|---|---|---|---|

## Status Values

Workflow status:

- `submitted`
- `triaged`
- `reproducing`
- `adjudicating`
- `implemented`
- `closed`

Resolution:

- `accepted`
- `rejected`
- `duplicate`
- `not-reproducible`
- `external-consultation-needed`
- `out-of-scope`

Classification:

- `parser-bug`
- `engine-bug`
- `compositor-bug`
- `api-bug`
- `corpus-bug`
- `perl-bug`
- `ordo-ambiguous`
- `source-ambiguous`
- `rendering-difference`
- `report-invalid`
- `duplicate`
