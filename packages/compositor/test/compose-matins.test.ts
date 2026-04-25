import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile } from '@officium-novum/parser';
import type {
  DayOfficeSummary,
  HourStructure,
  ResolvedVersion
} from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';
import { slicePsalmContentByVerseRange } from '../src/compose/matins-psalmody.js';

function makeFile(path: string, header: string, nodes: ParsedFile['sections'][number]['content']): ParsedFile {
  return {
    path: `${path}.txt`,
    sections: [{ header, content: nodes, startLine: 1, endLine: 1 }]
  };
}

function makeFileMulti(
  path: string,
  sections: readonly { header: string; content: ParsedFile['sections'][number]['content'] }[]
): ParsedFile {
  return {
    path: `${path}.txt`,
    sections: sections.map((s) => ({
      header: s.header,
      content: s.content,
      startLine: 1,
      endLine: 1
    }))
  };
}

const stubVersion: ResolvedVersion = {
  handle: 'Rubrics 1960 - 1960' as never,
  kalendar: 'General-1960',
  transfer: 'General-1960',
  stransfer: 'General-1960',
  policy: {} as never
};

const reducedVersion: ResolvedVersion = {
  handle: 'Reduced - 1955' as never,
  kalendar: 'General-1955',
  transfer: 'General-1955',
  stransfer: 'General-1955',
  policy: {} as never
};

function buildSummary(hour: HourStructure): DayOfficeSummary {
  return {
    date: '2024-04-14',
    version: {
      handle: stubVersion.handle,
      kalendar: stubVersion.kalendar,
      transfer: stubVersion.transfer,
      stransfer: stubVersion.stransfer,
      policyName: 'rubrics-1960'
    },
    temporal: {
      date: '2024-04-14',
      dayOfWeek: 0,
      weekStem: 'Pasc',
      dayName: 'Dominica in Albis',
      season: 'eastertide',
      feastRef: { path: 'horas/Latin/Tempora/Pasc1-0', sectionRef: undefined } as never,
      rank: {} as never
    },
    warnings: [],
    celebration: { feastRef: { title: 'Dominica in Albis' } } as never,
    celebrationRules: {} as never,
    commemorations: [],
    concurrence: {} as never,
    compline: {} as never,
    hours: { [hour.hour]: hour },
    candidates: [],
    winner: {} as never
  };
}

function buildSummaryForVersion(
  hour: HourStructure,
  version: ResolvedVersion,
  temporalOverrides: Partial<DayOfficeSummary['temporal']> = {}
): DayOfficeSummary {
  const summary = buildSummary(hour);
  return {
    ...summary,
    version: {
      handle: version.handle,
      kalendar: version.kalendar,
      transfer: version.transfer,
      stransfer: version.stransfer,
      policyName: String(version.handle).includes('1955') ? 'reduced-1955' : 'rubrics-1960'
    },
    temporal: {
      ...summary.temporal,
      ...temporalOverrides
    }
  };
}

function renderRuns(
  line: { texts: Readonly<Record<string, readonly { type: string }[]>> },
  language: string
): string {
  const runs = line.texts[language] ?? [];
  return runs
    .map((run) => {
      switch (run.type) {
        case 'text':
        case 'rubric':
        case 'citation':
          return (run as { value: string }).value;
        case 'unresolved-macro':
          return `&${(run as { name: string }).name}`;
        case 'unresolved-formula':
          return `$${(run as { name: string }).name}`;
        case 'unresolved-reference':
          return '@';
        default:
          return '';
      }
    })
    .join('');
}

