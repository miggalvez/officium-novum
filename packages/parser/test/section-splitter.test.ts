import { describe, expect, it } from 'vitest';

import { splitSections } from '../src/parser/section-splitter.js';
import { loadFixture } from './fixture-loader.js';

describe('splitSections', () => {
  it('splits sections, captures header conditions, and creates a preamble section', async () => {
    const content = await loadFixture('simple-feast.txt');
    const sections = splitSections(content);

    expect(sections.map((section) => section.header)).toEqual([
      '__preamble',
      'Rank',
      'Oratio',
      'Commemoratio',
      'Ant Vespera'
    ]);

    expect(sections[0].lines).toEqual([
      { lineNumber: 1, text: '; Sample preamble comment' },
      { lineNumber: 2, text: '' }
    ]);

    expect(sections[3].condition).toBe('rubrica 1960');
    expect(sections[4].startLine).toBe(14);
    expect(sections[4].lines[0]).toEqual({
      lineNumber: 15,
      text: 'Antiphona prima;;109;;8G'
    });
  });

  it('does not create __preamble when the first line is a section header', async () => {
    const content = await loadFixture('psalter-entry.txt');
    const sections = splitSections(content);

    expect(sections[0].header).toBe('Day0 Laudes1');
    expect(sections.some((section) => section.header === '__preamble')).toBe(false);
  });

  it('preserves ordered line numbers within each section', async () => {
    const content = await loadFixture('conditionals.txt');
    const sections = splitSections(content);

    const versus = sections.find((section) => section.header === 'Versus');
    expect(versus).toBeDefined();
    expect(versus?.startLine).toBe(7);
    expect(versus?.lines[0]).toEqual({ lineNumber: 8, text: 'R. Deo gratias.' });
  });
});
