# CI Gates

Current as of 2026-04-28.

The required GitHub Actions workflow is `.github/workflows/ci.yml`. It is
deliberately small and mirrors the commands maintainers run locally.

## Required Commands

| Order | Workflow step | Command | Gate |
|---:|---|---|---|
| 1 | Build workspace | `pnpm -r build` | Produces workspace package `dist/` exports needed by downstream package type resolution in clean CI. |
| 2 | Typecheck workspace | `pnpm -r typecheck` | Blocks on TypeScript errors in every package. |
| 3 | Test workspace | `pnpm -r test` | Blocks on package tests and package-owned audits. |
| 4 | Verify 2024 adjudication sign-off | `pnpm -C packages/compositor verify:phase-3-signoff` | Blocks on unadjudicated rows, files over 800 lines, or pending commit SHAs. |

The validation package owns Phase 5 audit wiring through its package `test`
script:

```text
vitest run && pnpm run audit:citations && pnpm run audit:reviewer-privacy && pnpm run audit:reviewer-reports && pnpm run report:multi-year
```

## Package Coverage

| Package | Covered by `pnpm -r typecheck` | Covered by `pnpm -r test` |
|---|---:|---|
| `@officium-novum/parser` | `tsc -p tsconfig.json --noEmit` | parser unit and upstream-gated corpus tests |
| `@officium-novum/rubrical-engine` | `tsc -p tsconfig.json --noEmit` | rubrical unit tests and upstream-gated Phase 2 integration matrices |
| `@officium-novum/compositor` | `tsc -p tsconfig.json --noEmit` | composition unit tests, no-throw sweep, and Appendix A goldens |
| `@officium-novum/api` | `tsc -p tsconfig.json --noEmit` | API route tests, OpenAPI assertions, and Phase 4 contract gate |
| `@officium-novum/validation` | `tsc -p tsconfig.json --noEmit` | Phase 5 schemas, citation audit, reviewer audits, E2E harness, and multi-year dashboard |

## Multi-Year Thresholds

| Year status | CI behavior | Required threshold |
|---|---|---|
| `exploratory` | Not required in normal PR CI. | Informational only. |
| `candidate` | Included in normal CI once promoted. | No no-throw/schema failures; fewer than 10 unadjudicated rows per policy/year during the promotion window. |
| `gated` | Included in normal CI. | 0 unadjudicated rows per policy/year and no unintended fixture diffs. |

Candidate-year exceptions must stay temporary. Each promoted candidate year
needs an owner, a promotion-window note, and a follow-up path to `gated`; the
`<10` threshold never applies to the already-gated 2024 Roman baseline.
