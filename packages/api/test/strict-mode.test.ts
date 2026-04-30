import { describe, expect, it, vi } from 'vitest';
import type { ComposedHour } from '@officium-novum/compositor';
import type {
  DayOfficeSummary,
  HourName,
  VersionDescriptor
} from '@officium-novum/rubrical-engine';

vi.mock('@officium-novum/compositor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@officium-novum/compositor')>();
  return {
    ...actual,
    composeHour: vi.fn((input: { hour: HourName }) => ({
      date: '2024-01-01',
      hour: input.hour,
      celebration: 'Strict mode fixture',
      languages: ['Latin'],
      sections: [],
      slotAccounting: [],
      warnings: [
        {
          code: 'contract-fixture-error',
          message: 'Synthetic error-level warning for strict-mode API coverage.',
          severity: 'error'
        }
      ]
    } satisfies ComposedHour))
  };
});

const VERSION: VersionDescriptor = {
  handle: 'Rubrics 1960 - 1960',
  kalendar: '1960',
  transfer: '1960',
  stransfer: '1960',
  policyName: 'rubrics-1960'
};

describe('strict=true composition error handling', () => {
  it('turns office error-level composition warnings into composition-error', async () => {
    const { composeOfficeHour } = await import('../src/services/compose-office.js');

    expect(() =>
      composeOfficeHour({
        context: testContext(),
        dateParam: '2024-01-01',
        hourParam: 'lauds',
        query: {
          version: VERSION.handle,
          strict: 'true'
        }
      })
    ).toThrow('Composition produced error-level warnings under strict mode.');
  });

  it('turns selected day-bundle error-level composition warnings into composition-error', async () => {
    const { composeOfficeDay } = await import('../src/services/compose-day.js');

    expect(() =>
      composeOfficeDay({
        context: testContext(),
        dateParam: '2024-01-01',
        query: {
          version: VERSION.handle,
          hours: 'lauds',
          strict: 'true'
        }
      })
    ).toThrow('Composition produced error-level warnings under strict mode.');
  });
});

function testContext() {
  const versionEntry = {
    handle: VERSION.handle,
    status: 'supported' as const,
    descriptor: VERSION,
    policyName: VERSION.policyName,
    aliases: [],
    engine: {
      version: {} as never,
      resolveDayOfficeSummary: () => summary()
    }
  };

  return {
    contentVersion: 'test-content',
    corpus: {} as never,
    supportedHours: ['lauds'] as const,
    defaultVersion: versionEntry,
    versions: new Map([[VERSION.handle, versionEntry]]),
    languages: new Map([
      [
        'la',
        {
          tag: 'la',
          corpusName: 'Latin',
          label: 'Latin'
        }
      ]
    ])
  };
}

function summary(): DayOfficeSummary {
  const feastRef = {
    id: 'Tempora/2024-01-01',
    path: 'Tempora/2024-01-01',
    title: 'Strict mode fixture'
  };
  const rank = {
    name: 'I classis',
    classSymbol: 'I',
    weight: 100
  };

  return {
    date: '2024-01-01',
    version: VERSION,
    temporal: {
      date: '2024-01-01',
      dayOfWeek: 1,
      weekStem: 'Nat',
      dayName: 'In Octava Nativitatis',
      season: 'christmastide',
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
