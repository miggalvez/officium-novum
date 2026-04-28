import { describe, expect, it } from 'vitest';

import { validateReviewerReportJson } from '../src/audit-reviewer-reports.js';

describe('reviewer report audit', () => {
  it('reports invalid JSON as a fixture validation error', () => {
    expect(validateReviewerReportJson('{', 'bad-report.json')[0]).toMatch(
      /^bad-report\.json: invalid JSON:/u
    );
  });
});
