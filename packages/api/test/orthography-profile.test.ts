import { describe, expect, it } from 'vitest';

import { resolveOrthographyProfile } from '../src/services/orthography-profile.js';

describe('orthography profile', () => {
  it('defaults to the version profile', () => {
    expect(resolveOrthographyProfile(undefined)).toBe('version');
  });

  it('accepts source and version only', () => {
    expect(resolveOrthographyProfile('source')).toBe('source');
    expect(resolveOrthographyProfile('version')).toBe('version');
    expect(() => resolveOrthographyProfile('legacy')).toThrow('Expected "source" or "version".');
  });
});
