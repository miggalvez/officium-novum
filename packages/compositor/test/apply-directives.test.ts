import { describe, expect, it } from 'vitest';

import type { TextContent } from '@officium-novum/parser';
import type { HourDirective, SlotName } from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../src/directives/apply-directives.js';

function run(
  slot: SlotName,
  content: readonly TextContent[],
  directives: readonly HourDirective[],
  gloriaOmittiturReplacement?: readonly TextContent[]
): readonly TextContent[] {
  return applyDirectives(slot, content, {
    hour: 'lauds',
    directives,
    gloriaOmittiturReplacement
  });
}

describe('applyDirectives — pass-through', () => {
  it('returns the input unchanged when no directives are set', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Te lucis' }];
    expect(run('hymn', content, [])).toEqual(content);
  });
});

describe('applyDirectives — omit-gloria-patri', () => {
  it('replaces a final Gloria Patri verse-marker pair with Gloria omittitur on psalmody', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Beátus vir' },
      { type: 'separator' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      { type: 'verseMarker', marker: 'R.', text: 'Sicut erat in princípio…' }
    ];
    const out = run('psalmody', content, ['omit-gloria-patri']);
    expect(out).toEqual([
      { type: 'text', value: 'Beátus vir' },
      { type: 'separator' },
      { type: 'text', value: 'Gloria omittitur' }
    ]);
  });

  it('uses the caller-provided Gloria omittitur replacement when available', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Beátus vir' },
      { type: 'separator' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      { type: 'verseMarker', marker: 'R.', text: 'Sicut erat in princípio…' }
    ];
    const out = run('psalmody', content, ['omit-gloria-patri'], [
      { type: 'text', value: 'Glory be omitted' }
    ]);
    expect(out).toEqual([
      { type: 'text', value: 'Beátus vir' },
      { type: 'separator' },
      { type: 'text', value: 'Glory be omitted' }
    ]);
  });

  it('is a no-op on non-psalmody slots', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio.' }
    ];
    expect(run('hymn', content, ['omit-gloria-patri'])).toEqual(content);
  });
});

