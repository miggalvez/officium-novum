import { useEffect, useState } from 'react';

import { ApiError, getStatus } from '../../api/client';
import { getEnvironment } from '../../app/env';
import type { StatusResponse } from '../../api/types';
import { LoadingState } from '../../components/LoadingState';

export function StatusPanel(): JSX.Element {
  const [status, setStatus] = useState<StatusResponse | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const env = getEnvironment();

  useEffect(() => {
    const controller = new AbortController();
    getStatus({ signal: controller.signal })
      .then(setStatus)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err as Error);
      });
    return () => controller.abort();
  }, []);

  return (
    <article>
      <h1>Status</h1>

      <section className="section-card">
        <h2>Frontend build</h2>
        <dl>
          <dt>Build SHA</dt>
          <dd><code>{env.buildSha}</code></dd>
          <dt>Build date</dt>
          <dd>{env.buildDate}</dd>
          <dt>Environment</dt>
          <dd>{env.env}</dd>
          <dt>API base URL</dt>
          <dd><code>{env.apiBaseUrl}</code></dd>
        </dl>
      </section>

      <section className="section-card">
        <h2>API status</h2>
        {error ? (
          <div className="warning-banner warning-banner--error" role="alert">
            <strong>Could not reach API.</strong>
            <p>{error.message}</p>
            {error instanceof ApiError ? (
              <p className="muted">HTTP {error.status} — {error.url}</p>
            ) : null}
          </div>
        ) : null}
        {status ? (
          <dl>
            <dt>Status</dt>
            <dd>{status.status}</dd>
            <dt>Content version</dt>
            <dd><code>{status.content.contentVersion}</code></dd>
            {status.content.upstreamSha ? (
              <>
                <dt>Upstream SHA</dt>
                <dd><code>{status.content.upstreamSha}</code></dd>
              </>
            ) : null}
            {status.content.corpusFileCount !== undefined ? (
              <>
                <dt>Corpus file count</dt>
                <dd>{status.content.corpusFileCount}</dd>
              </>
            ) : null}
            <dt>Supported versions</dt>
            <dd>
              {status.support.supportedVersionCount} (
              {status.support.deferredVersionCount} deferred,
              {' '}
              {status.support.missaOnlyVersionCount} missa-only)
            </dd>
            <dt>Hours</dt>
            <dd>{status.support.supportedHours.join(', ')}</dd>
          </dl>
        ) : !error ? (
          <LoadingState label="Fetching status…" />
        ) : null}
      </section>
    </article>
  );
}
