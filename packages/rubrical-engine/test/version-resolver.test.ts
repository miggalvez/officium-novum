import type { VersionDefinition } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildVersionRegistry,
  describeVersion,
  resolveVersion,
  type RubricalPolicy,
  type VersionHandle
} from '../src/index.js';
import { makeTestPolicy } from './policy-fixture.js';

const TRIDENTINE: RubricalPolicy = makeTestPolicy('tridentine-1570');
const DIVINO: RubricalPolicy = makeTestPolicy('divino-afflatu');
const REDUCED: RubricalPolicy = makeTestPolicy('reduced-1955');
const R1960: RubricalPolicy = makeTestPolicy('rubrics-1960');

const TEST_DEFINITIONS: readonly VersionDefinition[] = [
  { version: 'Tridentine - 1570', kalendar: '1570', transfer: '1570', stransfer: '1570' },
  {
    version: 'Divino Afflatu - 1954',
    kalendar: '1954',
    transfer: '1954',
    stransfer: '1954',
    base: 'Divino Afflatu - 1939',
    transferBase: 'Divino Afflatu - 1939'
  },
  {
    version: 'Rubrics 1960 - 1960',
    kalendar: '1960',
    transfer: '1960',
    stransfer: '1960',
    base: 'Reduced - 1955'
  },
  { version: 'Reduced - 1955', kalendar: '1955', transfer: '1960', stransfer: 'DA' },
  // Duplicate handle — first-wins dedup should drop this.
  { version: 'Rubrics 1960 - 1960', kalendar: 'X', transfer: 'X', stransfer: 'X' }
];

const TEST_POLICY_MAP: ReadonlyMap<VersionHandle, RubricalPolicy> = new Map([
  [asVersionHandle('Tridentine - 1570'), TRIDENTINE],
  [asVersionHandle('Divino Afflatu - 1954'), DIVINO],
  [asVersionHandle('Reduced - 1955'), REDUCED],
  [asVersionHandle('Rubrics 1960 - 1960'), R1960]
]);

describe('buildVersionRegistry', () => {
  it('brands version handles and preserves data.txt fields', () => {
    const registry = buildVersionRegistry(TEST_DEFINITIONS);
    const row = registry.get(asVersionHandle('Rubrics 1960 - 1960'));
    expect(row).toBeDefined();
    expect(row?.handle).toBe('Rubrics 1960 - 1960');
    expect(row?.kalendar).toBe('1960');
    expect(row?.base).toBe('Reduced - 1955');
    expect(row?.transferBase).toBeUndefined();
  });

  it('brands base and transferBase when present', () => {
    const registry = buildVersionRegistry(TEST_DEFINITIONS);
    const row = registry.get(asVersionHandle('Divino Afflatu - 1954'));
    expect(row?.base).toBe('Divino Afflatu - 1939');
    expect(row?.transferBase).toBe('Divino Afflatu - 1939');
  });

  it('first-wins on duplicate handles', () => {
    const registry = buildVersionRegistry(TEST_DEFINITIONS);
    const row = registry.get(asVersionHandle('Rubrics 1960 - 1960'));
    // The first entry wins; the trailing `X`-field duplicate is dropped.
    expect(row?.kalendar).toBe('1960');
  });

  it('returns an empty registry for empty input', () => {
    const registry = buildVersionRegistry([]);
    expect(registry.size).toBe(0);
  });

  it('omits base / transferBase when data.txt leaves them blank', () => {
    const registry = buildVersionRegistry(TEST_DEFINITIONS);
    const row = registry.get(asVersionHandle('Tridentine - 1570'));
    expect(row?.base).toBeUndefined();
    expect(row?.transferBase).toBeUndefined();
  });
});