describe('composeHour(matins)', () => {
  it('applies Matins hymn doxology variants to feast hymns', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C11', 'Hymnus Matutinum', [
        { type: 'text', value: 'Quem terra, pontus, æthera' },
        { type: 'separator' },
        { type: 'text', value: '* Jesu, tibi sit glória,' },
        { type: 'text', value: 'Qui natus es de Vírgine,' },
        { type: 'text', value: 'Cum Patre, et almo Spíritu,' },
        { type: 'text', value: 'In sempitérna sǽcula.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Doxologies', 'Nat', [
        { type: 'text', value: 'Jesu, tibi sit glória,' },
        { type: 'text', value: 'Qui natus es de Vírgine,' },
        { type: 'text', value: 'Cum Patre et almo Spíritu,' },
        { type: 'text', value: 'In sempitérna sǽcula.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C11', section: 'Hymnus Matutinum' }
        },
        'doxology-variant': {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Psalterium/Doxologies', section: 'Nat' }
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummaryForVersion(hour, reducedVersion),
      version: reducedVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });
    const rendered = composed.sections.flatMap((section) =>
      section.lines.map((line) => renderRuns(line, 'Latin'))
    );

    expect(rendered).toContain('Cum Patre et almo Spíritu,');
    expect(rendered).not.toContain('Cum Patre, et almo Spíritu,');
  });

  it('emits the fixed invitatory psalm with feast antiphon repetitions, then nocturn heading, psalmody, lectio, responsory, and Te Deum', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Invitatorium', '__preamble', [
        { type: 'formulaRef', name: 'ant' },
        { type: 'formulaRef', name: 'ant' },
        { type: 'verseMarker', marker: 'v.', text: 'Veníte, exsultémus Dómino.' },
        { type: 'formulaRef', name: 'ant2' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Sancti/04-14', 'Invit', [
        { type: 'text', value: 'Christus surréxit, * veníte adorémus.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Antiphona 1', 'Antiphona 1', [
        { type: 'text', value: 'Alleluia, alleluia, alleluia.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalms/Psalm1', 'Psalmus 1', [
        { type: 'text', value: 'Beátus vir' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Surréxit Dóminus vere' }
      ])
    );
    corpus.addFile(
      makeFileMulti('horas/Latin/Tempora/Pasc1-0', [
        { header: 'Lectio1', content: [{ type: 'text', value: 'Lectio prima paschalis' }] },
        {
          header: 'Responsory1',
          content: [{ type: 'verseMarker', marker: 'R.', text: 'Surréxit Dóminus.' }]
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Te Deum', [
        { type: 'text', value: 'Te Deum laudámus.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        invitatory: {
          kind: 'matins-invitatorium',
          source: {
            kind: 'feast',
            reference: { path: 'horas/Latin/Sancti/04-14', section: 'Invit' }
          }
        },
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalms/Psalm1',
                    section: 'Psalmus 1'
                  },
                  antiphonRef: {
                    path: 'horas/Latin/Ordinarium/MatutinumM1 Antiphona 1',
                    section: 'Antiphona 1'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Ordinarium/MatutinumM1 Antiphona 1',
                    section: 'Antiphona 1'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [
                {
                  index: 1,
                  source: {
                    kind: 'patristic',
                    reference: { path: 'horas/Latin/Tempora/Pasc1-0', section: 'Lectio1' }
                  }
                }
              ],
              responsories: [
                {
                  index: 1,
                  reference: { path: 'horas/Latin/Tempora/Pasc1-0', section: 'Responsory1' }
                }
              ],
              benedictions: []
            }
          ]
        },
        'te-deum': { kind: 'te-deum', decision: 'say' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const slots = composed.sections.map((s) => s.slot);
    expect(slots).toEqual([
      'invitatory',
      'heading',
      'psalmody',
      'versicle',
      'heading',
      'lectio-brevis',
      'responsory',
      'te-deum'
    ]);

    expect(composed.sections[0]!.lines.map((line) => `${line.marker ?? '-'} ${renderRuns(line, 'Latin')}`)).toEqual([
      'Ant. Christus surréxit, * veníte adorémus.',
      'Ant. Christus surréxit, * veníte adorémus.',
      'v. Veníte, exsultémus Dómino.',
      'Ant. veníte adorémus.'
    ]);
    expect(composed.sections[1]!.heading).toEqual({ kind: 'nocturn', ordinal: 1 });
    expect(composed.sections[1]!.lines).toEqual([]);
    expect(composed.sections[4]!.heading).toEqual({ kind: 'lesson', ordinal: 1 });
    expect(renderRuns(composed.sections.at(-1)!.lines[0]!, 'Latin')).toBe('Te Deum laudámus.');
  });

  it('suppresses Te Deum output when the plan decides replace-with-responsory', () => {
    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        invitatory: {
          kind: 'matins-invitatorium',
          source: { kind: 'suppressed' }
        },
        psalmody: { kind: 'matins-nocturns', nocturns: [] },
        'te-deum': { kind: 'te-deum', decision: 'replace-with-responsory' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus: new InMemoryTextIndex(),
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const teDeum = composed.sections.find((s) => s.slot === 'te-deum');
    expect(teDeum).toBeUndefined();
  });

  it('strips invitatory division markers from Psalm 94 verses while preserving antiphon stars', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Invitatorium', '__preamble', [
        { type: 'formulaRef', name: 'ant' },
        {
          type: 'verseMarker',
          marker: 'v.',
          text: 'Veníte, exsultémus Dómino, + jubilémus Deo, salutári nostro: * præoccupémus fáciem ejus in confessióne.'
        },
        { type: 'formulaRef', name: 'ant2' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Special/Matutinum Special', 'Invit Pasch', [
        { type: 'text', value: 'Surréxit Dóminus vere, * Allelúja.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        invitatory: {
          kind: 'matins-invitatorium',
          source: {
            kind: 'season',
            reference: {
              path: 'horas/Latin/Psalterium/Invitatorium',
              section: '__preamble',
              selector: 'Pascha'
            }
          }
        },
        psalmody: { kind: 'matins-nocturns', nocturns: [] },
        'te-deum': { kind: 'te-deum', decision: 'omit' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    expect(
      composed.sections[0]!.lines.map((line) => `${line.marker ?? '-'} ${renderRuns(line, 'Latin')}`)
    ).toEqual([
      'Ant. Surréxit Dóminus vere, * Allelúja.',
      'v. Veníte, exsultémus Dómino, jubilémus Deo, salutári nostro: præoccupémus fáciem ejus in confessióne.',
      'Ant. Allelúja.'
    ]);
  });

  it('skips invitatorium when the plan marks it suppressed', () => {
    const corpus = new InMemoryTextIndex();
    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        invitatory: {
          kind: 'matins-invitatorium',
          source: { kind: 'suppressed' }
        },
        psalmody: { kind: 'matins-nocturns', nocturns: [] },
        'te-deum': { kind: 'te-deum', decision: 'omit' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections).toHaveLength(0);
  });

  it('keeps standalone antiphons when they share a file path but not a section', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFileMulti('horas/Latin/Ordinarium/Shared Antiphons', [
        {
          header: 'Antiphona 1',
          content: [{ type: 'text', value: 'Antiphona prima' }]
        },
        {
          header: 'Antiphona 2',
          content: [{ type: 'text', value: 'Antiphona secunda' }]
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalms/Psalm1', 'Psalmus 1', [
        { type: 'text', value: 'Beátus vir' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Versus nocturni' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
        {
          type: 'verseMarker',
          marker: 'R.',
          text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  antiphonRef: {
                    path: 'horas/Latin/Ordinarium/Shared Antiphons',
                    section: 'Antiphona 1'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalms/Psalm1',
                    section: 'Psalmus 1'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Ordinarium/Shared Antiphons',
                    section: 'Antiphona 2'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const standaloneAntiphon = composed.sections.find((section) => section.slot === 'antiphon-ad-benedictus');
    expect(standaloneAntiphon).toBeDefined();
    expect(renderRuns(standaloneAntiphon!.lines[0]!, 'Latin')).toBe('Antiphona secunda');
  });

  it('uses only the inline antiphon from Matins selector refs and emits the psalm heading once', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi/Psalmi matutinum', 'Day0', [
        {
          type: 'psalmRef',
          psalmNumber: 1,
          antiphon: 'Beátus vir * qui in lege Dómini meditátur.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm1', '__preamble', [
        {
          type: 'text',
          value:
            '1:1 Beátus vir, qui non ábiit in consílio impiórum, † et in via peccatórum non stetit, * et in cáthedra pestiléntiæ non sedit:'
        },
        {
          type: 'text',
          value: '1:2 Sed in lege Dómini volúntas ejus, * et in lege ejus meditábitur die ac nocte.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Versus nocturni' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
        {
          type: 'verseMarker',
          marker: 'R.',
          text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  antiphonRef: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm1',
                    section: '__preamble'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
    expect(psalmody).toBeDefined();
    expect(psalmody!.lines.map((line) => `${line.marker ?? '-'} ${renderRuns(line, 'Latin')}`)).toEqual([
      'Ant. Beátus vir * qui in lege Dómini meditátur.',
      '- Psalmus 1 [1]',
      '- 1:1 Beátus vir, qui non ábiit in consílio impiórum, et in via peccatórum non stetit, * et in cáthedra pestiléntiæ non sedit:',
      '- 1:2 Sed in lege Dómini volúntas ejus, * et in lege ejus meditábitur die ac nocte.',
      'V. Glória Patri, et Fílio, * et Spirítui Sancto.',
      'R. Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
      'Ant. Beátus vir qui in lege Dómini meditátur.'
    ]);
  });

  it('shortens the opening Matins antiphon repeat for pre-1960 psalter Matins and carries the continuation marker into the first verse', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi/Psalmi matutinum', 'Day0', [
        {
          type: 'psalmRef',
          psalmNumber: 1,
          antiphon: 'Beátus vir * qui in lege Dómini meditátur.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm1', '__preamble', [
        {
          type: 'text',
          value:
            '1:1 Beátus vir, qui non ábiit in consílio impiórum, † et in via peccatórum non stetit, * et in cáthedra pestiléntiæ non sedit:'
        },
        {
          type: 'text',
          value: '1:2 Sed in lege Dómini volúntas ejus, * et in lege ejus meditábitur die ac nocte.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Versus nocturni' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
        {
          type: 'verseMarker',
          marker: 'R.',
          text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  antiphonRef: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm1',
                    section: '__preamble'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummaryForVersion(hour, reducedVersion),
      version: reducedVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
    expect(psalmody).toBeDefined();
    expect(psalmody!.lines.map((line) => `${line.marker ?? '-'} ${renderRuns(line, 'Latin')}`)).toEqual([
      'Ant. Beátus vir. ‡',
      '- Psalmus 1 [1]',
      '- 1:1 Beátus vir, ‡ qui non ábiit in consílio impiórum, et in via peccatórum non stetit, * et in cáthedra pestiléntiæ non sedit:',
      '- 1:2 Sed in lege Dómini volúntas ejus, * et in lege ejus meditábitur die ac nocte.',
      'V. Glória Patri, et Fílio, * et Spirítui Sancto.',
      'R. Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
      'Ant. Beátus vir qui in lege Dómini meditátur.'
    ]);
  });

  it('strips selector trailers from Matins inline antiphons before opening and closing normalization', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi/Psalmi matutinum', 'Day0', [
        {
          type: 'psalmRef',
          psalmNumber: 104,
          antiphon: 'Memor fuit in sǽculum * testaménti sui Dóminus Deus noster.;;104(1-15)'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm104', '__preamble', [
        {
          type: 'text',
          value: '104:1 Confitémini Dómino, et invocáte nomen ejus: annuntiáte inter gentes ópera ejus.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Versus nocturni' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
        {
          type: 'verseMarker',
          marker: 'R.',
          text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  antiphonRef: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm104',
                    section: '__preamble'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummaryForVersion(hour, reducedVersion),
      version: reducedVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
    expect(psalmody).toBeDefined();
    const rendered = psalmody!.lines.map((line) => `${line.marker ?? '-'} ${renderRuns(line, 'Latin')}`);
    expect(rendered[0]).toBe('Ant. Memor fuit in sǽculum.');
    expect(rendered.at(-1)).toBe('Ant. Memor fuit in sǽculum testaménti sui Dóminus Deus noster.');
    expect(rendered.join('\n')).not.toContain(';;104(1-15)');
  });

  it('uses the paired Matins antiphon selector to slice split psalms before reopening the next segment', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi/Psalmi matutinum', 'Day0', [
        {
          type: 'psalmRef',
          psalmNumber: 9,
          antiphon: 'Sedísti super thronum * qui júdicas justítiam.;;9(2-11)'
        },
        {
          type: 'psalmRef',
          psalmNumber: 9,
          antiphon: 'Exsúrge, Dómine, * non præváleat homo.;;9(12-21)'
        }
      ])
    );
    corpus.addFile(
      makeFile(
        'horas/Latin/Psalterium/Psalmorum/Psalm9',
        '__preamble',
        Array.from({ length: 20 }, (_, index) => ({
          type: 'text' as const,
          value: `9:${index + 2} Verse ${index + 2}`
        }))
      )
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Versus nocturni' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
        {
          type: 'verseMarker',
          marker: 'R.',
          text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  antiphonRef: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm9',
                    section: '__preamble'
                  }
                },
                {
                  antiphonRef: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '2'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm9',
                    section: '__preamble'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '1'
                  }
                },
                {
                  index: 2,
                  reference: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day0',
                    selector: '2'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
    expect(psalmody).toBeDefined();
    const lines = psalmody!.lines.map((line) => `${line.marker ?? '-'} ${renderRuns(line, 'Latin')}`);
    const secondHeadingIndex = lines.indexOf('- Psalmus 9(12-21) [2]');
    expect(secondHeadingIndex).toBeGreaterThan(0);
    expect(lines.slice(secondHeadingIndex - 5, secondHeadingIndex + 2)).toEqual([
      '- 9:11 Verse 11',
      'V. Glória Patri, et Fílio, * et Spirítui Sancto.',
      'R. Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
      'Ant. Sedísti super thronum qui júdicas justítiam.',
      'Ant. Exsúrge, Dómine, * non præváleat homo.',
      '- Psalmus 9(12-21) [2]',
      '- 9:12 Verse 12'
    ]);
  });

  it('uses alphanumeric paired Matins antiphon ranges to split repeated psalms at verse boundaries', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi/Psalmi matutinum', 'Day3', [
        {
          type: 'psalmRef',
          psalmNumber: 44,
          antiphon: 'Speciósus forma * præ fíliis hóminum, diffúsa est grátia in lábiis tuis.;;44(2a-10b)'
        },
        {
          type: 'psalmRef',
          psalmNumber: 44,
          antiphon: 'Confitebúntur tibi * pópuli Deus in ætérnum.;;44(11-18b)'
        }
      ])
    );
    corpus.addFile(
      makeFile(
        'horas/Latin/Psalterium/Psalmorum/Psalm44',
        '__preamble',
        Array.from({ length: 17 }, (_, index) => ({
          type: 'text' as const,
          value: `44:${index + 2} Verse ${index + 2}`
        }))
      )
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Versus nocturni' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
        {
          type: 'verseMarker',
          marker: 'R.',
          text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  antiphonRef: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day3',
                    selector: '1'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm44',
                    section: '__preamble'
                  }
                },
                {
                  antiphonRef: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day3',
                    selector: '2'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm44',
                    section: '__preamble'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day3',
                    selector: '1'
                  }
                },
                {
                  index: 2,
                  reference: {
                    path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
                    section: 'Day3',
                    selector: '2'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
    expect(psalmody).toBeDefined();
    const lines = psalmody!.lines.map((line) => `${line.marker ?? '-'} ${renderRuns(line, 'Latin')}`);
    const secondHeadingIndex = lines.indexOf('- Psalmus 44(11-18b) [2]');
    expect(secondHeadingIndex).toBeGreaterThan(0);
    expect(lines.slice(secondHeadingIndex - 5, secondHeadingIndex + 2)).toEqual([
      '- 44:10 Verse 10',
      'V. Glória Patri, et Fílio, * et Spirítui Sancto.',
      'R. Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
      'Ant. Speciósus forma præ fíliis hóminum, diffúsa est grátia in lábiis tuis.',
      'Ant. Confitebúntur tibi * pópuli Deus in ætérnum.',
      '- Psalmus 44(11-18b) [2]',
      '- 44:11 Verse 11'
    ]);
  });

  it('honors half-verse suffixes when slicing Matins psalm ranges', () => {
    const sliced = slicePsalmContentByVerseRange(
      [
        { type: 'rubric', value: 'Psalm heading' },
        { type: 'text', value: '44:2a First half of verse 2.' },
        { type: 'text', value: '44:2b Second half of verse 2.' },
        { type: 'text', value: '44:3 Full verse 3.' },
        { type: 'text', value: '44:10a First half of verse 10.' },
        { type: 'text', value: '44:10b Second half of verse 10.' },
        { type: 'text', value: '44:11 Full verse 11.' }
      ],
      '2b-10a'
    );

    expect(
      sliced.filter((node) => node.type === 'text').map((node) => node.value)
    ).toEqual([
      '44:2b Second half of verse 2.',
      '44:3 Full verse 3.',
      '44:10a First half of verse 10.'
    ]);
  });

  it('keeps the full opening antiphon for proper feast Matins even when the first psalm verse does not begin with the antiphon incipit', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Sancti/01-01', 'Ant Matutinum', [
        {
          type: 'text',
          value: 'Dóminus dixit * ad me: Fílius meus es tu, ego hódie génui te.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm2', '__preamble', [
        {
          type: 'text',
          value: '2:1 Quare fremuérunt gentes: et pópuli meditáti sunt inánia?'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Ordinarium/MatutinumM1 Versum', 'Versum', [
        { type: 'verseMarker', marker: 'V.', text: 'Versus nocturni' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
        {
          type: 'verseMarker',
          marker: 'R.',
          text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [
                {
                  antiphonRef: {
                    path: 'horas/Latin/Sancti/01-01',
                    section: 'Ant Matutinum'
                  },
                  psalmRef: {
                    path: 'horas/Latin/Psalterium/Psalmorum/Psalm2',
                    section: '__preamble'
                  }
                }
              ],
              antiphons: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Sancti/01-01',
                    section: 'Ant Matutinum'
                  }
                }
              ],
              versicle: {
                reference: {
                  path: 'horas/Latin/Ordinarium/MatutinumM1 Versum',
                  section: 'Versum'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummaryForVersion(hour, reducedVersion),
      version: reducedVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
    expect(psalmody).toBeDefined();
    expect(`${psalmody!.lines[0]!.marker ?? '-'} ${renderRuns(psalmody!.lines[0]!, 'Latin')}`).toBe(
      'Ant. Dóminus dixit * ad me: Fílius meus es tu, ego hódie génui te.'
    );
  });

  it('inserts the Roman pre-lesson bundle and keeps Benedictio before each Lectio when the nocturn plan supplies one', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFileMulti('horas/Latin/Tempora/Test', [
        { header: 'Lectio1', content: [{ type: 'text', value: 'Lectio prima contents' }] },
        {
          header: 'Responsory1',
          content: [{ type: 'verseMarker', marker: 'R.', text: 'Responsorium primum.' }]
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Rubricae', 'Pater secreto', [
        { type: 'rubric', value: 'Pater noster, secreto.' }
      ])
    );
    corpus.addFile(
      makeFileMulti('horas/Latin/Psalterium/Common/Prayers', [
        {
          header: 'Pater noster Et',
          content: [{ type: 'text', value: 'Pater noster. Et ne nos indúcas in tentatiónem.' }]
        },
        {
          header: 'Jube domne',
          content: [{ type: 'text', value: 'Jube, domne, benedícere.' }]
        },
        {
          header: 'Amen',
          content: [{ type: 'text', value: 'Amen.' }]
        }
      ])
    );
    corpus.addFile(
      makeFileMulti('horas/Latin/Psalterium/Benedictions', [
        {
          header: 'Absolutiones',
          content: [
            { type: 'text', value: 'Absolutio dominicalis.' },
            { type: 'text', value: 'Absolutio ferialis.' },
            { type: 'text', value: 'Absolutio sabbatina.' }
          ]
        },
        {
          header: 'Nocturn 1',
          content: [
            { type: 'text', value: 'Benedictióne perpétua benedícat nos Pater ætérnus.' }
          ]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [],
              antiphons: [],
              versicle: {
                reference: { path: 'horas/Latin/Tempora/Test', section: 'Responsory1' }
              },
              lessonIntroduction: 'ordinary',
              lessons: [
                {
                  index: 1,
                  source: {
                    kind: 'patristic',
                    reference: { path: 'horas/Latin/Tempora/Test', section: 'Lectio1' }
                  }
                }
              ],
              responsories: [
                {
                  index: 1,
                  reference: { path: 'horas/Latin/Tempora/Test', section: 'Responsory1' }
                }
              ],
              benedictions: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Psalterium/Benedictions.txt',
                    section: 'Nocturn 1'
                  }
                }
              ]
            }
          ]
        },
        'te-deum': { kind: 'te-deum', decision: 'omit' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections.map((section) => section.slot)).toEqual([
      'heading',
      'versicle',
      'other',
      'other',
      'other',
      'other',
      'other',
      'benedictio',
      'other',
      'heading',
      'lectio-brevis',
      'responsory'
    ]);

    expect(renderRuns(composed.sections[2]!.lines[0]!, 'Latin')).toBe('Pater noster, secreto.');
    expect(renderRuns(composed.sections[3]!.lines[0]!, 'Latin')).toBe(
      'Pater noster. Et ne nos indúcas in tentatiónem.'
    );
    expect(composed.sections[4]!.lines[0]!.marker).toBe('Absolutio.');
    expect(renderRuns(composed.sections[4]!.lines[0]!, 'Latin')).toBe('Absolutio dominicalis.');
    expect(renderRuns(composed.sections[5]!.lines[0]!, 'Latin')).toBe('Amen.');
    expect(renderRuns(composed.sections[6]!.lines[0]!, 'Latin')).toBe('Jube, domne, benedícere.');

    const benedictioSection = composed.sections[7]!;
    expect(benedictioSection.type).toBe('benedictio');
    expect(renderRuns(benedictioSection.lines[0]!, 'Latin')).toBe(
      'Benedictióne perpétua benedícat nos Pater ætérnus.'
    );
    expect(renderRuns(composed.sections[8]!.lines[0]!, 'Latin')).toBe('Amen.');
    expect(composed.sections[9]!.heading).toEqual({ kind: 'lesson', ordinal: 1 });
    expect(renderRuns(composed.sections[10]!.lines[0]!, 'Latin')).toBe('Lectio prima contents');
    expect(renderRuns(composed.sections[11]!.lines[0]!, 'Latin')).toBe('Responsorium primum.');
  });

  it('uses Pater totum secreto and suppresses the ordinary pre-lesson bundle under Limit Benedictiones Oratio', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFileMulti('horas/Latin/Tempora/Test', [
        { header: 'Lectio1', content: [{ type: 'text', value: 'Lectio prima contents' }] },
        {
          header: 'Responsory1',
          content: [{ type: 'verseMarker', marker: 'R.', text: 'Responsorium primum.' }]
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Pater totum secreto', [
        { type: 'rubric', value: '« Pater Noster » dicitur totum secreto.' },
        {
          type: 'text',
          value:
            'Pater noster, qui es in cælis, sanctificétur nomen tuum: advéniat regnum tuum: fiat volúntas tua, sicut in cælo et in terra. Panem nostrum cotidiánum da nobis hódie: et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris: et ne nos indúcas in tentatiónem: sed líbera nos a malo. Amen.'
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [],
              antiphons: [],
              versicle: {
                reference: { path: 'horas/Latin/Tempora/Test', section: 'Responsory1' }
              },
              lessonIntroduction: 'pater-totum-secreto',
              lessons: [
                {
                  index: 1,
                  source: {
                    kind: 'patristic',
                    reference: { path: 'horas/Latin/Tempora/Test', section: 'Lectio1' }
                  }
                }
              ],
              responsories: [
                {
                  index: 1,
                  reference: { path: 'horas/Latin/Tempora/Test', section: 'Responsory1' }
                }
              ],
              benedictions: []
            }
          ]
        },
        'te-deum': { kind: 'te-deum', decision: 'omit' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections.map((section) => section.slot)).toEqual([
      'heading',
      'versicle',
      'other',
      'heading',
      'lectio-brevis',
      'responsory'
    ]);
    expect(renderRuns(composed.sections[2]!.lines[0]!, 'Latin')).toBe(
      '« Pater Noster » dicitur totum secreto.'
    );
    expect(renderRuns(composed.sections[2]!.lines[1]!, 'Latin')).toBe(
      'Pater noster, qui es in cælis, sanctificétur nomen tuum: advéniat regnum tuum: fiat volúntas tua, sicut in cælo et in terra. Panem nostrum cotidiánum da nobis hódie: et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris: et ne nos indúcas in tentatiónem: sed líbera nos a malo. Amen.'
    );
    expect(composed.sections.find((section) => section.slot === 'benedictio')).toBeUndefined();
    expect(
      composed.sections
        .flatMap((section) => section.lines)
        .map((line) => renderRuns(line, 'Latin'))
    ).not.toContain('Jube, domne, benedícere.');
  });

  it('replaces the Te Deum with the flagged responsory when decision is replace-with-responsory', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFileMulti('horas/Latin/Tempora/Test', [
        { header: 'Lectio3', content: [{ type: 'text', value: 'Tertia lectio' }] },
        {
          header: 'Responsory3',
          content: [
            { type: 'verseMarker', marker: 'R.', text: 'Replacement responsorium.' }
          ]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [],
              antiphons: [],
              versicle: {
                reference: { path: 'horas/Latin/Tempora/Test', section: 'Responsory3' }
              },
              lessonIntroduction: 'ordinary',
              lessons: [
                {
                  index: 3,
                  source: {
                    kind: 'patristic',
                    reference: { path: 'horas/Latin/Tempora/Test', section: 'Lectio3' }
                  }
                }
              ],
              responsories: [
                {
                  index: 3,
                  reference: { path: 'horas/Latin/Tempora/Test', section: 'Responsory3' },
                  replacesTeDeum: true
                }
              ],
              benedictions: []
            }
          ]
        },
        'te-deum': { kind: 'te-deum', decision: 'replace-with-responsory' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const teDeumSection = composed.sections.find((s) => s.slot === 'te-deum');
    expect(teDeumSection).toBeDefined();
    expect(teDeumSection!.type).toBe('te-deum');
    expect(renderRuns(teDeumSection!.lines[0]!, 'Latin')).toBe('Replacement responsorium.');
    expect(composed.sections.find((s) => s.slot === 'responsory')).toBeUndefined();
  });

  it('selects the requested Benediction line from conditional-only upstream-style sections', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFileMulti('horas/Latin/Tempora/Test', [
        { header: 'Lectio1', content: [{ type: 'text', value: 'Lectio prima contents' }] },
        {
          header: 'Responsory1',
          content: [{ type: 'verseMarker', marker: 'R.', text: 'Responsorium primum.' }]
        }
      ])
    );
    corpus.addFile(
      makeFileMulti('horas/Latin/Psalterium/Benedictions', [
        {
          header: 'Nocturn 2',
          content: [
            {
              type: 'conditional',
              condition: {
                expression: {
                  type: 'not',
                  inner: { type: 'match', subject: 'rubrica', predicate: 'cisterciensis' }
                }
              },
              content: [
                { type: 'text', value: 'Roman benedictio 1' },
                { type: 'text', value: 'Roman benedictio 2' },
                { type: 'text', value: 'Roman benedictio 3' }
              ],
              scope: { backwardLines: 0, forwardMode: 'line' }
            },
            {
              type: 'conditional',
              condition: {
                expression: { type: 'match', subject: 'rubrica', predicate: 'cisterciensis' }
              },
              content: [
                { type: 'text', value: 'Cistercian benedictio 1' },
                { type: 'text', value: 'Cistercian benedictio 2' },
                { type: 'text', value: 'Cistercian benedictio 3' }
              ],
              scope: { backwardLines: 0, forwardMode: 'line' }
            }
          ]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [],
              antiphons: [],
              versicle: {
                reference: { path: 'horas/Latin/Tempora/Test', section: 'Responsory1' }
              },
              lessonIntroduction: 'ordinary',
              lessons: [
                {
                  index: 1,
                  source: {
                    kind: 'patristic',
                    reference: { path: 'horas/Latin/Tempora/Test', section: 'Lectio1' }
                  }
                }
              ],
              responsories: [],
              benedictions: [
                {
                  index: 1,
                  reference: {
                    path: 'horas/Latin/Psalterium/Benedictions.txt',
                    section: 'Nocturn 2',
                    selector: '2'
                  }
                }
              ]
            }
          ]
        },
        'te-deum': { kind: 'te-deum', decision: 'omit' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const benedictioSection = composed.sections.find((s) => s.slot === 'benedictio');
    expect(benedictioSection).toBeDefined();
    expect(renderRuns(benedictioSection!.lines[0]!, 'Latin')).toBe('Roman benedictio 2');
  });

  it('emits Matins commemoration slots when the HourStructure carries them (1911 / DA path)', () => {
    // Phase 3 §3e coordinated edit: under Divino Afflatu the Phase 2 layer
    // now populates `commemoration-antiphons` / `-versicles` / `-orations`
    // at Matins in addition to Lauds / Vespers. This test asserts that the
    // compositor's generic slot dispatcher emits those slots through from
    // the matins branch (they are not owned by `composeMatinsSections` and
    // fall through to the generic loop per `isMatinsOwnedSlot`).
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFileMulti('horas/Latin/Sancti/01-16', [
        {
          header: 'Ant 1',
          content: [{ type: 'text', value: 'Ant. commemoratio.' }]
        },
        {
          header: 'Versum 1',
          content: [{ type: 'verseMarker', marker: 'V.', text: 'Versus commemoratio.' }]
        },
        {
          header: 'Oratio',
          content: [{ type: 'text', value: 'Oremus pro commemoratione.' }]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: { kind: 'matins-nocturns', nocturns: [] },
        'commemoration-antiphons': {
          kind: 'ordered-refs',
          refs: [{ path: 'horas/Latin/Sancti/01-16', section: 'Ant 1' }]
        },
        'commemoration-versicles': {
          kind: 'ordered-refs',
          refs: [{ path: 'horas/Latin/Sancti/01-16', section: 'Versum 1' }]
        },
        'commemoration-orations': {
          kind: 'ordered-refs',
          refs: [{ path: 'horas/Latin/Sancti/01-16', section: 'Oratio' }]
        },
        'te-deum': { kind: 'te-deum', decision: 'omit' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const commemAntiphon = composed.sections.find((s) => s.slot === 'commemoration-antiphons');
    const commemVersicle = composed.sections.find((s) => s.slot === 'commemoration-versicles');
    const commemOration = composed.sections.find((s) => s.slot === 'commemoration-orations');
    expect(commemAntiphon).toBeDefined();
    expect(commemVersicle).toBeDefined();
    expect(commemOration).toBeDefined();
    expect(commemAntiphon!.type).toBe('commemoration');
    expect(renderRuns(commemAntiphon!.lines[0]!, 'Latin')).toBe('Ant. commemoratio.');
    expect(renderRuns(commemOration!.lines[0]!, 'Latin')).toBe('Oremus pro commemoratione.');
  });

  it('emits nothing for te-deum when decision is omit', () => {
    const corpus = new InMemoryTextIndex();
    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: []
        },
        'te-deum': { kind: 'te-deum', decision: 'omit' }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const teDeumSection = composed.sections.find((s) => s.slot === 'te-deum');
    expect(teDeumSection).toBeUndefined();
  });
});
