import { describe, expect, it } from 'vitest';

import {
  normalizeRubricsAlias,
  parseCommonState,
  parseRoute,
  todayIso
} from '../routes/parse-route-state';
import { buildCalendarRoute, buildDayRoute, buildOfficeRoute } from '../routes/build-route';

describe('parseRoute', () => {
  it('parses an office route with explicit query state', () => {
    const route = parseRoute({
      pathname: '/office/2026-04-28/lauds',
      search:
        '?version=Rubrics%201960%20-%201960&lang=la,en&orthography=version&strict=true&mode=parallel'
    });
    expect(route).toMatchObject({
      name: 'office',
      date: '2026-04-28',
      hour: 'lauds',
      version: 'Rubrics 1960 - 1960',
      languages: ['la', 'en'],
      orthography: 'version',
      strict: true,
      displayMode: 'parallel'
    });
  });

  it('rejects an invalid hour as unknown route', () => {
    const route = parseRoute({
      pathname: '/office/2026-04-28/notahour',
      search: ''
    });
    expect(route.name).toBe('unknown');
  });

  it('rejects an invalid date as unknown route', () => {
    expect(parseRoute({ pathname: '/office/not-a-date/lauds', search: '' }).name).toBe(
      'unknown'
    );
  });

  it('parses calendar routes with valid year/month', () => {
    const route = parseRoute({
      pathname: '/calendar/2026/04',
      search: '?version=Reduced%20-%201955'
    });
    expect(route).toMatchObject({ name: 'calendar', year: 2026, month: 4, version: 'Reduced - 1955' });
  });

  it('rejects out-of-range months as unknown', () => {
    expect(parseRoute({ pathname: '/calendar/2026/13', search: '' }).name).toBe('unknown');
    expect(parseRoute({ pathname: '/calendar/2026/0', search: '' }).name).toBe('unknown');
  });

  it('parses simple routes', () => {
    expect(parseRoute({ pathname: '/settings', search: '' }).name).toBe('settings');
    expect(parseRoute({ pathname: '/status', search: '' }).name).toBe('status');
    expect(parseRoute({ pathname: '/about', search: '' }).name).toBe('about');
    expect(parseRoute({ pathname: '/api', search: '' }).name).toBe('api');
    expect(parseRoute({ pathname: '/', search: '' }).name).toBe('home');
  });
});

describe('parseCommonState', () => {
  it('falls back to defaults when query is missing', () => {
    const state = parseCommonState(new URLSearchParams(''));
    expect(state.version).toBe('Rubrics 1960 - 1960');
    expect(state.languages).toEqual(['la', 'en']);
    expect(state.orthography).toBe('version');
    expect(state.strict).toBe(true);
    expect(state.displayMode).toBe('parallel');
    expect(state.fontSize).toBe('normal');
  });

  it('normalizes the rubrics inbound alias when present', () => {
    const state = parseCommonState(new URLSearchParams('?rubrics=1960'));
    expect(state.version).toBe('Rubrics 1960 - 1960');
  });

  it('drops invalid language tags', () => {
    const state = parseCommonState(new URLSearchParams('?lang=la,xx,en'));
    expect(state.languages).toEqual(['la', 'en']);
  });
});

describe('build helpers round-trip', () => {
  it('buildOfficeRoute produces a parseable URL', () => {
    const url = buildOfficeRoute({
      date: '2026-04-28',
      hour: 'lauds',
      version: 'Rubrics 1960 - 1960'
    });
    const [pathname, search = ''] = url.split('?');
    const parsed = parseRoute({ pathname: pathname ?? '', search: `?${search}` });
    expect(parsed.name).toBe('office');
  });

  it('buildDayRoute and buildCalendarRoute produce parseable URLs', () => {
    const day = buildDayRoute({
      date: '2026-04-28',
      version: 'Rubrics 1960 - 1960',
      languages: ['la'],
      orthography: 'source',
      displayMode: 'sequential',
      fontSize: 'large',
      strict: false
    });
    const cal = buildCalendarRoute({ year: 2026, month: 4 });
    const dayParsed = parseRoute(splitUrl(day));
    const calParsed = parseRoute(splitUrl(cal));
    expect(dayParsed.name).toBe('day');
    expect(dayParsed.name === 'day' ? dayParsed.orthography : undefined).toBe('source');
    expect(dayParsed.name === 'day' ? dayParsed.displayMode : undefined).toBe('sequential');
    expect(dayParsed.name === 'day' ? dayParsed.fontSize : undefined).toBe('large');
    expect(dayParsed.name === 'day' ? dayParsed.strict : undefined).toBe(false);
    expect(calParsed.name).toBe('calendar');
  });
});

describe('normalizeRubricsAlias', () => {
  it('maps 1960/1955/1911', () => {
    expect(normalizeRubricsAlias('1960')).toBe('Rubrics 1960 - 1960');
    expect(normalizeRubricsAlias('1955')).toBe('Reduced - 1955');
    expect(normalizeRubricsAlias('1911')).toBe('Divino Afflatu - 1911');
    expect(normalizeRubricsAlias('da')).toBe('Divino Afflatu - 1911');
  });

  it('passes unknown values through', () => {
    expect(normalizeRubricsAlias('whatever')).toBe('whatever');
  });
});

describe('todayIso', () => {
  it('formats yyyy-mm-dd', () => {
    expect(todayIso(new Date(Date.UTC(2026, 3, 28)))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

function splitUrl(url: string): { pathname: string; search: string } {
  const [pathname, search = ''] = url.split('?');
  return { pathname: pathname ?? '/', search: search ? `?${search}` : '' };
}
