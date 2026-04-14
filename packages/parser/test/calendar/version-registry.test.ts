import { describe, expect, it } from 'vitest';

import { parseVersionRegistry } from '../../src/calendar/version-registry.js';
import { loadFixture } from '../fixture-loader.js';

describe('parseVersionRegistry', () => {
  it('parses version definitions and ignores header/comments', async () => {
    const content = await loadFixture('version-registry.txt');
    const parsed = parseVersionRegistry(content);

    expect(parsed).toEqual([
      {
        version: 'Tridentine - 1570',
        kalendar: '1570',
        transfer: '1570',
        stransfer: '1570',
        base: undefined,
        transferBase: undefined
      },
      {
        version: 'Rubrics 1960 - 1960',
        kalendar: '1960',
        transfer: '1960',
        stransfer: '1960',
        base: 'Reduced - 1955',
        transferBase: undefined
      },
      {
        version: 'Divino Afflatu - 1954',
        kalendar: '1954',
        transfer: '1954',
        stransfer: '1954',
        base: 'Divino Afflatu - 1939',
        transferBase: 'Divino Afflatu - 1939'
      }
    ]);
  });
});
