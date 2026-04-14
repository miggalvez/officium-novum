import { describe, expect, it } from 'vitest';

import { parseKalendarium } from '../../src/calendar/kalendarium.js';
import { loadFixture } from '../fixture-loader.js';

describe('parseKalendarium', () => {
  it('parses entries, alternates, and suppressed feast markers', async () => {
    const content = await loadFixture('kalendarium.txt');
    const parsed = parseKalendarium(content);

    expect(parsed).toEqual([
      {
        dateKey: '01-18',
        fileRef: '01-18r',
        alternates: undefined,
        suppressed: false
      },
      {
        dateKey: '01-25',
        fileRef: '01-25r',
        alternates: undefined,
        suppressed: false
      },
      {
        dateKey: '05-06',
        fileRef: 'XXXXX',
        suppressed: true
      },
      {
        dateKey: '07-21',
        fileRef: '07-21r',
        alternates: ['07-21'],
        suppressed: false
      }
    ]);
  });
});
