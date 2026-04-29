import { describe, expect, it } from 'vitest';

import {
  buildCalendarMonthPath,
  buildCalendarMonthUrl,
  buildOfficeDayPath,
  buildOfficeHourPath,
  buildOfficeHourUrl,
  joinUrl,
  padMonth
} from '../api/url';

describe('buildOfficeHourPath', () => {
  it('builds a canonical-style URL with sorted defaults', () => {
    const path = buildOfficeHourPath({
      date: '2026-04-28',
      hour: 'lauds',
      version: 'Rubrics 1960 - 1960',
      languages: ['la', 'en']
    });
    expect(path).toContain('/api/v1/office/2026-04-28/lauds');
    expect(path).toContain('version=Rubrics+1960+-+1960');
    expect(path).toContain('lang=la%2Cen');
    expect(path).toContain('orthography=version');
    expect(path).toContain('strict=true');
  });

  it('preserves language order — la,en is distinct from en,la', () => {
    const a = buildOfficeHourPath({
      date: '2026-04-28',
      hour: 'lauds',
      version: 'Rubrics 1960 - 1960',
      languages: ['la', 'en']
    });
    const b = buildOfficeHourPath({
      date: '2026-04-28',
      hour: 'lauds',
      version: 'Rubrics 1960 - 1960',
      languages: ['en', 'la']
    });
    expect(a).not.toBe(b);
  });

  it('omits joinLaudsToMatins when not specified', () => {
    const path = buildOfficeHourPath({
      date: '2026-04-28',
      hour: 'matins',
      version: 'Rubrics 1960 - 1960',
      languages: ['la']
    });
    expect(path).not.toContain('joinLaudsToMatins');
  });

  it('serializes langfb when provided', () => {
    const path = buildOfficeHourPath({
      date: '2026-04-28',
      hour: 'lauds',
      version: 'Rubrics 1960 - 1960',
      languages: ['la', 'en'],
      langfb: 'la'
    });
    expect(path).toContain('langfb=la');
  });
});

describe('buildOfficeDayPath', () => {
  it('serializes hours=all when requested', () => {
    const path = buildOfficeDayPath({
      date: '2026-04-28',
      version: 'Rubrics 1960 - 1960',
      languages: ['la'],
      hours: 'all'
    });
    expect(path).toContain('hours=all');
  });

  it('serializes a hours subset list', () => {
    const path = buildOfficeDayPath({
      date: '2026-04-28',
      version: 'Rubrics 1960 - 1960',
      languages: ['la'],
      hours: ['lauds', 'vespers']
    });
    expect(path).toContain('hours=lauds%2Cvespers');
  });
});

describe('buildCalendarMonthPath', () => {
  it('zero-pads month', () => {
    expect(buildCalendarMonthPath({ year: 2026, month: 4, version: 'V' })).toContain(
      '/api/v1/calendar/2026/04?'
    );
    expect(buildCalendarMonthPath({ year: 2026, month: 12, version: 'V' })).toContain(
      '/api/v1/calendar/2026/12?'
    );
  });
});

describe('joinUrl + builders', () => {
  it('joins base URL without double slashes', () => {
    expect(joinUrl('https://api.example.org/', '/api/v1/status')).toBe(
      'https://api.example.org/api/v1/status'
    );
    expect(joinUrl('https://api.example.org', 'api/v1/status')).toBe(
      'https://api.example.org/api/v1/status'
    );
  });

  it('uses joinUrl in builders', () => {
    const url = buildOfficeHourUrl('https://api.example.org', {
      date: '2026-04-28',
      hour: 'lauds',
      version: 'V',
      languages: ['la']
    });
    expect(url.startsWith('https://api.example.org/api/v1/office/')).toBe(true);
  });

  it('uses root-relative URLs for same-origin deployments', () => {
    const url = buildCalendarMonthUrl('', { year: 2026, month: 4, version: 'V' });
    expect(url).toBe('/api/v1/calendar/2026/04?version=V');
  });
});

describe('padMonth', () => {
  it('pads single-digit months', () => {
    expect(padMonth(1)).toBe('01');
    expect(padMonth(11)).toBe('11');
  });
});
