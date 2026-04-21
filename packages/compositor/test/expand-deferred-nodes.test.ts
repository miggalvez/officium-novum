import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';

import { expandDeferredNodes } from '../src/resolve/expand-deferred-nodes.js';

describe('expandDeferredNodes', () => {
  it('prefers the translated Gloria omission text over the empty Revtrans shadow', () => {
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
        language: 'Latin',
        langfb: 'Latin',
        seen: new Set(),
        maxDepth: 4
      })
    ).toEqual([{ type: 'text', value: 'Gloria omittitur' }]);
  });
});
