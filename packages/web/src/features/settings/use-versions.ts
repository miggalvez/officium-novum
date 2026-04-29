import { useEffect, useState } from 'react';

import { getLanguages, getVersions } from '../../api/client';
import type { LanguageInfo, VersionInfo } from '../../api/types';

let versionsCache: readonly VersionInfo[] | undefined;
let versionsPromise: Promise<readonly VersionInfo[]> | undefined;
let languagesCache: readonly LanguageInfo[] | undefined;
let languagesPromise: Promise<readonly LanguageInfo[]> | undefined;

async function fetchVersions(): Promise<readonly VersionInfo[]> {
  if (versionsCache) {
    return versionsCache;
  }
  if (!versionsPromise) {
    versionsPromise = getVersions()
      .then((response) => {
        versionsCache = response.versions;
        return versionsCache;
      })
      .catch((err) => {
        versionsPromise = undefined;
        throw err;
      });
  }
  return versionsPromise;
}

async function fetchLanguages(): Promise<readonly LanguageInfo[]> {
  if (languagesCache) {
    return languagesCache;
  }
  if (!languagesPromise) {
    languagesPromise = getLanguages()
      .then((response) => {
        languagesCache = response.languages;
        return languagesCache;
      })
      .catch((err) => {
        languagesPromise = undefined;
        throw err;
      });
  }
  return languagesPromise;
}

export function useVersions(): readonly VersionInfo[] {
  const [state, setState] = useState<readonly VersionInfo[]>(() => versionsCache ?? []);
  useEffect(() => {
    let cancelled = false;
    fetchVersions()
      .then((value) => {
        if (!cancelled) {
          setState(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function useLanguagesMetadata(): readonly LanguageInfo[] {
  const [state, setState] = useState<readonly LanguageInfo[]>(() => languagesCache ?? []);
  useEffect(() => {
    let cancelled = false;
    fetchLanguages()
      .then((value) => {
        if (!cancelled) {
          setState(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function _resetVersionCache(): void {
  versionsCache = undefined;
  versionsPromise = undefined;
  languagesCache = undefined;
  languagesPromise = undefined;
}
