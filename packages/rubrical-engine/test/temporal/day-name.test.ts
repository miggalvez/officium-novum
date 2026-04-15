import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { dayNameForDate, weekStemForDate } from '../../src/index.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const PROJECT_ROOT = resolve(PACKAGE_ROOT, '../..');
const CGI_ROOT = resolve(PROJECT_ROOT, 'upstream/web/cgi-bin');
const describeIfUpstream = existsSync(CGI_ROOT) ? describe : describe.skip;

describeIfUpstream('weekStemForDate / dayNameForDate', () => {
  it('matches Perl getweek across an 11-year, 550+ date matrix', () => {
    const samples = buildSampleDates('2020-01-01', '2030-12-31', 7);
    expect(samples.length).toBeGreaterThanOrEqual(550);

    const perlLines = execFileSync(
      'perl',
      [
        '-I',
        CGI_ROOT,
        '-MDivinumOfficium::Date=getweek,day_of_week',
        '-e',
        [
          'use strict;',
          'use warnings;',
          'while (<STDIN>) {',
          '  chomp;',
          '  next unless length $_;',
          '  my ($year, $month, $day) = split /-/, $_;',
          '  my $stem = getweek($day, $month, $year, 0, 0);',
          '  my $dow = day_of_week($day, $month, $year);',
          '  print "$stem|$dow\\n";',
          '}'
        ].join(' ')
      ],
      {
        encoding: 'utf8',
        input: `${samples.join('\n')}\n`
      }
    )
      .trim()
      .split('\n');

    expect(perlLines).toHaveLength(samples.length);

    for (const [index, isoDate] of samples.entries()) {
      const [perlStem, perlDowText] = perlLines[index]!.split('|');
      const perlDow = Number(perlDowText);
      const expectedFull = /^Nat\d{2}$/u.test(perlStem) ? perlStem : `${perlStem}-${perlDow}`;

      expect(weekStemForDate(isoDate)).toBe(perlStem);
      expect(dayNameForDate(isoDate)).toBe(expectedFull);
    }
  });

  it('covers representative seasonal boundaries with the expected full key', () => {
    expect(dayNameForDate('2024-01-01')).toBe('Nat01');
    expect(dayNameForDate('2024-02-11')).toBe('Quadp3-0');
    expect(dayNameForDate('2024-03-29')).toBe('Quad6-5');
    expect(dayNameForDate('2024-04-14')).toBe('Pasc2-0');
    expect(dayNameForDate('2024-05-09')).toBe('Pasc5-4');
    expect(dayNameForDate('2024-11-03')).toBe('Epi4-0');
    expect(dayNameForDate('2024-12-25')).toBe('Nat25');
  });
});

function buildSampleDates(startIso: string, endIso: string, stepDays: number): string[] {
  const out: string[] = [];
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);

  for (let current = start; current <= end; current = new Date(current.getTime() + stepDays * 86400000)) {
    out.push(current.toISOString().slice(0, 10));
  }

  return out;
}
