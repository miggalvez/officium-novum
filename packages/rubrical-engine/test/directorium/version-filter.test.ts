import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseScriptureTransfer, parseTransfer, parseVersionRegistry } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import { matchesVersionFilter } from '../../src/index.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

describe('matchesVersionFilter', () => {
  it('treats empty filters as universally applicable', () => {
    expect(matchesVersionFilter(undefined, 'DA')).toBe(true);
    expect(matchesVersionFilter('', '1960')).toBe(true);
  });

  it('matches single-token and multi-token filters from Transfer/a.txt and Transfer/322.txt', () => {
    expect(matchesVersionFilter('DA', 'DA')).toBe(true);
    expect(matchesVersionFilter('DA', '1960')).toBe(false);

    expect(matchesVersionFilter('1570 1888 1906 M1617', 'M1617')).toBe(true);
    expect(matchesVersionFilter('1570 1888 1906 M1617', '1960')).toBe(false);

    expect(matchesVersionFilter('DA Newcal 1960', '1960')).toBe(true);
    expect(matchesVersionFilter('DA Newcal 1960', 'Newcal')).toBe(true);
    expect(matchesVersionFilter('1570 1888 1906 M1617 C1951 CAV', 'CAV')).toBe(true);
    expect(matchesVersionFilter('M1963B CAV', 'M1963')).toBe(true);
  });
});

describeIfUpstream('matchesVersionFilter against live Tabulae filters', () => {
  it('agrees with Perl-style regex matching for every known transfer token', () => {
    const filters = collectLiveFilters();
    const transferNames = collectLiveTransferNames();
    for (const filter of filters) {
      for (const transferName of transferNames) {
        expect(matchesVersionFilter(filter, transferName)).toBe(
          perlStyleRegexMatch(filter, transferName)
        );
      }
    }
  });

  it('shows no divergence between regex and tokenized literal matching on live data', () => {
    const filters = collectLiveFilters();
    const transferNames = collectLiveTransferNames();
    const divergences: Array<{ filter: string; transferName: string }> = [];

    for (const filter of filters) {
      for (const transferName of transferNames) {
        if (
          perlStyleRegexMatch(filter, transferName) !==
          tokenizedLiteralMatch(filter, transferName)
        ) {
          divergences.push({ filter, transferName });
        }
      }
    }

    expect(divergences).toEqual([]);
  });
});

function collectLiveFilters(): readonly string[] {
  const transferDir = resolve(UPSTREAM_ROOT, 'Tabulae/Transfer');
  const scriptureDir = resolve(UPSTREAM_ROOT, 'Tabulae/Stransfer');
  const filters = new Set<string>();

  for (const file of readdirSorted(transferDir)) {
    const entries = parseTransfer(readFileSync(resolve(transferDir, file), 'utf8'));
    for (const entry of entries) {
      if (entry.versionFilter) {
        filters.add(entry.versionFilter);
      }
    }
  }

  for (const file of readdirSorted(scriptureDir)) {
    const entries = parseScriptureTransfer(readFileSync(resolve(scriptureDir, file), 'utf8'));
    for (const entry of entries) {
      if (entry.versionFilter) {
        filters.add(entry.versionFilter);
      }
    }
  }

  return [...filters];
}

function collectLiveTransferNames(): readonly string[] {
  const definitions = parseVersionRegistry(
    readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8')
  );
  const names = new Set<string>();
  for (const row of definitions) {
    if (row.transfer) {
      names.add(row.transfer);
    }
    if (row.stransfer) {
      names.add(row.stransfer);
    }
  }
  return [...names];
}

function perlStyleRegexMatch(filter: string, transferName: string): boolean {
  try {
    return new RegExp(transferName, 'u').test(filter);
  } catch {
    return false;
  }
}

function tokenizedLiteralMatch(filter: string, transferName: string): boolean {
  return filter.split(/\s+/u).some((token) => token.includes(transferName));
}

function readdirSorted(dir: string): readonly string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right));
}
