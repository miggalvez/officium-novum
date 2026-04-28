# Phase 5 Sign-Off

Current as of 2026-04-28.

Phase 5 is complete once the stacked subphase PRs 5d through 5h are merged.
This checklist records the package-level evidence for the validation strategy
and reviewer feedback loop.

## Checklist

| Item | Status | Evidence |
|---|---|---|
| Shared adjudication and citation schema accepted | Complete | `docs/adr/015-cross-stack-adjudication.md`; `packages/validation/src/schemas/` |
| Reviewer intake path operational | Complete | `.github/ISSUE_TEMPLATE/reviewer-report.yml`; `docs/REVIEWER_REPORTS.md` |
| Citation audit covers current sidecars and ledgers | Complete | `pnpm -C packages/validation audit:citations`; `docs/phase-5-citation-audit.md` |
| Cross-stack E2E harness landed | Complete | `packages/validation/test/e2e-api-harness.test.ts` |
| Required CI gates documented and wired | Complete | `.github/workflows/ci.yml`; `docs/CI_GATES.md` |
| Additional year promoted beyond 2024 | Complete | 2025 is `candidate` in `packages/validation/fixtures/multi-year/phase-5-years.json` |
| Multi-year dashboard reports policy/year counts | Complete | `pnpm -C packages/validation report:multi-year`; `docs/phase-5-multi-year-status.md` |
| Reviewer report processed through public fixture path | Complete | `rr-2026-0001` in `packages/validation/test/reviewer-reports/accepted/` |
| Reviewer privacy audit passes | Complete | `pnpm -C packages/validation audit:reviewer-privacy` |
| 2024 Roman baseline remains signed off | Complete | `pnpm -C packages/compositor verify:phase-3-signoff` |

## Final Validation Commands

```bash
pnpm -r typecheck
pnpm -r test
pnpm -C packages/compositor verify:phase-3-signoff
```

The 2025 candidate status is intentionally not the same as gated parity. Its
follow-up remains: generate full package-owned 2025 ledgers and promote only
after every supported Roman policy reaches 0 unadjudicated rows for that year.
