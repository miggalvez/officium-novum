import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseVersionRegistry } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  asVersionHandle,
  buildVersionRegistry,
  describeVersion,
  resolveVersion
} from '../../src/index.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

/**
 * Every Breviary {@link VersionHandle} in `Tabulae/data.txt`, mapped to the
 * {@link PolicyName} it's expected to resolve to. Every Breviary row in
 * `data.txt` must appear here — if a row is missing, the engine has a
 * contract break (it would reject a valid input). If either side of the
 * map changes, this table is the single place to update.
 */
const EXPECTED_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ['Tridentine - 1570', 'tridentine-1570'],
  ['Tridentine - 1888', 'tridentine-1570'],
  ['Tridentine - 1906', 'tridentine-1570'],
  ['Divino Afflatu - 1939', 'divino-afflatu'],
  ['Divino Afflatu - 1954', 'divino-afflatu'],
  ['Reduced - 1955', 'reduced-1955'],
  ['Rubrics 1960 - 1960', 'rubrics-1960'],
  ['Rubrics 1960 - 2020 USA', 'rubrics-1960'],
  ['Monastic Tridentinum 1617', 'monastic-tridentine'],
  ['Monastic Divino 1930', 'monastic-divino'],
  ['Monastic - 1963', 'monastic-1963'],
  ['Monastic - 1963 - Barroux', 'monastic-1963'],
  ['Monastic Tridentinum Cisterciensis 1951', 'cistercian-1951'],
  ['Monastic Tridentinum Cisterciensis Altovadensis', 'cistercian-altovadense'],
  ['Ordo Praedicatorum - 1962', 'dominican-1962']
];

/**
 * Missa-only handles that have a Breviary-side equivalent in `data.txt`.
 * Resolving them must throw with a hint pointing at the canonical handle.
 */
const MISSA_WITH_HINT: ReadonlyArray<readonly [string, string]> = [
  ['Tridentine 1570', 'Tridentine - 1570'],
  ['Tridentine 1910', 'Tridentine - 1906'],
  ['Tridentine - 1910', 'Tridentine - 1906'],
  ['Divino Afflatu', 'Divino Afflatu - 1954'],
  ['Reduced 1955', 'Reduced - 1955'],
  ['Rubrics 1960', 'Rubrics 1960 - 1960'],
  ['1960 Newcalendar', 'Rubrics 1960 - 2020 USA'],
  ['Rubrics 1960 Newcalendar', 'Rubrics 1960 - 2020 USA'],
  ['Ordo Praedicatorum Dominican 1962', 'Ordo Praedicatorum - 1962']
];

/**
 * Missa-only handles that have no Breviary counterpart. These reject with
 * the generic "not supported" message.
 */
const MISSA_WITHOUT_HINT: readonly string[] = [
  '1965-1967',
  'Mozarabic',
  'Sarum',
  'Ambrosian',
  'Dominican',
  'Rubrics 1967',
  'New Mass'
];

