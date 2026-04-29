import { describe, expect, it } from 'vitest';

import type { DemoEnvironment } from '../app/env';
import {
  buildReportPayload,
  redactReviewer,
  validateReport,
  type ReportPayloadInput
} from '../features/report/report-payload';
import { formatReportAsYaml, formatReportAsJson } from '../features/report/report-format';
import { buildGithubIssueLink, formatTitle } from '../features/report/github-issue';
import { buildMailtoLink } from '../features/report/email';

const env: DemoEnvironment = {
  apiBaseUrl: 'https://api.example.org',
  publicBaseUrl: 'https://demo.example.org',
  githubReportUrl: 'https://github.com/miggalvez/officium-novum/issues/new',
  reportEmail: 'reports@example.org',
  buildSha: 'abc1234',
  buildDate: '2026-04-28T00:00:00.000Z',
  env: 'production'
};

const baseInput: ReportPayloadInput = {
  context: {
    env,
    route: '/office/2026-04-28/lauds?version=Rubrics%201960%20-%201960',
    request: {
      date: '2026-04-28',
      hour: 'lauds',
      version: 'Rubrics 1960 - 1960',
      languages: ['la', 'en'],
      orthography: 'version',
      strict: true,
      apiUrl:
        'https://api.example.org/api/v1/office/2026-04-28/lauds?version=Rubrics+1960+-+1960&lang=la%2Cen&orthography=version&strict=true'
    },
    response: {
      kind: 'office-hour',
      contentVersion: 'def5678',
      canonicalPath: '/api/v1/office/2026-04-28/lauds?canonical=true',
      warnings: [{ code: 'placeholder.rubric', message: 'placeholder', severity: 'warning' }],
      quality: 'partial'
    }
  },
  disagreement: {
    scope: 'commemoration',
    expected: 'commemoration of N',
    actual: 'no commemoration shown'
  },
  citation: { sourceType: 'ordo', reference: 'FSSP Ordo 2026, p. 47' },
  reviewer: { publicAttribution: 'anonymous' },
  notes: 'verified against my parish breviary',
  now: new Date('2026-04-28T18:30:00.000Z')
};

describe('validateReport', () => {
  it('flags missing expected/actual', () => {
    const issues = validateReport({
      ...baseInput,
      disagreement: { ...baseInput.disagreement, expected: '', actual: '' }
    });
    expect(issues.map((i) => i.field)).toEqual([
      'disagreement.expected',
      'disagreement.actual'
    ]);
  });

  it('requires a name when public attribution opts in', () => {
    const issues = validateReport({
      ...baseInput,
      reviewer: { publicAttribution: 'name-ok' }
    });
    expect(issues.some((i) => i.field === 'reviewer.name')).toBe(true);
  });

  it('passes when expected/actual + version + apiUrl are present', () => {
    expect(validateReport(baseInput)).toEqual([]);
  });
});

describe('buildReportPayload', () => {
  it('captures exact API URL, canonical path, content version, build SHA, route', () => {
    const payload = buildReportPayload(baseInput);
    expect(payload.frontend.buildSha).toBe('abc1234');
    expect(payload.frontend.route).toContain('/office/2026-04-28/lauds');
    expect(payload.api.contentVersion).toBe('def5678');
    expect(payload.api.canonicalPath).toBe('/api/v1/office/2026-04-28/lauds?canonical=true');
    expect(payload.request.apiUrl).toContain('/api/v1/office/2026-04-28/lauds');
    expect(payload.request.version).toBe('Rubrics 1960 - 1960');
    expect(payload.response.kind).toBe('office-hour');
    expect(payload.response.warningCodes).toEqual(['placeholder.rubric']);
    expect(payload.response.quality).toBe('partial');
    expect(payload.reportSchemaVersion).toBe(1);
    expect(payload.generatedAt).toBe('2026-04-28T18:30:00.000Z');
  });

  it('does not require contact details', () => {
    const payload = buildReportPayload(baseInput);
    expect(payload.reviewer.contact).toBeUndefined();
    expect(payload.reviewer.name).toBeUndefined();
    expect(payload.reviewer.publicAttribution).toBe('anonymous');
  });

  it('redacts name and contact for anonymous reports even if entered', () => {
    const payload = buildReportPayload({
      ...baseInput,
      reviewer: {
        publicAttribution: 'anonymous',
        name: 'Should be dropped',
        contact: 'should-be-dropped@example.org',
        affiliation: 'diocesan priest'
      }
    });
    expect(payload.reviewer.name).toBeUndefined();
    expect(payload.reviewer.contact).toBeUndefined();
    expect(payload.reviewer.affiliation).toBe('diocesan priest');
  });

  it('keeps public reviewer details for opted-in attribution', () => {
    const payload = buildReportPayload({
      ...baseInput,
      reviewer: {
        publicAttribution: 'name-ok',
        name: 'Fr. N',
        contact: 'fr.n@example.org',
        affiliation: 'diocesan priest'
      }
    });
    expect(payload.reviewer.name).toBe('Fr. N');
    expect(payload.reviewer.contact).toBeUndefined();
    expect(payload.reviewer.affiliation).toBe('diocesan priest');
  });
});

