import { describe, expect, it } from 'vitest';

import type { TextContent } from '@officium-novum/parser';
import type { HourDirective, SlotName } from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../src/directives/apply-directives.js';

function run(
  slot: SlotName,
  content: readonly TextContent[],
  directives: readonly HourDirective[]
): readonly TextContent[] {
  return applyDirectives(slot, content, { hour: 'lauds', directives });
}

describe('applyDirectives — pass-through', () => {
  it('returns the input unchanged when no directives are set', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Te lucis' }];
    expect(run('hymn', content, [])).toEqual(content);
  });
});

describe('applyDirectives — omit-gloria-patri', () => {
  it('drops a final Gloria Patri verse-marker pair on psalmody', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Beátus vir' },
      { type: 'separator' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      { type: 'verseMarker', marker: 'R.', text: 'Sicut erat in princípio…' }
    ];
    const out = run('psalmody', content, ['omit-gloria-patri']);
    expect(out.map((n) => (n.type === 'text' ? n.value : n.type))).toEqual(['Beátus vir']);
  });

  it('is a no-op on non-psalmody slots', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio.' }
    ];
    expect(run('hymn', content, ['omit-gloria-patri'])).toEqual(content);
  });
});

describe('applyDirectives — omit-alleluia / add-alleluia', () => {
  it('strips trailing alleluia from antiphon text', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Ecce sacérdos magnus, allelúja.' }
    ];
    const out = run('antiphon-ad-benedictus', content, ['omit-alleluia']);
    expect(out).toEqual([{ type: 'text', value: 'Ecce sacérdos magnus' }]);
  });

  it('appends alleluia to the final text in an antiphon slot', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Ecce sacérdos magnus' }];
    const out = run('antiphon-ad-benedictus', content, ['add-alleluia']);
    expect(out[0]).toEqual({ type: 'text', value: 'Ecce sacérdos magnus, allelúja.' });
  });

  it('is idempotent when alleluia is already present', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Ecce sacérdos magnus, allelúja.' }];
    const out = run('antiphon-ad-benedictus', content, ['add-alleluia']);
    expect(out).toEqual(content);
  });

  it('add-versicle-alleluia only touches V./R. markers on versicle slots', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'V.', text: 'Deus, in adjutórium meum inténde' },
      { type: 'verseMarker', marker: 'R.', text: 'Dómine, ad adjuvándum me festína' }
    ];
    const out = run('versicle', content, ['add-versicle-alleluia']);
    const last = out[out.length - 1];
    expect(last && last.type === 'verseMarker' ? last.text : undefined).toMatch(/allel[úu]ja, allel[úu]ja\./u);
  });
});

describe('applyDirectives — short-chapter-only', () => {
  it('clips at the first separator on a chapter slot', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Fratres: Benedíctus Deus.' },
      { type: 'separator' },
      { type: 'verseMarker', marker: 'R.br.', text: 'Deo grátias.' }
    ];
    const out = run('chapter', content, ['short-chapter-only']);
    expect(out).toEqual([{ type: 'text', value: 'Fratres: Benedíctus Deus.' }]);
  });

  it('clips at an R.br. verse marker even without a separator', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Fratres: Benedíctus Deus.' },
      { type: 'verseMarker', marker: 'R.br.', text: 'Deo grátias.' }
    ];
    const out = run('chapter', content, ['short-chapter-only']);
    expect(out).toEqual([{ type: 'text', value: 'Fratres: Benedíctus Deus.' }]);
  });
});

describe('applyDirectives — preces / suffragium banners', () => {
  it('prepends a preces-feriales rubric banner on the preces slot only', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Kyrie eléison.' }];
    const out = run('preces', content, ['preces-feriales']);
    expect(out[0]).toEqual({ type: 'rubric', value: 'Preces feriales' });
    expect(out.slice(1)).toEqual(content);

    const notPreces = run('hymn', content, ['preces-feriales']);
    expect(notPreces).toEqual(content);
  });

  it('omit-suffragium clears the suffragium slot', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Sancti Dei…' }];
    const out = run('suffragium', content, ['omit-suffragium']);
    expect(out).toEqual([]);
  });
});

describe('applyDirectives — oration-scoped rubrics', () => {
  it('wraps the oration with Flectámus génua / Leváte for genuflection', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Deus, qui…' }];
    const out = run('oration', content, ['genuflection-at-oration']);
    expect(out).toEqual([
      { type: 'rubric', value: 'Flectámus génua.' },
      { type: 'text', value: 'Deus, qui…' },
      { type: 'rubric', value: 'Leváte.' }
    ]);
  });

  it('dirge-vespers adds a Pro defunctis banner to the oration', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Deus veniæ…' }];
    const out = applyDirectives('oration', content, {
      hour: 'vespers',
      directives: ['dirge-vespers']
    });
    expect(out[0]).toEqual({
      type: 'rubric',
      value: 'Pro defunctis — Vesperæ defunctorum'
    });
  });
});
