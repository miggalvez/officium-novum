import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_UNADJUDICATED_LIMIT,
  formatMultiYearTable,
  loadMultiYearReport
} from '../src/report-multi-year.js';

describe('multi-year status report', () => {
  it('tracks real 2025/2026 Roman 1960 exploratory ledgers before promotion', async () => {
    const report = await loadMultiYearReport();

    expect(report.errors).toEqual([]);
    expect(report.table).toContainEqual({
      year: 2025,
      status: 'exploratory',
      policy: 'Rubrics 1960 - 1960',
      unadjudicated: 2573,
      noThrowFailures: 0,
      schemaFailures: 0
    });
    expect(report.table).toContainEqual({
      year: 2026,
      status: 'exploratory',
      policy: 'Rubrics 1960 - 1960',
      unadjudicated: 786,
      noThrowFailures: 0,
      schemaFailures: 0
    });
    expect(
      report.table
        .filter((row) => row.status === 'candidate')
        .every((row) => row.unadjudicated < CANDIDATE_UNADJUDICATED_LIMIT)
    ).toBe(true);
  });

  it('formats the dashboard table by policy and year', async () => {
    const report = await loadMultiYearReport();

    expect(formatMultiYearTable(report.table)).toMatchInlineSnapshot(`
      "Year | Status | Policy | Unadj | No-throw | Schema
      ---: | --- | --- | ---: | ---: | ---:
      2024 | gated | Divino Afflatu - 1954 | 0 | 0 | 0
      2024 | gated | Reduced - 1955 | 0 | 0 | 0
      2024 | gated | Rubrics 1960 - 1960 | 0 | 0 | 0
      2025 | exploratory | Divino Afflatu - 1954 | 0 | 0 | 0
      2025 | exploratory | Reduced - 1955 | 0 | 0 | 0
      2025 | exploratory | Rubrics 1960 - 1960 | 2573 | 0 | 0
      2026 | exploratory | Rubrics 1960 - 1960 | 786 | 0 | 0"
    `);
  });
});
