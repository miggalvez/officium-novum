import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_UNADJUDICATED_LIMIT,
  formatMultiYearTable,
  loadMultiYearReport
} from '../src/report-multi-year.js';

describe('multi-year status report', () => {
  it('promotes 2025 as a candidate year with enforced thresholds', async () => {
    const report = await loadMultiYearReport();

    expect(report.errors).toEqual([]);
    expect(report.table).toContainEqual({
      year: 2025,
      status: 'candidate',
      policy: 'Rubrics 1960 - 1960',
      unadjudicated: 0,
      noThrowFailures: 0,
      schemaFailures: 0
    });
    expect(
      report.table
        .filter((row) => row.year === 2025)
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
      2025 | candidate | Divino Afflatu - 1954 | 0 | 0 | 0
      2025 | candidate | Reduced - 1955 | 0 | 0 | 0
      2025 | candidate | Rubrics 1960 - 1960 | 0 | 0 | 0"
    `);
  });
});
