# Phase 5 Multi-Year Status

Current as of 2026-04-28.

Phase 5g promotes 2025 from exploratory tracking to `candidate` status. The
machine-readable manifest is
`packages/validation/fixtures/multi-year/phase-5-years.json`, backed by the
2025 candidate ledger and adjudication sidecar in the same fixture directory.

Run:

```bash
pnpm -C packages/validation report:multi-year
```

Current output:

```text
Year | Status | Policy | Unadj | No-throw | Schema
---: | --- | --- | ---: | ---: | ---:
2024 | gated | Divino Afflatu - 1954 | 0 | 0 | 0
2024 | gated | Reduced - 1955 | 0 | 0 | 0
2024 | gated | Rubrics 1960 - 1960 | 0 | 0 | 0
2025 | candidate | Divino Afflatu - 1954 | 0 | 0 | 0
2025 | candidate | Reduced - 1955 | 0 | 0 | 0
2025 | candidate | Rubrics 1960 - 1960 | 0 | 0 | 0
multi-year status passed
```

The 2025 rows are candidate-control rows, not a claim that full 2025 package
divergence ledgers are already gated. The promotion follow-up is to generate
full package-owned 2025 ledgers and move the year to `gated` only after every
supported Roman policy reaches 0 unadjudicated rows there as well.
