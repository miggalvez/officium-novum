import { describe, expect, it } from 'vitest';

import { liturgicalSeasonForDate } from '../../src/index.js';

describe('liturgicalSeasonForDate', () => {
  it('classifies representative seasonal boundaries', () => {
    expect(liturgicalSeasonForDate('2024-12-01')).toBe('advent');
    expect(liturgicalSeasonForDate('2024-01-01')).toBe('christmastide');
    expect(liturgicalSeasonForDate('2024-01-21')).toBe('time-after-epiphany');
    expect(liturgicalSeasonForDate('2024-02-11')).toBe('septuagesima');
    expect(liturgicalSeasonForDate('2024-03-03')).toBe('lent');
    expect(liturgicalSeasonForDate('2024-03-17')).toBe('passiontide');
    expect(liturgicalSeasonForDate('2024-04-21')).toBe('eastertide');
    expect(liturgicalSeasonForDate('2024-05-10')).toBe('ascensiontide');
    expect(liturgicalSeasonForDate('2024-05-20')).toBe('pentecost-octave');
    expect(liturgicalSeasonForDate('2024-06-09')).toBe('time-after-pentecost');
  });
});