describeIfUpstream('version registry + resolver against upstream data.txt', () => {
  async function loadLiveRegistry() {
    const content = await readFile(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8');
    const definitions = parseVersionRegistry(content);
    return { definitions, registry: buildVersionRegistry(definitions) };
  }

  it('parses every row of data.txt without losing any Breviary version', async () => {
    const { definitions } = await loadLiveRegistry();
    const names = new Set(definitions.map((d) => d.version));
    for (const [handle] of EXPECTED_BINDINGS) {
      expect(names.has(handle)).toBe(true);
    }
  });

  it.each(EXPECTED_BINDINGS)(
    'resolves Breviary handle %s to policy %s',
    async (handle, expectedPolicyName) => {
      const { registry } = await loadLiveRegistry();
      const resolved = resolveVersion(
        asVersionHandle(handle),
        registry,
        VERSION_POLICY
      );
      expect(resolved.policy.name).toBe(expectedPolicyName);
      expect(resolved.handle).toBe(handle);
      // Every resolved version must carry non-empty kalendar / transfer / stransfer;
      // `data.txt` never leaves these blank for live rows.
      expect(resolved.kalendar.length).toBeGreaterThan(0);
      expect(resolved.transfer.length).toBeGreaterThan(0);
      expect(resolved.stransfer.length).toBeGreaterThan(0);
    }
  );

  it('resolves Rubrics 1960 - 1960 with the expected inheritance chain', async () => {
    const { registry } = await loadLiveRegistry();
    const resolved = resolveVersion(
      asVersionHandle('Rubrics 1960 - 1960'),
      registry,
      VERSION_POLICY
    );
    expect(resolved.kalendar).toBe('1960');
    expect(resolved.transfer).toBe('1960');
    expect(resolved.stransfer).toBe('1960');
    expect(resolved.base).toBe('Reduced - 1955');
    expect(resolved.transferBase).toBeUndefined();
  });

  it('resolves Divino Afflatu - 1954 with both base and transferBase populated', async () => {
    const { registry } = await loadLiveRegistry();
    const resolved = resolveVersion(
      asVersionHandle('Divino Afflatu - 1954'),
      registry,
      VERSION_POLICY
    );
    expect(resolved.base).toBe('Divino Afflatu - 1939');
    expect(resolved.transferBase).toBe('Divino Afflatu - 1939');
  });

  it.each(MISSA_WITH_HINT)(
    'rejects missa-only handle %s with a hint pointing at Breviary handle %s',
    async (handle, expectedHint) => {
      const { registry } = await loadLiveRegistry();
      expect(() =>
        resolveVersion(asVersionHandle(handle), registry, VERSION_POLICY)
      ).toThrow(
        `Version '${handle}' is a Mass-only identifier; use '${expectedHint}' for the Breviary.`
      );
    }
  );

  it.each(MISSA_WITHOUT_HINT)(
    'rejects missa-only handle %s with the generic not-supported message',
    async (handle) => {
      const { registry } = await loadLiveRegistry();
      expect(() =>
        resolveVersion(asVersionHandle(handle), registry, VERSION_POLICY)
      ).toThrow(
        `Version '${handle}' is not supported by the Roman Breviary engine.`
      );
    }
  );

  it('throws Unknown version for a handle not present in data.txt', async () => {
    const { registry } = await loadLiveRegistry();
    expect(() =>
      resolveVersion(
        asVersionHandle('Utterly Invented - 9999'),
        registry,
        VERSION_POLICY
      )
    ).toThrow('Unknown version: Utterly Invented - 9999');
  });

  it('projects Rubrics 1960 - 1960 to a clean VersionDescriptor', async () => {
    const { registry } = await loadLiveRegistry();
    const resolved = resolveVersion(
      asVersionHandle('Rubrics 1960 - 1960'),
      registry,
      VERSION_POLICY
    );
    const descriptor = describeVersion(resolved);
    expect(descriptor).toEqual({
      handle: 'Rubrics 1960 - 1960',
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960',
      base: 'Reduced - 1955',
      policyName: 'rubrics-1960'
    });
  });

  it('resolves all three previously-unbound monastic handles to distinct policies', async () => {
    const { registry } = await loadLiveRegistry();
    const m1617 = resolveVersion(
      asVersionHandle('Monastic Tridentinum 1617'),
      registry,
      VERSION_POLICY
    );
    const m1930 = resolveVersion(
      asVersionHandle('Monastic Divino 1930'),
      registry,
      VERSION_POLICY
    );
    const cav = resolveVersion(
      asVersionHandle('Monastic Tridentinum Cisterciensis Altovadensis'),
      registry,
      VERSION_POLICY
    );
    expect(m1617.policy.name).toBe('monastic-tridentine');
    expect(m1930.policy.name).toBe('monastic-divino');
    expect(cav.policy.name).toBe('cistercian-altovadense');
    // Distinct traditions → distinct policy names. Collapse is easy later if research warrants.
    const names = new Set([m1617.policy.name, m1930.policy.name, cav.policy.name]);
    expect(names.size).toBe(3);
  });
});
