import { useEffect } from 'react';

import { AppShell } from '../components/AppShell';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfficePage } from '../features/office/OfficePage';
import { DayPage } from '../features/day/DayPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { StatusPanel } from '../features/status/StatusPanel';
import { useSettings } from '../features/settings/settings-store';
import { parseRoute, todayIso } from '../routes/parse-route-state';
import { buildOfficeRoute } from '../routes/build-route';
import { DEFAULT_HOUR } from '../routes/paths';
import { RouterProvider, useRouter } from './router';
import { AboutPage, ApiPage, NotFoundPage } from './AboutPage';

export function App(): JSX.Element {
  return (
    <RouterProvider>
      <AppShell>
        <ErrorBoundary>
          <RouteSwitch />
        </ErrorBoundary>
      </AppShell>
    </RouterProvider>
  );
}

function RouteSwitch(): JSX.Element {
  const { location, navigate } = useRouter();
  const settings = useSettings();
  const route = parseRoute(location);
  const currentRoutePath = location.pathname + location.search;

  useEffect(() => {
    if (route.name !== 'home') {
      return;
    }
    const target = buildOfficeRoute({
      date: todayIso(),
      hour: DEFAULT_HOUR,
      version: settings.defaultVersion,
      languages: settings.defaultLanguages,
      orthography: settings.orthography,
      displayMode: settings.displayMode,
      fontSize: settings.fontSize,
      strict: settings.strict
    });
    navigate(target, { replace: true });
  }, [route.name, settings, navigate]);

  switch (route.name) {
    case 'office':
      return <OfficePage route={route} currentRoutePath={currentRoutePath} />;
    case 'day':
      return <DayPage route={route} currentRoutePath={currentRoutePath} />;
    case 'calendar':
      return <CalendarPage route={route} currentRoutePath={currentRoutePath} />;
    case 'settings':
      return <SettingsPage />;
    case 'status':
      return <StatusPanel />;
    case 'about':
      return <AboutPage />;
    case 'api':
      return <ApiPage />;
    case 'home':
      return <p className="loading">Redirecting to today’s Office…</p>;
    case 'unknown':
    default:
      return <NotFoundPage />;
  }
}
