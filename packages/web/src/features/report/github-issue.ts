import type { ReportPayload } from './report-payload';

export interface GithubIssueLink {
  readonly url: string;
  readonly title: string;
  readonly bodyTooLong: boolean;
}

const TEMPLATE = 'reviewer-report.yml';
const SOFT_URL_LIMIT = 6_000;

export function buildGithubIssueLink(input: {
  readonly baseUrl: string;
  readonly payload: ReportPayload;
  readonly bodyText: string;
}): GithubIssueLink {
  const title = formatTitle(input.payload);
  const params = new URLSearchParams();
  params.set('template', TEMPLATE);
  params.set('title', title);
  params.set('body', input.bodyText);
  const candidate = `${input.baseUrl}?${params.toString()}`;
  if (candidate.length <= SOFT_URL_LIMIT) {
    return { url: candidate, title, bodyTooLong: false };
  }
  const fallbackParams = new URLSearchParams();
  fallbackParams.set('template', TEMPLATE);
  fallbackParams.set('title', title);
  fallbackParams.set(
    'body',
    'The reviewer report payload was too long for a query string. Paste the YAML payload below this line:\n\n'
  );
  return {
    url: `${input.baseUrl}?${fallbackParams.toString()}`,
    title,
    bodyTooLong: true
  };
}

export function formatTitle(payload: ReportPayload): string {
  const dateLabel = payload.request.date ?? 'unscheduled';
  const hourLabel = payload.request.hour ?? '—';
  const versionLabel = compactVersion(payload.request.version);
  return `Reviewer report: ${dateLabel} ${hourLabel} (${versionLabel})`;
}

function compactVersion(handle: string): string {
  if (handle.startsWith('Rubrics 1960')) {
    return 'Rubrics 1960';
  }
  if (handle.startsWith('Reduced')) {
    return 'Reduced 1955';
  }
  if (handle.startsWith('Divino Afflatu')) {
    return 'Divino Afflatu 1911';
  }
  return handle;
}
