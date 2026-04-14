import { describe, expect, it } from 'vitest';

import { parseScriptureTransfer, parseTransfer } from '../../src/calendar/transfer.js';
import { loadFixture } from '../fixture-loader.js';

describe('parseTransfer', () => {
  it('parses transfer, dirge, and hymn directives with version filters', async () => {
    const content = await loadFixture('transfer.txt');
    const parsed = parseTransfer(content);

    expect(parsed).toEqual([
      {
        kind: 'transfer',
        dateKey: '02-03',
        target: '01-29',
        alternates: ['02-03'],
        versionFilter: '1888 1906'
      },
      {
        kind: 'transfer',
        dateKey: '04-03',
        target: '03-25',
        alternates: undefined,
        versionFilter: '1570 1888'
      },
      {
        kind: 'dirge',
        dirgeNumber: 1,
        dates: ['01-24', '02-03', '02-13'],
        versionFilter: '1570'
      },
      {
        kind: 'hymn',
        dateKey: '05-18',
        value: '1',
        versionFilter: 'DA'
      },
      {
        kind: 'transfer',
        dateKey: '06-15',
        target: '06-14',
        alternates: undefined,
        versionFilter: undefined
      }
    ]);
  });
});

describe('parseScriptureTransfer', () => {
  it('parses scripture transfers and optional operation codes', async () => {
    const content = await loadFixture('stransfer.txt');
    const parsed = parseScriptureTransfer(content);

    expect(parsed).toEqual([
      {
        dateKey: '04-04',
        target: 'Pasc1-1',
        operation: undefined,
        versionFilter: '1888 1906'
      },
      {
        dateKey: '07-03',
        target: 'Pent07-0',
        operation: 'B',
        versionFilter: '1570 DA'
      },
      {
        dateKey: '11-19',
        target: '114-2',
        operation: 'R',
        versionFilter: '1570 1888 1906 DA'
      },
      {
        dateKey: '12-01',
        target: '120-1',
        operation: undefined,
        versionFilter: undefined
      }
    ]);
  });
});
