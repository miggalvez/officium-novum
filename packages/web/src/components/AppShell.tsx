import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { getEnvironment } from '../app/env';
import { useLink, useRouter } from '../app/router';
import { todayIso } from '../routes/parse-route-state';
import { buildOfficeRoute, buildCalendarRoute } from '../routes/build-route';
import { DEFAULT_HOUR } from '../routes/paths';
import { useSettings } from '../features/settings/settings-store';

export interface AppShellProps {
  readonly children: ReactNode;
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  const env = getEnvironment();
  const settings = useSettings();
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
  const dayHref = `/day/${today}?version=${encodeURIComponent(settings.defaultVersion)}&lang=${settings.defaultLanguages.join(',')}`;
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
          <h1 className="app-header__title">Officium Novum</h1>
          <nav className="app-header__nav" aria-label="Primary">
            <NavLink href={officeHref}>Office</NavLink>
            <NavLink href={dayHref}>Day</NavLink>
            <NavLink href={calendarHref}>Calendar</NavLink>
            <NavLink href="/settings">Settings</NavLink>
            <NavLink href="/status">Status</NavLink>
            <NavLink href="/about">About</NavLink>
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

function NavLink({ href, children }: { href: string; children: ReactNode }): JSX.Element {
  const { location } = useRouter();
  const link = useLink(href);
  const target = href.split('?')[0];
  const current = location.pathname.startsWith(target ?? '/__never__');
  return (
    <a {...link} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  );
}
