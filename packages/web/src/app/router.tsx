import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface LocationSnapshot {
  readonly pathname: string;
  readonly search: string;
}

export interface RouterContextValue {
  readonly location: LocationSnapshot;
  readonly navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

function readLocation(): LocationSnapshot {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '' };
  }
  return { pathname: window.location.pathname, search: window.location.search };
}

export function RouterProvider({ children }: { children: ReactNode }): JSX.Element {
  const [location, setLocation] = useState<LocationSnapshot>(() => readLocation());

  useEffect(() => {
    const handler = () => setLocation(readLocation());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigate = useCallback<RouterContextValue['navigate']>((to, opts) => {
    if (typeof window === 'undefined') {
      return;
    }
    const current = window.location.pathname + window.location.search;
    if (current === to) {
      return;
    }
    if (opts?.replace) {
      window.history.replaceState(null, '', to);
    } else {
      window.history.pushState(null, '', to);
    }
    setLocation(readLocation());
  }, []);

  const value = useMemo<RouterContextValue>(() => ({ location, navigate }), [location, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within RouterProvider');
  }
  return ctx;
}

export function useLink(href: string): {
  href: string;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
} {
  const { navigate } = useRouter();
  const onClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      navigate(href);
    },
    [href, navigate]
  );
  return { href, onClick };
}
