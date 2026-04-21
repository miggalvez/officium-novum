import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';

import { expandDeferredNodes } from '../src/resolve/expand-deferred-nodes.js';

describe('expandDeferredNodes', () => {
  it('falls through the empty Latin Revtrans shadow to the localized Gloria omission text', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Revtrans.txt',
      sections: [
        {
          header: 'Gloria omittitur',
          content: [],
          startLine: 1,
          endLine: 1
        }
      ]
    });
    index.addFile({
      path: 'horas/English/Psalterium/Common/Translate.txt',
      sections: [
        {
          header: 'Gloria omittitur',
          content: [{ type: 'text', value: 'omit Glory be' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });
    index.addFile({
      path: 'horas/Latin/Psalterium/Common/Translate.txt',
      sections: [
        {
          header: 'Gloria omittitur',
          content: [{ type: 'text', value: 'Gloria omittitur' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });

    expect(
      expandDeferredNodes([{ type: 'formulaRef', name: 'Gloria omittitur' }], {
        index,
        language: 'English',
        langfb: 'Latin',
        seen: new Set(),
        maxDepth: 4
      })
    ).toEqual([{ type: 'text', value: 'omit Glory be' }]);

    expect(
      expandDeferredNodes([{ type: 'formulaRef', name: 'Gloria omittitur' }], {
        index,
        language: 'Latin',
        langfb: 'Latin',
        seen: new Set(),
        maxDepth: 4
      })
    ).toEqual([{ type: 'text', value: 'Gloria omittitur' }]);
  });

  it('prefers a localized Revtrans entry over the Latin Translate fallback when present', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Revtrans.txt',
      sections: [
        {
          header: 'Gloria omittitur',
          content: [],
          startLine: 1,
          endLine: 1
        }
      ]
    });
    index.addFile({
      path: 'horas/English/Psalterium/Revtrans.txt',
      sections: [
        {
          header: 'Gloria omittitur',
          content: [{ type: 'text', value: 'Glory be is omitted' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });
    index.addFile({
      path: 'horas/Latin/Psalterium/Common/Translate.txt',
      sections: [
        {
          header: 'Gloria omittitur',
          content: [{ type: 'text', value: 'Gloria omittitur' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });

    expect(
      expandDeferredNodes([{ type: 'formulaRef', name: 'Gloria omittitur' }], {
        index,
        language: 'English',
        langfb: 'Latin',
        seen: new Set(),
        maxDepth: 4
      })
    ).toEqual([{ type: 'text', value: 'Glory be is omitted' }]);
  });

  it('prefers Common/Rubricae for rubrica-prefixed formulas before stripped-name prayer fallthrough', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Common/Rubricae.txt',
      sections: [
        {
          header: 'Pater totum secreto',
          content: [{ type: 'rubric', value: '« Pater Noster » dicitur totum secreto.' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });
    index.addFile({
      path: 'horas/Latin/Psalterium/Common/Prayers.txt',
      sections: [
        {
          header: 'Pater totum secreto',
          content: [
            { type: 'rubric', value: '« Pater Noster » dicitur totum secreto.' },
            { type: 'verseMarker', marker: 'v.', text: 'Pater noster, qui es in cælis...' }
          ],
          startLine: 1,
          endLine: 2
        },
        {
          header: 'Pater noster',
          content: [{ type: 'verseMarker', marker: 'v.', text: 'Pater noster, qui es in cælis...' }],
          startLine: 4,
          endLine: 4
        }
      ]
    });

    expect(
      expandDeferredNodes(
        [
          { type: 'formulaRef', name: 'rubrica Pater totum secreto' },
          { type: 'formulaRef', name: 'Pater noster' }
        ],
        {
          index,
          language: 'Latin',
          langfb: 'Latin',
          seen: new Set(),
          maxDepth: 4
        }
      )
    ).toEqual([
      { type: 'rubric', value: '« Pater Noster » dicitur totum secreto.' },
      { type: 'verseMarker', marker: 'v.', text: 'Pater noster, qui es in cælis...' }
    ]);
  });
});
