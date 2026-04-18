import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile } from '@officium-novum/parser';
import type {
  DayOfficeSummary,
  HourStructure,
  ResolvedVersion
} from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';

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
  it('emits invitatorium, nocturn heading, psalmody, lectio, responsory, and Te Deum', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Invitatorium', 'Invitatorium', [
        { type: 'text', value: 'Christus surréxit, veníte adorémus.' }
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
            kind: 'season',
            reference: { path: 'horas/Latin/Psalterium/Invitatorium', section: 'Invitatorium' }
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
              ]
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

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Christus surréxit, veníte adorémus.'
    );
    expect(composed.sections[1]!.heading).toEqual({ kind: 'nocturn', ordinal: 1 });
    expect(composed.sections[1]!.lines).toEqual([]);
    expect(composed.sections[4]!.heading).toEqual({ kind: 'lesson', ordinal: 1 });
    expect(renderRuns(composed.sections.at(-1)!.lines[0]!, 'Latin')).toBe('Te Deum laudámus.');
  });

  it('suppresses Te Deum output when the plan decides replace-with-responsory', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Invitatorium', 'Invitatorium', [
        { type: 'text', value: 'Inv' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Te Deum', [
        { type: 'text', value: 'Te Deum' }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        invitatory: {
          kind: 'matins-invitatorium',
          source: {
            kind: 'season',
            reference: { path: 'horas/Latin/Psalterium/Invitatorium', section: 'Invitatorium' }
          }
        },
        psalmody: { kind: 'matins-nocturns', nocturns: [] },
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

    const teDeum = composed.sections.find((s) => s.slot === 'te-deum');
    expect(teDeum).toBeUndefined();
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
              lessons: [],
              responsories: []
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
});
