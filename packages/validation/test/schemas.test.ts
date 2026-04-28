import { describe, expect, it } from 'vitest';

import {
  validateAdjudicationEntry,
  validateCitation,
  validateReviewerReport
} from '../src/index.js';

const corpusCitation = {
  sourceType: 'corpus',
  sourceId: null,
  edition: null,
  publisher: null,
  page: null,
  section: null,
  paragraph: null,
  corpusPath: 'upstream/web/www/horas/Latin/Psalterium/Common/Rubricae.txt',
  lineStart: 50,
  lineEnd: 65,
  adr: null,
  reportId: null,
  archiveRef: null,
  checksum: null,
  excerptPolicy: 'brief-public-excerpt'
};

describe('Phase 5 schemas', () => {
  it('accepts a structured corpus citation with a source locator', () => {
    expect(validateCitation(corpusCitation, { requireSource: true })).toEqual({
      ok: true,
      errors: []
    });
  });

  it('rejects corpus citations without a path and line range', () => {
    expect(validateCitation({ ...corpusCitation, corpusPath: null, lineStart: null }).ok)
      .toBe(false);
  });

  it('requires a source citation for accepted adjudication classifications', () => {
    const entry = {
      key: 'Rubrics 1960 - 1960/2024-01-01/Lauds/abcd1234',
      package: 'compositor',
      classification: 'perl-bug',
      status: 'adjudicated',
      citation: corpusCitation,
      summary: 'Legacy Perl omits source-backed rubric prose.',
      notes: '',
      createdAt: '2026-04-28',
      updatedAt: '2026-04-28'
    };

    expect(validateAdjudicationEntry(entry)).toEqual({
      ok: true,
      errors: []
    });
    expect(
      validateAdjudicationEntry({
        ...entry,
        citation: { ...corpusCitation, sourceType: 'none' }
      }).ok
    ).toBe(false);
  });

  it('accepts a redacted public reviewer report', () => {
    const report = publicReviewerReport();

    expect(validateReviewerReport(report)).toEqual({
      ok: true,
      errors: []
    });
  });

  it('allows reviewer report notes to be null', () => {
    expect(validateReviewerReport({ ...publicReviewerReport(), notes: null })).toEqual({
      ok: true,
      errors: []
    });
  });
});

function publicReviewerReport() {
  return {
      schemaVersion: 1,
      id: 'rr-2026-0001',
      submittedAt: '2026-04-28T14:30:00-05:00',
      submittedVia: 'maintainer',
      reviewer: {
        reviewerKind: 'maintainer',
        attribution: 'anonymous',
        publicName: null
      },
      context: {
        calendarScope: 'universal-roman',
        locality: null,
        communityOrUse: null,
        ordoFamily: 'rubrics-1960'
      },
      request: {
        date: '2026-04-28',
        version: 'Rubrics 1960 - 1960',
        hour: 'lauds',
        languages: ['la', 'en'],
        langfb: null,
        orthography: 'version',
        strict: false,
        apiVersion: 'v1',
        apiPath: '/api/v1/office/2026-04-28/lauds?version=Rubrics%201960%20-%201960',
        appBuildSha: null,
        apiBuildSha: null,
        upstreamSha: null
      },
      output: {
        permalink: null,
        apiResponseFixture: null,
        excerpt: null
      },
      disagreement: {
        scope: 'rubric',
        expected: 'Expected text',
        actual: 'Actual text'
      },
      citation: corpusCitation,
      triage: {
        status: 'submitted',
        resolution: null,
        classification: null,
        fixtureStatus: 'none',
        ownerPackage: null,
        duplicateOf: null,
        decidedBy: null,
        decidedAt: null,
        publicSummary: ''
      },
      notes: ''
    };
}
