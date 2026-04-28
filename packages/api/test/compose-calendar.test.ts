import { describe, expect, it } from 'vitest';
import type { DayOfficeSummary, VersionDescriptor } from '@officium-novum/rubrical-engine';

import type { ApiContext } from '../src/context.js';
import { composeCalendarMonth } from '../src/services/compose-calendar.js';
import type { ApiVersionEntry } from '../src/services/version-registry.js';

const VERSION: VersionDescriptor = {
  handle: 'Rubrics 1960 - 1960',
  kalendar: '1960',
  transfer: '1960',
  stransfer: '1960',
  policyName: 'rubrics-1960'
};

describe('composeCalendarMonth', () => {
  it('preserves four-digit request years in generated date strings', () => {
    const dates: string[] = [];
    const versionEntry: ApiVersionEntry = {
      handle: VERSION.handle,
      status: 'supported',
      descriptor: VERSION,
      policyName: VERSION.policyName,
      aliases: [],
      engine: {
        version: {} as never,
        resolveDayOfficeSummary(date) {
          dates.push(String(date));
          return summary(String(date));
        }
      }
    };
    const versions = new Map<string, ApiVersionEntry>([
      [VERSION.handle, versionEntry]
    ]);
    const context = {
      contentVersion: 'test-content',
      supportedHours: [],
      defaultVersion: versionEntry,
      versions,
      languages: new Map()
    } satisfies ApiContext;

    const response = composeCalendarMonth({
      context,
      yearParam: '0999',
      monthParam: '02',
      query: {
        version: VERSION.handle
      }
    });

    expect(dates[0]).toBe('0999-02-01');
    expect(dates.at(-1)).toBe('0999-02-28');
    expect(response.request.year).toBe('0999');
    expect(response.year).toBe(999);
    expect(response.meta.canonicalPath).toBe(
      '/api/v1/calendar/0999/02?version=Rubrics+1960+-+1960'
    );
  });
});

function summary(date: string): DayOfficeSummary {
  const feastRef = {
    id: `Tempora/${date}`,
    path: `Tempora/${date}`,
    title: date
  };
  const rank = {
    name: 'Feria',
    classSymbol: 'IV',
    weight: 1
  };

  return {
    date,
    version: VERSION,
    temporal: {
      date,
      dayOfWeek: 1,
      weekStem: 'Epi1',
      dayName: 'Feria',
      season: 'time-after-epiphany',
      feastRef,
      rank
    },
    warnings: [],
    celebration: {
      feastRef,
      rank,
      source: 'temporal'
    },
    celebrationRules: {} as never,
    commemorations: [],
    concurrence: {
      winner: 'today',
      source: {
        feastRef,
        rank,
        source: 'temporal'
      },
      commemorations: [],
      reason: 'today-higher-rank',
      warnings: []
    },
    compline: {} as never,
    hours: {},
    candidates: [],
    winner: {
      feastRef,
      rank,
      source: 'temporal'
    }
  };
}
