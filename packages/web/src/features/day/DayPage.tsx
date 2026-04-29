import { useEffect, useState } from 'react';

import { ApiError, getOfficeDay, rawJsonUrlForDay } from '../../api/client';
import { getEnvironment } from '../../app/env';
import { useLink } from '../../app/router';
import { ALL_HOURS, type HourName } from '../../api/types';
import type { OfficeDayResponse } from '../../api/types';
import { LoadingState } from '../../components/LoadingState';
import { RawJsonLink } from '../../components/RawJsonLink';
import { WarningBanner } from '../../components/WarningBanner';
import { ReportButton } from '../report/ReportButton';
import type { ReportContextInput } from '../report/report-payload';
import type { DayRoute } from '../../routes/paths';
import { buildOfficeRoute } from '../../routes/build-route';
import { DaySummaryCard } from './DaySummaryCard';

export interface DayPageProps {
  readonly route: DayRoute;
  readonly currentRoutePath: string;
}

export function DayPage({ route, currentRoutePath }: DayPageProps): JSX.Element {
  const [data, setData] = useState<OfficeDayResponse | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    setData(undefined);
    getOfficeDay(
      {
        date: route.date,
        version: route.version,
        languages: route.languages,
        ...(route.langfb ? { langfb: route.langfb } : {}),
        orthography: route.orthography,
        hours: 'all',
        strict: route.strict
      },
      { signal: controller.signal }
    )
      .then((resp) => {
        setData(resp);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err as Error);
        setLoading(false);
      });
    return () => controller.abort();
  }, [
    route.date,
    route.version,
    route.languages,
    route.langfb,
    route.orthography,
    route.strict
  ]);

  const env = getEnvironment();
  const apiUrl = rawJsonUrlForDay({
    date: route.date,
    version: route.version,
    languages: route.languages,
    ...(route.langfb ? { langfb: route.langfb } : {}),
    orthography: route.orthography,
    hours: 'all',
    strict: route.strict
  });

  const reportContext: ReportContextInput = {
    env,
    route: currentRoutePath,
    request: {
      date: route.date,
      version: route.version,
      languages: route.languages,
      ...(route.langfb ? { langfb: route.langfb } : {}),
      orthography: route.orthography,
      strict: route.strict,
      apiUrl
    },
    response: data
      ? {
          kind: 'office-day',
          contentVersion: data.meta.contentVersion,
          ...(data.meta.canonicalPath ? { canonicalPath: data.meta.canonicalPath } : {}),
          warnings: data.warnings.rubrical,
          quality: data.meta.quality ?? 'unknown'
        }
      : { kind: error instanceof ApiError ? 'error' : 'unknown', quality: 'unknown' }
  };

  return (
    <article aria-busy={loading}>
      <header className="office__header">
        <h1>Day · {route.date}</h1>
        <div className="toolbar">
          <RawJsonLink href={apiUrl} />
          <div className="toolbar__spacer" />
          <ReportButton context={reportContext} />
        </div>
      </header>

      {loading ? <LoadingState label="Loading day summary…" /> : null}

      {error ? (
        <div className="warning-banner warning-banner--error" role="alert">
          <strong>Could not load day summary.</strong>
          <p>{error.message}</p>
        </div>
      ) : null}

      {data ? (
        <>
          <DaySummaryCard summary={data.summary} />
          <WarningBanner warnings={data.warnings.rubrical} title="Rubrical warnings" />
          <section className="section-card">
            <h2>Hours</h2>
            <ul>
              {ALL_HOURS.map((hour) => (
                <DayHourLink key={hour} hour={hour} route={route} />
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </article>
  );
}

function DayHourLink({ hour, route }: { hour: HourName; route: DayRoute }): JSX.Element {
  const href = buildOfficeRoute({
    date: route.date,
    hour,
    version: route.version,
    languages: route.languages,
    ...(route.langfb ? { langfb: route.langfb } : {}),
    orthography: route.orthography,
    displayMode: route.displayMode,
    fontSize: route.fontSize,
    strict: route.strict
  });
  const link = useLink(href);
  return (
    <li>
      <a {...link}>{labelOf(hour)}</a>
    </li>
  );
}

function labelOf(hour: HourName): string {
  return hour.charAt(0).toUpperCase() + hour.slice(1);
}
