import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseScriptureTransfer,
  parseTransfer,
  parseVersionRegistry
} from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine,
  dayNameForDate
} from '../../src/index.js';
import { TestOfficeTextIndex } from '../helpers.js';
import { makeTestPolicy } from '../policy-fixture.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

describeIfUpstream('Phase 2b overlay against upstream Transfer/Stransfer tables', () => {
  it('surfaces expected overlay directives for a focused real-data matrix', () => {
    const matrix = [
      {
        date: '2024-01-08',
        expected: {
          officeSubstitutionPath: 'Sancti/01-08g'
        }
      },
      {
        date: '2025-05-18',
        expected: {
          hymnOverride: { hymnKey: '05-18', mode: 'merge' as const }
        }
      },
      {
        date: '2025-11-02',
        expected: {
          dirgeAtVespers: { source: 3 as const, matchedDateKey: '11-03' }
        }
      },
      {
        date: '2025-11-03',
        expected: {
          dirgeAtLauds: { source: 3 as const, matchedDateKey: '11-03' }
        }
      },
      {
        date: '2025-11-19',
        expected: {
          scriptureTransfer: {
            dateKey: '11-19',
            target: '114-2',
            operation: 'R' as const
          }
        }
      },
      {
        date: '2025-11-10',
        expected: {
          scriptureTransfer: {
            dateKey: '11-10',
            target: '113-0',
            operation: 'B' as const
          }
        }
      },
      {
        date: '2025-11-28',
        expected: {
          scriptureTransfer: {
            dateKey: '11-28',
            target: '115-6',
            operation: 'A' as const
          }
        }
      }
    ] as const;

    const corpus = new TestOfficeTextIndex();
    for (const row of matrix) {
      const dayName = dayNameForDate(row.date);
      const path = `horas/Latin/Tempora/${dayName}.txt`;
      corpus.add(path, ['[Officium]', dayName, '', '[Rank]', ';;Semiduplex;;5;;'].join('\n'));
    }

    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus,
      kalendarium: buildKalendariumTable([]),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle('Divino Afflatu - 1954'),
      policyMap: VERSION_POLICY,
      policyOverride: makeTestPolicy('divino-afflatu')
    });

    for (const row of matrix) {
      const summary = engine.resolveDayOfficeSummary(row.date);
      expect(summary.overlay).toBeDefined();

      if (row.expected.officeSubstitutionPath) {
        expect(summary.overlay?.officeSubstitution?.path).toBe(
          row.expected.officeSubstitutionPath
        );
      }

      if (row.expected.hymnOverride) {
        expect(summary.overlay?.hymnOverride).toEqual(row.expected.hymnOverride);
      }

      if (row.expected.dirgeAtVespers) {
        expect(summary.overlay?.dirgeAtVespers).toEqual(row.expected.dirgeAtVespers);
      }

      if (row.expected.dirgeAtLauds) {
        expect(summary.overlay?.dirgeAtLauds).toEqual(row.expected.dirgeAtLauds);
      }

      if (row.expected.scriptureTransfer) {
        expect(summary.overlay?.scriptureTransfer).toMatchObject(
          row.expected.scriptureTransfer
        );
      }
    }
  });
});

function loadTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Transfer');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      yearKey: name.slice(0, -4),
      entries: parseTransfer(readFileSync(resolve(dir, name), 'utf8'))
    }));
}

function loadScriptureTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Stransfer');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      yearKey: name.slice(0, -4),
      entries: parseScriptureTransfer(readFileSync(resolve(dir, name), 'utf8'))
    }));
}
