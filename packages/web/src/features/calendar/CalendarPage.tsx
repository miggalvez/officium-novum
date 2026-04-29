import { useEffect, useState } from 'react';

import { ApiError, getCalendarMonth, rawJsonUrlForCalendar } from '../../api/client';
import { getEnvironment } from '../../app/env';
import { useLink } from '../../app/router';
import type { CalendarMonthResponse } from '../../api/types';
import { LoadingState } from '../../components/LoadingState';
import { RawJsonLink } from '../../components/RawJsonLink';
import { ReportButton } from '../report/ReportButton';
import type { ReportContextInput } from '../report/report-payload';
import { useVersions } from '../settings/use-versions';
import { VersionPicker } from '../../components/VersionPicker';
import { useRouter } from '../../app/router';
import type { CalendarRoute } from '../../routes/paths';
import { buildCalendarRoute } from '../../routes/build-route';
import { CalendarGrid } from './CalendarGrid';

export interface CalendarPageProps {
  readonly route: CalendarRoute;
  readonly currentRoutePath: string;
}

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

export function CalendarPage({ route, currentRoutePath }: CalendarPageProps): JSX.Element {
  const versions = useVersions();
  const { navigate } = useRouter();
  const [data, setData] = useState<CalendarMonthResponse | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    setData(undefined);
    getCalendarMonth(
      { year: route.year, month: route.month, version: route.version },
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
  }, [route.year, route.month, route.version]);

  const { prev, next } = adjacentMonths(route.year, route.month);
  const prevHref = buildCalendarRoute({
    year: prev.year,
    month: prev.month,
    version: route.version
  });
  const nextHref = buildCalendarRoute({
    year: next.year,
    month: next.month,
    version: route.version
  });
  const today = new Date();
  const todayHref = buildCalendarRoute({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    version: route.version
  });
  const prevLink = useLink(prevHref);
  const nextLink = useLink(nextHref);
  const todayLink = useLink(todayHref);

  const env = getEnvironment();
  const apiUrl = rawJsonUrlForCalendar({
    year: route.year,
    month: route.month,
    version: route.version
  });
  const reportContext: ReportContextInput = {
    env,
    route: currentRoutePath,
    request: {
      version: route.version,
      languages: ['la', 'en'],
      orthography: 'version',
      strict: true,
      apiUrl
    },
    response: data
      ? {
          kind: 'calendar-month',
          contentVersion: data.meta.contentVersion,
          ...(data.meta.canonicalPath ? { canonicalPath: data.meta.canonicalPath } : {}),
          quality: 'unknown'
        }
      : { kind: error instanceof ApiError ? 'error' : 'unknown', quality: 'unknown' }
  };

  return (
    <article aria-busy={loading}>
      <header className="office__header">
        <h1>
          {MONTH_NAMES[route.month]} {route.year}
        </h1>
        <div className="calendar__nav">
          <a {...prevLink} className="button">← Previous</a>
          <a {...todayLink} className="button">Today</a>
          <a {...nextLink} className="button">Next →</a>
          <VersionPicker
            value={route.version}
            versions={versions}
            onChange={(version) =>
              navigate(buildCalendarRoute({ year: route.year, month: route.month, version }))
            }
          />
          <RawJsonLink href={apiUrl} />
          <div className="toolbar__spacer" />
          <ReportButton context={reportContext} />
        </div>
      </header>

      {loading ? <LoadingState label="Loading calendar…" /> : null}
      {error ? (
        <div className="warning-banner warning-banner--error" role="alert">
          <strong>Could not load calendar.</strong>
          <p>{error.message}</p>
        </div>
      ) : null}
      {data ? (
        <CalendarGrid
          year={route.year}
          month={route.month}
          days={data.days}
          version={route.version}
        />
      ) : null}
    </article>
  );
}

function adjacentMonths(
  year: number,
  month: number
): { prev: { year: number; month: number }; next: { year: number; month: number } } {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return { prev, next };
}
