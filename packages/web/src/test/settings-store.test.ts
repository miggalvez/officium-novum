import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  loadSettings,
  resetSettings,
  resetSettingsCacheForTests,
  saveSettings,
  updateSettings
} from '../features/settings/settings-store';

class InMemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

let originalStorage: Storage | undefined;

beforeEach(() => {
  const storage = new InMemoryStorage();
  // Capture the original (could be Node's experimental localStorage on Node 25, jsdom's, etc.)
  try {
    originalStorage = window.localStorage;
  } catch {
    originalStorage = undefined;
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage as unknown as Storage
  });
  resetSettingsCacheForTests();
});

afterEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: originalStorage
  });
  resetSettingsCacheForTests();
});

describe('settings store', () => {
  it('returns defaults when no settings exist', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through save/load', () => {
    saveSettings({ ...DEFAULT_SETTINGS, fontSize: 'large', reviewerMode: true });
    resetSettingsCacheForTests();
    const next = loadSettings();
    expect(next.fontSize).toBe('large');
    expect(next.reviewerMode).toBe(true);
  });

  it('updateSettings merges patches', () => {
    const updated = updateSettings({ orthography: 'source' });
    expect(updated.orthography).toBe('source');
    expect(updated.defaultVersion).toBe(DEFAULT_SETTINGS.defaultVersion);
  });

  it('rejects bogus stored data', () => {
    window.localStorage.setItem('officium-novum:settings:v1', 'not json');
    resetSettingsCacheForTests();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('resetSettings restores defaults', () => {
    saveSettings({ ...DEFAULT_SETTINGS, fontSize: 'larger' });
    resetSettings();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
