import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { getEnvironment } from '../app/env';
import { useLink, useRouter } from '../app/router';
import { todayIso } from '../routes/parse-route-state';
import { buildOfficeRoute, buildCalendarRoute, buildDayRoute } from '../routes/build-route';
import { DEFAULT_HOUR } from '../routes/paths';
import { useSettings } from '../features/settings/settings-store';

export interface AppShellProps {
  readonly children: ReactNode;
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  const env = getEnvironment();
  const settings = useSettings();
  const homeLink = useLink('/');
  const today = todayIso();
  const officeHref = buildOfficeRoute({
    date: today,
    hour: DEFAULT_HOUR,
    version: settings.defaultVersion,
    languages: settings.defaultLanguages,
    orthography: settings.orthography,
    displayMode: settings.displayMode,
    fontSize: settings.fontSize,
    strict: settings.strict
  });
  const dayHref = buildDayRoute({
    date: today,
    version: settings.defaultVersion,
    languages: settings.defaultLanguages,
    orthography: settings.orthography,
    displayMode: settings.displayMode,
    fontSize: settings.fontSize,
    strict: settings.strict
  });
  const month = new Date();
  const calendarHref = buildCalendarRoute({
    year: month.getFullYear(),
    month: month.getMonth() + 1,
    version: settings.defaultVersion
  });

  useEffect(() => {
    document.documentElement.dataset.fontSize = settings.fontSize;
  }, [settings.fontSize]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="beta-banner" role="status">
        Hosted beta. Verify important rubrical questions against the published Ordo.
      </div>
      <header className="app-header" role="banner">
        <div className="app-header__inner">
          <a {...homeLink} className="app-header__title">Officium Novum</a>
          <nav className="app-header__nav" aria-label="Primary">
            <NavLink href={officeHref} activePrefix="/office">Office</NavLink>
            <NavLink href={dayHref} activePrefix="/day">Day</NavLink>
            <NavLink href={calendarHref} activePrefix="/calendar">Calendar</NavLink>
            <NavLink href="/settings" activePrefix="/settings">Settings</NavLink>
            <NavLink href="/status" activePrefix="/status">Status</NavLink>
            <NavLink href="/about" activePrefix="/about">About</NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="app-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="app-footer" role="contentinfo">
        <div>
          Officium Novum — build {env.buildSha}{env.env !== 'production' ? ` · ${env.env}` : ''}
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  activePrefix,
  children
}: {
  href: string;
  activePrefix: string;
  children: ReactNode;
}): JSX.Element {
  const { location } = useRouter();
  const link = useLink(href);
  const current =
    location.pathname === activePrefix || location.pathname.startsWith(`${activePrefix}/`);
  return (
    <a {...link} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  );
}