describe('redactReviewer', () => {
  it('drops name and contact for anonymous attribution', () => {
    expect(
      redactReviewer({ publicAttribution: 'anonymous', name: 'X', contact: 'x@x' })
    ).toEqual({ publicAttribution: 'anonymous' });
  });

  it('drops contact even when public name attribution is enabled', () => {
    expect(
      redactReviewer({ publicAttribution: 'name-ok', name: 'X', contact: 'x@x' })
    ).toEqual({ publicAttribution: 'name-ok', name: 'X' });
  });
});

describe('formatReport*', () => {
  const payload = buildReportPayload(baseInput);

  it('renders YAML with key paths', () => {
    const yaml = formatReportAsYaml(payload);
    expect(yaml).toContain('reportSchemaVersion: 1');
    expect(yaml).toContain('apiVersion: v1');
    expect(yaml).toContain('scope: commemoration');
  });

  it('renders JSON that round-trips back to the payload', () => {
    const json = formatReportAsJson(payload);
    const parsed = JSON.parse(json);
    expect(parsed.frontend.buildSha).toBe('abc1234');
  });

  it('emits arrays of language strings as YAML list items', () => {
    const yaml = formatReportAsYaml(payload);
    expect(yaml).toMatch(/languages:\n\s+- la\n\s+- en/);
  });
});

describe('buildGithubIssueLink', () => {
  it('produces a URL with template + title + body when payload is small', () => {
    const payload = buildReportPayload(baseInput);
    const link = buildGithubIssueLink({
      baseUrl: env.githubReportUrl,
      payload,
      bodyText: 'short body'
    });
    expect(link.url).toContain('template=reviewer-report.yml');
    expect(link.url).toMatch(/title=Reviewer(\+|%20)report%3A/);
    expect(link.bodyTooLong).toBe(false);
    expect(link.title).toBe('Reviewer report: 2026-04-28 lauds (Rubrics 1960)');
  });

  it('falls back to a paste-prompt link when body is huge', () => {
    const payload = buildReportPayload(baseInput);
    const huge = 'x'.repeat(10_000);
    const link = buildGithubIssueLink({
      baseUrl: env.githubReportUrl,
      payload,
      bodyText: huge
    });
    expect(link.bodyTooLong).toBe(true);
    expect(link.url.length).toBeLessThan(2_000);
  });
});

describe('buildMailtoLink', () => {
  it('builds a mailto: with subject + summary body', () => {
    const payload = buildReportPayload(baseInput);
    const link = buildMailtoLink({ to: 'reports@example.org', payload });
    expect(link.startsWith('mailto:')).toBe(true);
    expect(link).toContain('subject=');
    expect(link).toContain('body=');
  });
});

describe('formatTitle', () => {
  it('falls back to a placeholder for unscheduled reports', () => {
    const payload = buildReportPayload({
      ...baseInput,
      context: {
        ...baseInput.context,
        request: { ...baseInput.context.request, date: undefined, hour: undefined }
      }
    });
    expect(formatTitle(payload)).toContain('unscheduled');
  });
});
