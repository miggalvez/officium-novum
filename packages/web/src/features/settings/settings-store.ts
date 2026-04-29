import { useEffect, useState } from 'react';

import type { PublicLanguageTag, TextOrthographyProfile } from '../../api/types';
import {
  DEFAULT_LANGUAGES,
  DEFAULT_ORTHOGRAPHY,
  DEFAULT_VERSION
} from '../../routes/paths';

const STORAGE_KEY = 'officium-novum:settings:v1';

export interface DemoSettings {
  readonly defaultVersion: string;
  readonly defaultLanguages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography: TextOrthographyProfile;
  readonly displayMode: 'parallel' | 'sequential';
  readonly fontSize: 'normal' | 'large' | 'larger';
  readonly reviewerMode: boolean;
  readonly strict: boolean;
}

export const DEFAULT_SETTINGS: DemoSettings = {
  defaultVersion: DEFAULT_VERSION,
  defaultLanguages: DEFAULT_LANGUAGES,
  orthography: DEFAULT_ORTHOGRAPHY,
  displayMode: 'parallel',
  fontSize: 'normal',
  reviewerMode: false,
  strict: true
};

type Listener = (next: DemoSettings) => void;
const listeners = new Set<Listener>();
let cached: DemoSettings | undefined;

function safeStorage(): Storage | undefined {
  try {
    if (typeof window !== 'undefined') {
      return window.localStorage;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function loadSettings(): DemoSettings {
  if (cached) {
    return cached;
  }
  const storage = safeStorage();
  if (!storage) {
    cached = DEFAULT_SETTINGS;
    return cached;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = DEFAULT_SETTINGS;
      return cached;
    }
    const parsed = JSON.parse(raw) as Partial<DemoSettings>;
    cached = mergeSettings(parsed);
    return cached;
  } catch {
    cached = DEFAULT_SETTINGS;
    return cached;
  }
}

export function saveSettings(next: DemoSettings): void {
  cached = next;
  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / privacy-mode failures
    }
  }
  listeners.forEach((listener) => listener(next));
}

export function updateSettings(patch: Partial<DemoSettings>): DemoSettings {
  const next = mergeSettings({ ...loadSettings(), ...patch });
  saveSettings(next);
  return next;
}

export function resetSettings(): void {
  saveSettings(DEFAULT_SETTINGS);
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSettings(): DemoSettings {
  const [state, setState] = useState<DemoSettings>(() => loadSettings());
  useEffect(() => subscribeSettings(setState), []);
  return state;
}

export function mergeSettings(input: Partial<DemoSettings>): DemoSettings {
  return {
    defaultVersion:
      typeof input.defaultVersion === 'string' && input.defaultVersion.trim().length > 0
        ? input.defaultVersion
        : DEFAULT_SETTINGS.defaultVersion,
    defaultLanguages: sanitizeLanguages(input.defaultLanguages),
    ...(input.langfb && (input.langfb === 'la' || input.langfb === 'en')
      ? { langfb: input.langfb }
      : {}),
    orthography: input.orthography === 'source' ? 'source' : 'version',
    displayMode: input.displayMode === 'sequential' ? 'sequential' : 'parallel',
    fontSize:
      input.fontSize === 'large' || input.fontSize === 'larger' ? input.fontSize : 'normal',
    reviewerMode: Boolean(input.reviewerMode),
    strict: input.strict !== false
  };
}

function sanitizeLanguages(
  value: readonly PublicLanguageTag[] | undefined
): readonly PublicLanguageTag[] {
  if (!value || value.length === 0) {
    return DEFAULT_SETTINGS.defaultLanguages;
  }
  const filtered = value.filter(
    (tag): tag is PublicLanguageTag => tag === 'la' || tag === 'en'
  );
  return filtered.length > 0 ? filtered : DEFAULT_SETTINGS.defaultLanguages;
}

export function resetSettingsCacheForTests(): void {
  cached = undefined;
  listeners.clear();
}
