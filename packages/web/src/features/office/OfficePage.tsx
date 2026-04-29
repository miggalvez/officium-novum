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
  const [data, setData] = useState<OfficeHourResponse | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [caching, setCaching] = useState(false);
  const [cached, setCached] = useState(false);

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
          ...(data.meta.canonicalPath ? { canonicalPath: data.meta.canonicalPath } : {}),
          warnings: [...data.warnings.rubrical, ...data.warnings.composition],
          quality: data.meta.quality ?? 'unknown'
        }
      : error instanceof ApiError
      ? { kind: 'error', quality: 'unknown' }
      : { kind: 'unknown', quality: 'unknown' }
  };

  return (
    <article aria-busy={loading}>
      <header className="office__header">
        <h1>Office of {data?.summary.celebration.feast.title ?? route.hour}</h1>
        <p className="muted">
          {route.date} · {route.hour} · {route.version}
        </p>
        <OfficeHeader route={route} versions={versions} />
        <HourNav date={route.date} current={route.hour} state={route} />
        <div className="toolbar">
          <RawJsonLink href={apiUrl} />
          <a className="button button--ghost" href={openApiUrl()} target="_blank" rel="noreferrer noopener">
            OpenAPI
          </a>
          <button
            type="button"
            className="button"
            disabled={caching}
            onClick={async () => {
              setCaching(true);
              try {
                await cacheWeek({
                  start: route.date,
                  version: route.version,
                  languages: route.languages,
                  orthography: route.orthography
                });
                setCached(true);
                window.setTimeout(() => setCached(false), 3_000);
              } finally {
                setCaching(false);
              }
            }}
          >
            {caching ? 'Caching…' : cached ? 'Cached week' : 'Cache this week'}
          </button>
          <div className="toolbar__spacer" />
          <ReportButton context={reportContext} />
        </div>
      </header>

      {loading ? <LoadingState label={`Loading ${route.hour}…`} /> : null}
      {error ? <ErrorState error={error} apiUrl={apiUrl} /> : null}
      {data ? (
        <>
          <WarningBanner warnings={data.warnings.rubrical} title="Rubrical warnings" />
          <WarningBanner warnings={data.warnings.composition} title="Composition warnings" />
          <OfficeRenderer
            office={data.office}
            languages={route.languages}
            displayMode={route.displayMode}
            reviewerMode={settings.reviewerMode}
          />
        </>
      ) : null}
    </article>
  );
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
