# Phase 5 Citation Audit

Current as of 2026-04-28.

This artifact records the Phase 5d cross-stack authority audit. The executable
gate is `pnpm -C packages/validation audit:citations`.

## Scope

The audit covers:

- `packages/compositor/test/divergence/adjudications.json`
- compositor divergence ledgers for the 2024 Roman baseline
- rubrical-engine divergence ledgers for the 2024 Roman baseline
- structured citation objects accepted by the shared Phase 5 schema
- legacy free-text citation strings that remain in the ADR-011 sidecar

Reviewer-report fixtures are audited by `pnpm -C packages/validation
audit:reviewer-reports`; reviewer privacy is audited separately by
`pnpm -C packages/validation audit:reviewer-privacy`.

## Current Result

Latest local output:

```text
citation audit passed: 2659 artifacts checked (1429 sidecar entries, 1230 ledger rows; 1429 legacy citation strings pending structured migration, 0 explicit migration exceptions)
```

The 2024 baseline has no missing required citations.

## Migration Backlog

The remaining backlog is structural rather than evidentiary:

| Backlog | Count | Blocking? | Disposition |
|---|---:|---:|---|
| Missing required citations | 0 | Yes | Any new instance fails the audit. |
| Legacy free-text sidecar citations | 1429 | No | Convert opportunistically to the Phase 5 citation object. |
| Explicit migration exceptions | 0 | Yes when unapproved | New exceptions require documentation here. |

The legacy string citations are allowed only because the audit proves they are
non-empty and carry recognized source locators. New adjudication surfaces should
prefer the structured Phase 5 citation object.

## Corpus-Line Rule

When a citation relies on the Divinum Officium corpus itself as dispositive
evidence, it must include both the corpus path and a line locator, for example:

```text
upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt:50-65
```

The audit blocks corpus citations that mention `upstream/web/www/` without a
line locator unless they have already been converted to a structured citation
that records the equivalent locator.
