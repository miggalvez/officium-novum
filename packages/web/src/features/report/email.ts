import { formatTitle } from './github-issue';
import type { ReportPayload } from './report-payload';

export function buildMailtoLink(input: {
  readonly to: string;
  readonly payload: ReportPayload;
}): string {
  const subject = formatTitle(input.payload);
  const summary = formatEmailBodySummary(input.payload);
  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('body', summary);
  return `mailto:${encodeURIComponent(input.to)}?${params.toString()}`;
}

export function formatEmailBodySummary(payload: ReportPayload): string {
  const lines = [
    'Officium Novum reviewer report.',
    '',
    `Date:    ${payload.request.date ?? '—'}`,
    `Hour:    ${payload.request.hour ?? '—'}`,
    `Version: ${payload.request.version}`,
    `Scope:   ${payload.disagreement.scope}`,
    ...(payload.reviewer.contact ? [`Contact: ${payload.reviewer.contact}`] : []),
    '',
    'Expected:',
    payload.disagreement.expected,
    '',
    'Actual:',
    payload.disagreement.actual,
    '',
    '[Paste the full YAML payload from the demo below this line.]'
  ];
  return lines.join('\n');
}
