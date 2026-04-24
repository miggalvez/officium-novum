import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildVersionRegistry,
  deriveHourRuleSet,
  loadOrdinariumSkeleton,
  resolveVersion,
  rubrics1960Policy,
  structureSext,
  structureTerce,
  type Celebration,
  type CelebrationRuleSet,
  type TemporalContext
} from '../../src/index.js';
import { VERSION_POLICY } from '../../src/version/policy-map.js';
import { TestOfficeTextIndex } from '../helpers.js';

const ORDINARIUM_MINOR = `
#Incipit
$Pater noster

#Hymnus

#Psalmi

#Capitulum Responsorium Versus

#Oratio

#Conclusio
`.trim();

function setup() {
  const corpus = new TestOfficeTextIndex();
  corpus.add('horas/Ordinarium/Minor.txt', ORDINARIUM_MINOR);
  const registry = buildVersionRegistry([
    {
      version: 'Rubrics 1960 - 1960',
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960'
    }
  ]);
  const version = resolveVersion(
    asVersionHandle('Rubrics 1960 - 1960'),
    registry,
    VERSION_POLICY
  );
  return { corpus, version };
}

function celebration(path: string): Celebration {
  return {
    feastRef: { path, id: path, title: path.split('/').at(-1) ?? path },
    rank: { name: 'IV', classSymbol: 'IV', weight: 400 },
    source: 'temporal'
  };
}

function temporal(isoDate: string, dayName: string, dayOfWeek: number): TemporalContext {
  return {
    date: isoDate,
    dayOfWeek,
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season: 'time-after-pentecost',
    feastRef: { path: `Tempora/${dayName}`, id: `Tempora/${dayName}`, title: dayName },
    rank: { name: 'IV', classSymbol: 'IV', weight: 400 }
  };
}

function rules(): CelebrationRuleSet {
  return {
    matins: { lessonCount: 9, nocturns: 3, rubricGate: 'always' },
    hasFirstVespers: true,
    hasSecondVespers: true,
    lessonSources: [],
    lessonSetAlternates: [],
    festumDomini: false,
    conclusionMode: 'separate',
    antiphonScheme: 'default',
    omitCommemoration: false,
    noSuffragium: false,
    quorumFestum: false,
    commemoratio3: false,
    unaAntiphona: false,
    unmapped: [],
    hourScopedDirectives: []
  };
}

describe('minor hour structurers', () => {
  it('structureTerce produces psalmody targeting Tertia section with weekday selector', () => {
    const { corpus, version } = setup();
    const skeleton = loadOrdinariumSkeleton('terce', version, corpus);
    const celeb = celebration('Tempora/Pent03-2');
    const hourRules = deriveHourRuleSet(celeb, rules(), 'terce');

    const result = structureTerce({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules(),
      hourRules,
      temporal: temporal('2024-06-11', 'Pent03-2', 2),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.hour.hour).toBe('terce');
    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.psalmRef.section).toBe('Tertia');
      expect(psalmody.psalms[0]?.psalmRef.selector).toBe('Feria III');
    }
  });

  it('structureSext never produces commemoration slots under 1960', () => {
    const { corpus, version } = setup();
    const skeleton = loadOrdinariumSkeleton('sext', version, corpus);
    const celeb = celebration('Tempora/Pent03-2');
    const hourRules = deriveHourRuleSet(celeb, rules(), 'sext');

    const result = structureSext({
      skeleton,
      celebration: celeb,
      commemorations: [
        {
          feastRef: { path: 'Sancti/06-11', id: 'Sancti/06-11', title: 'S. Barnabae' },
          rank: { name: 'III', classSymbol: 'III', weight: 600 },
          reason: 'occurrence-impeded',
          hours: ['lauds', 'vespers']
        }
      ],
      celebrationRules: rules(),
      hourRules,
      temporal: temporal('2024-06-11', 'Pent03-2', 2),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.hour.slots['commemoration-antiphons']).toBeUndefined();
    expect(result.hour.slots['commemoration-versicles']).toBeUndefined();
  });

  it('falls back to ferial minor-hour later blocks for temporal weekdays', () => {
    const { corpus, version } = setup();
    const skeleton = loadOrdinariumSkeleton('terce', version, corpus);
    const celeb = celebration('Tempora/Quadp3-3');
    const hourRules = deriveHourRuleSet(celeb, rules(), 'terce');

    const result = structureTerce({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules(),
      hourRules,
      temporal: {
        ...temporal('2024-02-14', 'Quadp3-3', 3),
        season: 'lent'
      },
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.hour.slots.chapter).toEqual({
      kind: 'single-ref',
      ref: {
        path: 'horas/Latin/Psalterium/Special/Minor Special',
        section: 'Feria Tertia'
      }
    });
    expect(result.hour.slots.responsory).toEqual({
      kind: 'single-ref',
      ref: {
        path: 'horas/Latin/Psalterium/Special/Minor Special',
        section: 'Responsory breve Feria Tertia'
      }
    });
    expect(result.hour.slots.versicle).toEqual({
      kind: 'single-ref',
      ref: {
        path: 'horas/Latin/Psalterium/Special/Minor Special',
        section: 'Versum Feria Tertia'
      }
    });
  });
});
