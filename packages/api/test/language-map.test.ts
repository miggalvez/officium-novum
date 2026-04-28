import { describe, expect, it } from 'vitest';

import { buildLanguageRegistry, resolveLanguages } from '../src/services/language-map.js';

describe('language map', () => {
  it('maps public tags to corpus language names', () => {
    const selection = resolveLanguages({
      lang: 'la,en',
      langfb: 'en',
      registry: buildLanguageRegistry()
    });

    expect(selection.publicTags).toEqual(['la', 'en']);
    expect(selection.corpusNames).toEqual(['Latin', 'English']);
    expect(selection.publicFallback).toBe('en');
    expect(selection.corpusFallback).toBe('English');
    expect(selection.toPublic.get('Latin')).toBe('la');
  });

  it('rejects unsupported language tags', () => {
    expect(() =>
      resolveLanguages({
        lang: 'es',
        registry: buildLanguageRegistry()
      })
    ).toThrow('Unsupported language: es');
  });
});
