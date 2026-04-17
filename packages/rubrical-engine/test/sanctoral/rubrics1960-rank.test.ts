import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFile } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import { rubrics1960Policy, rubrics1960ResolveRank } from '../../src/index.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const LATIN_ROOT = resolve(UPSTREAM_ROOT, 'horas/Latin');
const HAS_UPSTREAM = existsSync(LATIN_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;
const KNOWN_PARSE_FAILURES = [
  'horas/Latin/Sancti/01-12.txt',
  'horas/Latin/Tempora/Nat12.txt',
  'horas/Latin/Tempora/Pasc2-3.txt',
  'horas/Latin/Tempora/Pasc2-4.txt',
  'horas/Latin/Tempora/Pasc2-5.txt',
  'horas/Latin/Tempora/Pasc2-6.txt',
  'horas/Latin/Tempora/Pasc6-0.txt'
] as const;

describeIfUpstream('rubrics1960ResolveRank invariant', () => {
  it('maps every Latin Sancti/Tempora rank line to a class with precedence-consistent weight', () => {
    const files = [
      ...listLatinFiles('Sancti'),
      ...listLatinFiles('Tempora')
    ];

    let checked = 0;
    const parseFailures: string[] = [];
    for (const entry of files) {
      let parsed;
      try {
        parsed = parseFile(readFileSync(entry.absolutePath, 'utf8'), entry.relativePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        parseFailures.push(`${entry.relativePath}: ${message}`);
        continue;
      }
      const source = entry.relativePath.includes('/Tempora/') ? 'temporal' : 'sanctoral';
      const feastPath = entry.relativePath
        .replace(/^horas\/Latin\//u, '')
        .replace(/\.txt$/u, '');
      const { date, season } = contextFor(feastPath, source);

      for (const section of parsed.sections) {
        if (section.header !== 'Rank' || !section.rank) {
          continue;
        }
        for (const line of section.rank) {
          const resolved = rubrics1960ResolveRank(line.rank, {
            date,
            feastPath,
            source,
            version: 'Rubrics 1960 - 1960',
            season
          });
          const precedence = rubrics1960Policy.precedenceRow(resolved.classSymbol);
          expect(resolved.weight).toBe(precedence.weight);
          checked += 1;
        }
      }
    }

    const parseFailureFiles = parseFailures
      .map((entry) => entry.split(':', 1)[0] ?? '')
      .sort((left, right) => left.localeCompare(right));

    expect(checked).toBeGreaterThan(1000);
    expect(parseFailureFiles).toEqual([...KNOWN_PARSE_FAILURES].sort());
  });
});

function listLatinFiles(folder: 'Sancti' | 'Tempora') {
  const dir = resolve(LATIN_ROOT, folder);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
    .map((entry) => {
      const absolutePath = resolve(dir, entry.name);
      const relativePath = absolutePath.replace(`${UPSTREAM_ROOT}/`, '');
      return { absolutePath, relativePath };
    });
}

function contextFor(
  feastPath: string,
  source: 'temporal' | 'sanctoral'
): { readonly date: string; readonly season: Parameters<typeof rubrics1960ResolveRank>[1]['season'] } {
  if (source === 'sanctoral') {
    const fileKey = feastPath.split('/').at(-1) ?? '';
    const dateMatch = /^(\d{2})-(\d{2})/u.exec(fileKey);
    if (dateMatch) {
      return {
        date: `2024-${dateMatch[1]}-${dateMatch[2]}`,
        season: 'time-after-pentecost'
      };
    }
    return {
      date: '2024-06-15',
      season: 'time-after-pentecost'
    };
  }

  const key = feastPath.split('/').at(-1) ?? '';
  if (key.startsWith('Adv')) {
    return { date: '2024-12-08', season: 'advent' };
  }
  if (key.startsWith('Nat')) {
    return { date: '2024-12-30', season: 'christmastide' };
  }
  if (key.startsWith('Epi')) {
    return { date: '2024-01-10', season: 'time-after-epiphany' };
  }
  if (key.startsWith('Quadp')) {
    return { date: '2024-02-14', season: 'septuagesima' };
  }
  if (key.startsWith('Quad5') || key.startsWith('Quad6')) {
    return { date: '2024-03-24', season: 'passiontide' };
  }
  if (key.startsWith('Quad')) {
    return { date: '2024-03-10', season: 'lent' };
  }
  if (key.startsWith('Pasc6')) {
    return { date: '2024-05-10', season: 'ascensiontide' };
  }
  if (key.startsWith('Pasc7')) {
    return { date: '2024-05-21', season: 'pentecost-octave' };
  }
  if (key.startsWith('Pasc')) {
    return { date: '2024-04-14', season: 'eastertide' };
  }
  return { date: '2024-07-14', season: 'time-after-pentecost' };
}
