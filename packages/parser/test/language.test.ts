import { describe, expect, it } from 'vitest';

import { languageFallbackChain } from '../src/corpus/language.js';

describe('languageFallbackChain', () => {
  it('includes dashed-parent fallback before latin', () => {
    expect(languageFallbackChain('Latin-gabc')).toEqual(['Latin-gabc', 'Latin', 'la']);
    expect(languageFallbackChain('Cesky-Schaller')).toEqual(['Cesky-Schaller', 'Cesky', 'Latin', 'la']);
  });

  it('includes langfb in the chain before latin', () => {
    expect(languageFallbackChain('Magyar', { langfb: 'English' })).toEqual([
      'Magyar',
      'English',
      'Latin',
      'la'
    ]);
  });

  it('deduplicates equivalent entries case-insensitively', () => {
    expect(languageFallbackChain('latin-bea', { langfb: 'Latin' })).toEqual([
      'latin-bea',
      'latin',
      'la'
    ]);
  });
});
