import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { getEnvironment } from '../../app/env';
import { buildGithubIssueLink } from './github-issue';
import { buildMailtoLink } from './email';
import { formatReportAsYaml } from './report-format';
import {
  buildReportPayload,
  validateReport,
  type ReportContextInput,
  type ReportPayload,
  type ReportPayloadInput,
  type ReportScope,
  type ReportSourceType,
  type ReportAttribution,
  type ReportValidationIssue
} from './report-payload';

export interface ReportDialogProps {
  readonly open: boolean;
  readonly context: ReportContextInput;
  readonly onClose: () => void;
}

const SCOPES: readonly ReportScope[] = [
  'feast',
  'commemoration',
  'psalter',
  'lesson',
  'antiphon',
  'hymn',
  'versicle',
  'oration',
  'rubric',
  'translation',
  'rendering',
  'api',
  'other'
];

const SOURCES: readonly ReportSourceType[] = [
  'ordo',
  'rubrical-book',
  'breviary',
  'corpus',
  'adr',
  'consultation',
  'none'
];

interface FormState {
  scope: ReportScope;
  expected: string;
  actual: string;
  selectedText: string;
  sourceType: ReportSourceType;
  sourceId: string;
  reference: string;
  excerpt: string;
  publicAttribution: ReportAttribution;
  name: string;
  contact: string;
  affiliation: string;
  qualification: string;
  notes: string;
}

const INITIAL: FormState = {
  scope: 'rubric',
  expected: '',
  actual: '',
  selectedText: '',
  sourceType: 'ordo',
  sourceId: '',
  reference: '',
  excerpt: '',
  publicAttribution: 'anonymous',
  name: '',
  contact: '',
  affiliation: '',
  qualification: '',
  notes: ''
};

