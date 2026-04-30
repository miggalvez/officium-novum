import { useEffect, useState } from 'react';

import { ApiError, getOfficeHour, openApiUrl, rawJsonUrlForOffice } from '../../api/client';
import { cacheWeek } from '../../sw/cache-week';
import type { OfficeHourResponse } from '../../api/types';
import { LoadingState } from '../../components/LoadingState';
import { RawJsonLink } from '../../components/RawJsonLink';
import { WarningBanner } from '../../components/WarningBanner';
import { ReportButton } from '../report/ReportButton';
import { useSettings } from '../settings/settings-store';
import { useVersions } from '../settings/use-versions';
import { useStatus } from '../status/use-status';
import type { OfficeRoute } from '../../routes/paths';
import { OfficeHeader } from './OfficeHeader';
import { HourNav } from './HourNav';
import { OfficeRenderer } from './OfficeRenderer';
import { getEnvironment } from '../../app/env';
import type { ReportContextInput } from '../report/report-payload';

export interface OfficePageProps {
  readonly route: OfficeRoute;
  readonly currentRoutePath: string;
}

export function OfficePage({ route, currentRoutePath }: OfficePageProps): JSX.Element {
  const settings = useSettings();
  const versions = useVersions();
  const status = useStatus();
  const [data, setData] = useState<OfficeHourResponse | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [caching, setCaching] = useState(false);
  const [cached, setCached] = useState(false);
  const [cacheError, setCacheError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    setData(undefined);
    getOfficeHour(
      {
        date: route.date,
        hour: route.hour,
        version: route.version,
        languages: route.languages,
        ...(route.langfb ? { langfb: route.langfb } : {}),
        orthography: route.orthography,
        strict: route.strict
      },
      { signal: controller.signal }
    )
      .then((resp) => {
        setData(resp);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err as Error);
        setLoading(false);
      });
    return () => controller.abort();
  }, [
    route.date,
    route.hour,
    route.version,
    route.languages,
    route.langfb,
    route.orthography,
    route.strict
  ]);

  const env = getEnvironment();
  const apiUrl = rawJsonUrlForOffice({
    date: route.date,
    hour: route.hour,
    version: route.version,
    languages: route.languages,
    ...(route.langfb ? { langfb: route.langfb } : {}),
    orthography: route.orthography,
    strict: route.strict
  });

  const reportContext: ReportContextInput = {
    env,
    route: currentRoutePath,
    request: {
      date: route.date,
      hour: route.hour,
      version: route.version,
      languages: route.languages,
      ...(route.langfb ? { langfb: route.langfb } : {}),
      orthography: route.orthography,
      strict: route.strict,
      apiUrl
    },
    response: data
      ? {
          kind: 'office-hour',
          contentVersion: data.meta.contentVersion,
          ...(status?.content.upstreamSha ? { upstreamSha: status.content.upstreamSha } : {}),
          ...(data.meta.canonicalPath ? { canonicalPath: data.meta.canonicalPath } : {}),
          warnings: [...data.warnings.rubrical, ...data.warnings.composition],
          quality: data.meta.quality ?? 'unknown'
        }
      : error instanceof ApiError
      ? {
          kind: 'error',
          ...(status?.content.contentVersion ? { contentVersion: status.content.contentVersion } : {}),
          ...(status?.content.upstreamSha ? { upstreamSha: status.content.upstreamSha } : {}),
          quality: 'unknown'
        }
      : {
          kind: 'unknown',
          ...(status?.content.contentVersion ? { contentVersion: status.content.contentVersion } : {}),
          ...(status?.content.upstreamSha ? { upstreamSha: status.content.upstreamSha } : {}),
          quality: 'unknown'
        }
  };

  const title = data?.summary.celebration.feast.title ?? prettyHour(route.hour);

  return (
    <article aria-busy={loading}>
      <div className="office-controls">
        <OfficeHeader route={route} versions={versions} />
        <HourNav date={route.date} current={route.hour} state={route} />
        <div className="office-controls__row office-controls__row--actions">
          <RawJsonLink href={apiUrl} />
          <a className="button button--ghost" href={openApiUrl()} target="_blank" rel="noreferrer noopener">
            OpenAPI
          </a>
          <button
            type="button"
            className="button button--ghost"
            disabled={caching}
            onClick={async () => {
              setCaching(true);
              setCacheError(undefined);
              try {
                await cacheWeek({
                  start: route.date,
                  version: route.version,
                  languages: route.languages,
                  orthography: route.orthography
                });
                setCached(true);
                window.setTimeout(() => setCached(false), 3_000);
              } catch (err) {
                setCacheError(err instanceof Error ? err.message : 'Could not cache this week.');
              } finally {
                setCaching(false);
              }
            }}
          >
            {caching ? 'Caching…' : cached ? 'Cached for week' : 'Cache this week'}
          </button>
          {cacheError ? (
            <span className="muted" role="status">{cacheError}</span>
          ) : null}
          <div className="toolbar__spacer" />
          <ReportButton context={reportContext} />
        </div>
      </div>

      {loading ? <LoadingState label={`Loading ${route.hour}…`} /> : null}
      {error ? <ErrorState error={error} apiUrl={apiUrl} /> : null}
      {data ? (
        <>
          <WarningBanner warnings={data.warnings.rubrical} title="Rubrical warnings" />
          <WarningBanner warnings={data.warnings.composition} title="Composition warnings" />
          <div className="office">
            <header className="office__header">
              <h1>{title}</h1>
              <p className="muted">
                {formatHumanDate(route.date)} · {prettyHour(route.hour)} · {route.version}
              </p>
            </header>
            <OfficeRenderer
              office={data.office}
              languages={route.languages}
              displayMode={route.displayMode}
              reviewerMode={settings.reviewerMode}
              meta={data.meta}
            />
          </div>
        </>
      ) : null}
    </article>
  );
}

function prettyHour(hour: string): string {
  const map: Record<string, string> = {
    matins: 'Matins',
    lauds: 'Lauds',
    prime: 'Prime',
    terce: 'Terce',
    sext: 'Sext',
    none: 'None',
    vespers: 'Vespers',
    compline: 'Compline'
  };
  return map[hour.toLowerCase()] ?? hour;
}

function formatHumanDate(iso: string): string {
  const parts = iso.split('-').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return iso;
  }
  const [y, m, d] = parts as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function ErrorState({
  error,
  apiUrl
}: {
  error: ApiError | Error;
  apiUrl: string;
}): JSX.Element {
  const isApi = error instanceof ApiError;
  const status = isApi ? error.status : undefined;
  const code = isApi ? error.body?.code : 'network';
  return (
    <div className="warning-banner warning-banner--error" role="alert">
      <strong>
        Error {status ?? ''} {code ? `(${code})` : ''}
      </strong>
      <p>{error.message}</p>
      <p>
        <a href={apiUrl} target="_blank" rel="noreferrer noopener">
          Open raw API URL
        </a>
      </p>
    </div>
  );
}