describe('applyDirectives — omit-responsory-gloria', () => {
  it('replaces responsory Gloria Patri with Gloria omittitur and preserves the repeat', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'R.br.', text: 'Érue a frámea, * Deus, ánimam meam.' },
      { type: 'verseMarker', marker: 'R.', text: 'Érue a frámea, * Deus, ánimam meam.' },
      { type: 'verseMarker', marker: 'V.', text: 'Et de manu canis únicam meam.' },
      { type: 'verseMarker', marker: 'R.', text: 'Deus, ánimam meam.' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      { type: 'verseMarker', marker: 'R.', text: 'Sicut erat in princípio.' },
      { type: 'verseMarker', marker: 'R.', text: 'Érue a frámea, * Deus, ánimam meam.' }
    ];

    const out = run('responsory', content, ['omit-responsory-gloria']);

    expect(out).toEqual([
      { type: 'verseMarker', marker: 'R.br.', text: 'Érue a frámea, * Deus, ánimam meam.' },
      { type: 'verseMarker', marker: 'R.', text: 'Érue a frámea, * Deus, ánimam meam.' },
      { type: 'verseMarker', marker: 'V.', text: 'Et de manu canis únicam meam.' },
      { type: 'verseMarker', marker: 'R.', text: 'Deus, ánimam meam.' },
      { type: 'text', value: 'Gloria omittitur' },
      { type: 'verseMarker', marker: 'R.', text: 'Érue a frámea, * Deus, ánimam meam.' }
    ]);
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

  it('drops an antiphon marker entirely when omit-alleluia empties its text', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'Ant.', text: 'Allelúja.' }
    ];
    const out = run('psalmody', content, ['omit-alleluia']);
    expect(out).toEqual([]);
  });

  it('appends alleluia to the final text in an antiphon slot', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Ecce sacérdos magnus' }];
    const out = run('antiphon-ad-benedictus', content, ['add-alleluia']);
    expect(out[0]).toEqual({ type: 'text', value: 'Ecce sacérdos magnus, allelúja.' });
  });

  it('on psalmody, appends alleluia to antiphons without touching Gloria responses', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Ant. Dóminus regnávit * decórem índuit' },
      { type: 'separator' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      {
        type: 'verseMarker',
        marker: 'R.',
        text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
      }
    ];
    const out = run('psalmody', content, ['add-alleluia']);
    expect(out[0]).toEqual({
      type: 'text',
      value: 'Ant. Dóminus regnávit * decórem índuit, allelúja.'
    });
    const finalLine = out[out.length - 1];
    expect(finalLine && finalLine.type === 'verseMarker' ? finalLine.text : undefined).toBe(
      'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
    );
  });

  it('on psalmody, appends alleluia before a legacy psalm payload', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'Ant.', text: 'Missus est * Gábriel Angelus;;109' }
    ];
    const out = run('psalmody', content, ['add-alleluia']);
    expect(out).toEqual([
      { type: 'verseMarker', marker: 'Ant.', text: 'Missus est * Gábriel Angelus, allelúja.;;109' }
    ]);
  });

  it('is idempotent when alleluia is already present', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Ecce sacérdos magnus, allelúja.' }];
    const out = run('antiphon-ad-benedictus', content, ['add-alleluia']);
    expect(out).toEqual(content);
  });

  it('is idempotent when alleluia is present inside a parenthetical tail', () => {
    for (const text of [
      'Missus est * Gábriel Angelus. (Allelúja.);;109',
      'Missus est * Gábriel Angelus. (Allelúja).;;109'
    ]) {
      const content: TextContent[] = [{ type: 'verseMarker', marker: 'Ant.', text }];
      const out = run('psalmody', content, ['add-alleluia']);
      expect(out).toEqual(content);
    }
  });

  it('does not append alleluia when a chapter slot is carrying an Ant. substitution', () => {
    const content: TextContent[] = [
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Hæc dies * quam fecit Dóminus: exsultémus et lætémur in ea.'
      }
    ];
    const out = run('chapter', content, ['add-alleluia']);
    expect(out).toEqual(content);
  });

  it('does not append alleluia to the bare Deo gratias chapter response', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Apoc 1:5-6' },
      { type: 'text', value: 'Jesu Christe, testis fidelis.' },
      { type: 'verseMarker', marker: 'R.', text: 'Deo grátias.' }
    ];
    const out = run('chapter', content, ['add-alleluia']);
    expect(out).toEqual(content);
  });

  it('does not append alleluia to the bare English Thanks be to God chapter response', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Wis 5:1' },
      { type: 'text', value: 'Then shall the just stand with great constancy.' },
      { type: 'verseMarker', marker: 'R.', text: 'Thanks be to God.' }
    ];
    const out = run('chapter', content, ['add-alleluia']);
    expect(out).toEqual(content);
  });

  it('add-versicle-alleluia only touches V./R. markers on versicle slots', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'V.', text: 'Deus, in adjutórium meum inténde' },
      { type: 'verseMarker', marker: 'R.', text: 'Dómine, ad adjuvándum me festína' }
    ];
    const out = run('versicle', content, ['add-versicle-alleluia']);
    expect(out).toEqual([
      { type: 'verseMarker', marker: 'V.', text: 'Deus, in adjutórium meum inténde, allelúia.' },
      { type: 'verseMarker', marker: 'R.', text: 'Dómine, ad adjuvándum me festína, allelúia.' }
    ]);
  });

  it('adds the Paschal Alleluia to inherited Matins invitatory antiphons', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Regem Vírginum Dóminum, * Veníte, adorémus.' },
      { type: 'text', value: 'Veníte, adorémus.' }
    ];
    const out = run('invitatory', content, ['matins-invitatory-paschal-alleluia']);
    expect(out).toEqual([
      {
        type: 'text',
        value: 'Regem Vírginum Dóminum, * Veníte, adorémus, allelúia.'
      },
      {
        type: 'text',
        value: 'Veníte, adorémus, allelúia.'
      }
    ]);
  });

  it('adds the Paschal Alleluia to proper Matins invitatory antiphon repeats', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'Ant.', text: 'Laudémus Deum nostrum * In confessióne beátæ Mónicæ.' },
      { type: 'verseMarker', marker: 'v.', text: 'Veníte, exsultémus Dómino.' },
      { type: 'verseMarker', marker: 'Ant.', text: 'In confessióne beátæ Mónicæ.' }
    ];
    const out = run('invitatory', content, ['matins-invitatory-paschal-alleluia']);
    expect(out).toEqual([
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Laudémus Deum nostrum * In confessióne beátæ Mónicæ, allelúia.'
      },
      { type: 'verseMarker', marker: 'v.', text: 'Veníte, exsultémus Dómino.' },
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'In confessióne beátæ Mónicæ, allelúia.'
      }
    ]);
  });

  it('flattens common short responsories into the Paschal form', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'R.br.', text: 'Spécie tua * Et pulchritúdine tua.' },
      { type: 'verseMarker', marker: 'R.', text: 'Spécie tua * Et pulchritúdine tua.' },
      { type: 'verseMarker', marker: 'V.', text: 'Inténde, próspere procéde, et regna.' },
      { type: 'verseMarker', marker: 'R.', text: 'Et pulchritúdine tua.' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      { type: 'verseMarker', marker: 'R.', text: 'Sicut erat in princípio.' },
      { type: 'verseMarker', marker: 'R.', text: 'Spécie tua * Et pulchritúdine tua.' }
    ];

    const out = run('responsory', content, ['paschal-short-responsory', 'add-versicle-alleluia']);

    expect(out).toEqual([
      {
        type: 'verseMarker',
        marker: 'R.br.',
        text: 'Spécie tua et pulchritúdine tua, * Allelúia, allelúia.'
      },
      {
        type: 'verseMarker',
        marker: 'R.',
        text: 'Spécie tua et pulchritúdine tua, * Allelúia, allelúia.'
      },
      { type: 'verseMarker', marker: 'V.', text: 'Inténde, próspere procéde, et regna.' },
      { type: 'verseMarker', marker: 'R.', text: 'Allelúia, allelúia.' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      {
        type: 'verseMarker',
        marker: 'R.',
        text: 'Spécie tua et pulchritúdine tua, * Allelúia, allelúia.'
      }
    ]);
  });

  it('synthesizes a resolved Gloria versicle without duplicating terminal punctuation', () => {
    const content: TextContent[] = [
      { type: 'verseMarker', marker: 'R.br.', text: 'Ascéndit Christus * in cælum.' },
      { type: 'verseMarker', marker: 'R.', text: 'Ascéndit Christus * in cælum.' },
      { type: 'verseMarker', marker: 'V.', text: 'Quis descéndit de cælo?' },
      { type: 'verseMarker', marker: 'R.', text: 'In cælum.' },
      { type: 'verseMarker', marker: 'R.', text: 'Ascéndit Christus * in cælum.' }
    ];

    const out = run('responsory', content, ['paschal-short-responsory']);

    expect(out).toEqual([
      {
        type: 'verseMarker',
        marker: 'R.br.',
        text: 'Ascéndit Christus in cælum, * Allelúia, allelúia.'
      },
      {
        type: 'verseMarker',
        marker: 'R.',
        text: 'Ascéndit Christus in cælum, * Allelúia, allelúia.'
      },
      { type: 'verseMarker', marker: 'V.', text: 'Quis descéndit de cælo?' },
      { type: 'verseMarker', marker: 'R.', text: 'Allelúia, allelúia.' },
      { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
      {
        type: 'verseMarker',
        marker: 'R.',
        text: 'Ascéndit Christus in cælum, * Allelúia, allelúia.'
      }
    ]);
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

describe('applyDirectives — preces / suffragium handling', () => {
  it('leaves preces slot content unchanged; directive-backed insertion happens upstream', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Kyrie eléison.' }];
    const out = run('preces', content, ['preces-feriales']);
    expect(out).toEqual(content);
  });

  it('omit-suffragium clears the suffragium slot', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Sancti Dei…' }];
    const out = run('suffragium', content, ['omit-suffragium']);
    expect(out).toEqual([]);
  });
});

describe('applyDirectives — oration-scoped rubrics', () => {
  it('does not emit spoken Flectámus génua / Leváte text for office genuflection posture', () => {
    const content: TextContent[] = [{ type: 'text', value: 'Deus, qui…' }];
    const out = run('oration', content, ['genuflection-at-oration']);
    expect(out).toEqual(content);
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