export function ReportDialog({ open, context, onClose }: ReportDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [issues, setIssues] = useState<readonly ReportValidationIssue[]>([]);
  const [copied, setCopied] = useState<'json' | 'yaml' | undefined>(undefined);
  const env = getEnvironment();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) {
      return;
    }
    if (open && !node.open) {
      try {
        node.showModal();
      } catch {
        node.show();
      }
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const payloadInput: ReportPayloadInput = {
    context,
    disagreement: {
      scope: form.scope,
      expected: form.expected,
      actual: form.actual,
      ...(form.selectedText.trim() ? { selectedText: form.selectedText } : {})
    },
    citation: {
      sourceType: form.sourceType,
      ...(form.sourceId.trim() ? { sourceId: form.sourceId } : {}),
      ...(form.reference.trim() ? { reference: form.reference } : {}),
      ...(form.excerpt.trim() ? { excerpt: form.excerpt } : {})
    },
    reviewer: {
      publicAttribution: form.publicAttribution,
      ...(form.name.trim() ? { name: form.name } : {}),
      ...(form.contact.trim() ? { contact: form.contact } : {}),
      ...(form.affiliation.trim() ? { affiliation: form.affiliation } : {}),
      ...(form.qualification.trim() ? { qualification: form.qualification } : {})
    },
    ...(form.notes.trim() ? { notes: form.notes } : {})
  };

  const payload: ReportPayload = buildReportPayload(payloadInput);
  const yaml = formatReportAsYaml(payload);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateReport(payloadInput);
    setIssues(found);
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const copy = async (kind: 'json' | 'yaml') => {
    const text =
      kind === 'json'
        ? JSON.stringify(payload, null, 2)
        : yaml;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(undefined), 2_000);
    } catch (err) {
      console.warn('Clipboard write failed', err);
    }
  };

  const issuesValid = validateReport(payloadInput).length === 0;
  const githubLink = buildGithubIssueLink({
    baseUrl: env.githubReportUrl,
    payload,
    bodyText: yaml
  });
  const mailto = env.reportEmail
    ? buildMailtoLink({ to: env.reportEmail, payload })
    : undefined;

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} onClose={onClose}>
      <form onSubmit={submit}>
        <h2 id={titleId}>Report this</h2>
        <p className="muted">
          Reports submitted through GitHub are <strong>public</strong>. Email reports are private
          until processed. Your name is published only when you opt in below; contact details are
          never included in public report payloads.
        </p>

        <fieldset>
          <legend>Disagreement</legend>
          <div className="form-row">
            <label>
              <span>Scope</span>
              <select
                value={form.scope}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  update('scope', e.target.value as ReportScope)
                }
              >
                {SCOPES.map((scope) => (
                  <option key={scope} value={scope}>{scope}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Expected behavior</span>
              <textarea
                required
                value={form.expected}
                onChange={(e) => update('expected', e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Actual behavior</span>
              <textarea
                required
                value={form.actual}
                onChange={(e) => update('actual', e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Selected text (optional)</span>
              <textarea
                value={form.selectedText}
                onChange={(e) => update('selectedText', e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Citation</legend>
          <div className="form-row">
            <label>
              <span>Source type</span>
              <select
                value={form.sourceType}
                onChange={(e) => update('sourceType', e.target.value as ReportSourceType)}
              >
                {SOURCES.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Reference</span>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => update('reference', e.target.value)}
                placeholder="e.g. FSSP Ordo 2026, p. 47"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Excerpt (optional)</span>
              <textarea
                value={form.excerpt}
                onChange={(e) => update('excerpt', e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Reviewer</legend>
          <div className="form-row">
            <label>
              <span>Public attribution</span>
              <select
                value={form.publicAttribution}
                onChange={(e) =>
                  update('publicAttribution', e.target.value as ReportAttribution)
                }
              >
                <option value="anonymous">Anonymous (recommended)</option>
                <option value="name-ok">Publish my name</option>
              </select>
            </label>
          </div>
          {form.publicAttribution === 'name-ok' ? (
            <>
              <div className="form-row">
                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Contact (private; only used if maintainers reach out)</span>
                  <input
                    type="email"
                    value={form.contact}
                    onChange={(e) => update('contact', e.target.value)}
                  />
                </label>
              </div>
            </>
          ) : null}
          <div className="form-row">
            <label>
              <span>Affiliation (optional)</span>
              <input
                type="text"
                value={form.affiliation}
                onChange={(e) => update('affiliation', e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Qualification (optional)</span>
              <input
                type="text"
                value={form.qualification}
                onChange={(e) => update('qualification', e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Notes</legend>
          <div className="form-row">
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </fieldset>

        <details>
          <summary>Generated YAML payload</summary>
          <pre aria-label="Report YAML payload">{yaml}</pre>
        </details>

        {issues.length > 0 ? (
          <div className="warning-banner warning-banner--error" role="alert">
            <strong>Please fix the following:</strong>
            <ul>
              {issues.map((issue) => (
                <li key={issue.field}>
                  <code>{issue.field}</code> — {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={() => copy('yaml')}
            disabled={!issuesValid}
          >
            {copied === 'yaml' ? 'Copied YAML' : 'Copy YAML'}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => copy('json')}
            disabled={!issuesValid}
          >
            {copied === 'json' ? 'Copied JSON' : 'Copy JSON'}
          </button>
          {mailto ? (
            <a
              className={`button ${issuesValid ? '' : 'button--ghost'}`}
              href={issuesValid ? mailto : undefined}
              aria-disabled={!issuesValid}
              onClick={(e) => {
                if (!issuesValid) {
                  e.preventDefault();
                }
              }}
            >
              Email report
            </a>
          ) : null}
          <a
            className={`button button--primary ${issuesValid ? '' : 'button--ghost'}`}
            href={issuesValid ? githubLink.url : undefined}
            target="_blank"
            rel="noreferrer noopener"
            aria-disabled={!issuesValid}
            onClick={(e) => {
              if (!issuesValid) {
                e.preventDefault();
              }
            }}
          >
            {githubLink.bodyTooLong
              ? 'Open GitHub issue (paste YAML)'
              : 'Open GitHub issue'}
          </a>
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="button button--primary">
            Validate
          </button>
        </div>
      </form>
    </dialog>
  );
}