describe('resolveVersion', () => {
  const registry = buildVersionRegistry(TEST_DEFINITIONS);

  it('resolves a known handle with full field preservation', () => {
    const resolved = resolveVersion(
      asVersionHandle('Rubrics 1960 - 1960'),
      registry,
      TEST_POLICY_MAP
    );
    expect(resolved).toEqual({
      handle: 'Rubrics 1960 - 1960',
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960',
      base: 'Reduced - 1955',
      policy: R1960
    });
  });

  it('carries both base and transferBase through when present', () => {
    const resolved = resolveVersion(
      asVersionHandle('Divino Afflatu - 1954'),
      registry,
      TEST_POLICY_MAP
    );
    expect(resolved.base).toBe('Divino Afflatu - 1939');
    expect(resolved.transferBase).toBe('Divino Afflatu - 1939');
  });

  it('omits absent inheritance fields rather than leaving them as undefined keys', () => {
    const resolved = resolveVersion(
      asVersionHandle('Tridentine - 1570'),
      registry,
      TEST_POLICY_MAP
    );
    expect('base' in resolved).toBe(false);
    expect('transferBase' in resolved).toBe(false);
  });

  it('binds the policy object by reference', () => {
    const resolved = resolveVersion(
      asVersionHandle('Tridentine - 1570'),
      registry,
      TEST_POLICY_MAP
    );
    // Same reference, not merely equal contents — the engine uses
    // identity comparison on policies in some call paths.
    expect(resolved.policy).toBe(TRIDENTINE);
  });

  it('throws Unknown version on a handle absent from the registry', () => {
    expect(() =>
      resolveVersion(asVersionHandle('Nonexistent Version'), registry, TEST_POLICY_MAP)
    ).toThrow('Unknown version: Nonexistent Version');
  });

  it('throws No policy binding when a Breviary handle is in the registry but absent from the active policy map', () => {
    const unboundPolicyMap = new Map<VersionHandle, RubricalPolicy>([
      [asVersionHandle('Tridentine - 1570'), TRIDENTINE]
    ]);
    expect(() =>
      resolveVersion(asVersionHandle('Rubrics 1960 - 1960'), registry, unboundPolicyMap)
    ).toThrow('No policy binding for version: Rubrics 1960 - 1960');
  });

  it('throws No policy binding for a future Breviary row that is not yet mapped to a policy', () => {
    const futureRegistry = buildVersionRegistry([
      ...TEST_DEFINITIONS,
      {
        version: 'Future Breviary - 2099',
        kalendar: '2099',
        transfer: '2099',
        stransfer: '2099'
      }
    ]);
    expect(() =>
      resolveVersion(asVersionHandle('Future Breviary - 2099'), futureRegistry, TEST_POLICY_MAP)
    ).toThrow('No policy binding for version: Future Breviary - 2099');
  });
});

describe('describeVersion', () => {
  const registry = buildVersionRegistry(TEST_DEFINITIONS);

  it('projects ResolvedVersion to a serialization-safe VersionDescriptor', () => {
    const resolved = resolveVersion(
      asVersionHandle('Rubrics 1960 - 1960'),
      registry,
      TEST_POLICY_MAP
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

  it('does not expose the live policy object', () => {
    const resolved = resolveVersion(
      asVersionHandle('Tridentine - 1570'),
      registry,
      TEST_POLICY_MAP
    );
    const descriptor = describeVersion(resolved);
    expect('policy' in descriptor).toBe(false);
    expect(descriptor.policyName).toBe('tridentine-1570');
  });

  it('preserves both inheritance fields when both are set', () => {
    const resolved = resolveVersion(
      asVersionHandle('Divino Afflatu - 1954'),
      registry,
      TEST_POLICY_MAP
    );
    const descriptor = describeVersion(resolved);
    expect(descriptor.base).toBe('Divino Afflatu - 1939');
    expect(descriptor.transferBase).toBe('Divino Afflatu - 1939');
  });

  it('omits absent inheritance fields in the descriptor as well', () => {
    const resolved = resolveVersion(
      asVersionHandle('Tridentine - 1570'),
      registry,
      TEST_POLICY_MAP
    );
    const descriptor = describeVersion(resolved);
    expect('base' in descriptor).toBe(false);
    expect('transferBase' in descriptor).toBe(false);
  });
});
