import { describe, expect, it } from 'vitest';

import {
  deriveSeasonalDirectives1960,
  type CelebrationRuleSet,
  type HourRuleSet,
  type LiturgicalSeason,
  type TemporalContext
} from '../../src/index.js';
import type { Celebration } from '../../src/types/ordo.js';

function temporal(
  dayName: string,
  season: LiturgicalSeason,
  dayOfWeek: number,
  classSymbol = 'IV'
): TemporalContext {
  return {
    date: '2024-01-01',
    dayOfWeek,
    weekStem: dayName,
    dayName,
    season,
    feastRef: { path: `Tempora/${dayName}`, id: `Tempora/${dayName}`, title: dayName },
    rank: { name: classSymbol, classSymbol, weight: 400 }
  };
}

function celebrationRules(): CelebrationRuleSet {
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

function celebration(
  path = 'Tempora/Quad2-1',
  source: Celebration['source'] = 'temporal'
): Celebration {
  return {
    feastRef: { path, id: path, title: path },
    rank: { name: 'Feria', classSymbol: 'IV', weight: 400 },
    source
  };
}

function hourRules(hour: HourRuleSet['hour']): HourRuleSet {
  return {
    hour,
    omit: [],
    psalterScheme: 'ferial',
    psalmOverrides: [],
    matinsLessonIntroduction: 'ordinary',
    minorHoursSineAntiphona: false,
    minorHoursFerialPsalter: false
  };
}

describe('deriveSeasonalDirectives1960', () => {
  it('emits add-alleluia during Paschaltide', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebration: celebration(),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Pasc1-0', 'eastertide', 0)
    });
    expect(directives.has('add-alleluia')).toBe(true);
    expect(directives.has('add-versicle-alleluia')).toBe(true);
    expect(directives.has('omit-alleluia')).toBe(false);
  });

  it('emits omit-alleluia during Lent', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebration: celebration(),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Quad2-1', 'lent', 1)
    });
    expect(directives.has('omit-alleluia')).toBe(true);
  });

  it('emits omit-gloria-patri and short-chapter-only in the Triduum', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebration: celebration('Tempora/Quad6-5'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Quad6-5', 'passiontide', 5, 'I-privilegiata-triduum')
    });
    expect(directives.has('omit-gloria-patri')).toBe(true);
    expect(directives.has('short-chapter-only')).toBe(true);
  });

  it('emits omit-responsory-gloria for Passiontide minor hours', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'terce',
      celebration: celebration('Tempora/Quad5-0'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('terce'),
      temporal: temporal('Quad5-0', 'passiontide', 0)
    });
    expect(directives.has('omit-responsory-gloria')).toBe(true);
    expect(directives.has('omit-gloria-patri')).toBe(false);
  });

  it('keeps Passiontide feast responsories from inheriting the seasonal Gloria omission', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'terce',
      celebration: celebration('Sancti/03-19', 'sanctoral'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('terce'),
      temporal: temporal('Quad5-2', 'passiontide', 2)
    });
    expect(directives.has('omit-responsory-gloria')).toBe(false);
  });

  it('emits omit-suffragium for Lauds under 1960', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebration: celebration('Tempora/Pent03-1'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Pent03-1', 'time-after-pentecost', 1)
    });
    expect(directives.has('omit-suffragium')).toBe(true);
  });

  it('honors explicit Preces Feriales rules outside the ordinary seasonal test', () => {
    const rules = {
      ...celebrationRules(),
      hourScopedDirectives: [
        {
          directive: {
            kind: 'action',
            keyword: 'Preces Feriales',
            args: [],
            raw: 'Preces Feriales'
          },
          hours: ['lauds']
        }
      ]
    } satisfies CelebrationRuleSet;

    const directives = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebration: celebration('Tempora/Quadp3-3'),
      celebrationRules: rules,
      hourRules: hourRules('lauds'),
      temporal: temporal('Quadp3-3', 'septuagesima', 3)
    });

    expect(directives.has('preces-feriales')).toBe(true);
  });

  it('limits 1960 seasonal preces to offices of the season on the appointed days', () => {
    const monday = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebration: celebration('Tempora/Quad6-1'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Quad6-1', 'passiontide', 1)
    });
    expect(monday.has('preces-feriales')).toBe(false);

    const wednesday = deriveSeasonalDirectives1960({
      hour: 'vespers',
      celebration: celebration('Tempora/Quad6-3'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('vespers'),
      temporal: temporal('Quad6-3', 'passiontide', 3)
    });
    expect(wednesday.has('preces-feriales')).toBe(true);

    const feastInLent = deriveSeasonalDirectives1960({
      hour: 'vespers',
      celebration: celebration('Sancti/03-19', 'sanctoral'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('vespers'),
      temporal: temporal('Quad5-2', 'passiontide', 2)
    });
    expect(feastInLent.has('preces-feriales')).toBe(false);

    const emberSaturdayVespers = deriveSeasonalDirectives1960({
      hour: 'vespers',
      celebration: celebration('Tempora/Quat3-6'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('vespers'),
      temporal: temporal('Quat3-6', 'time-after-pentecost', 6, 'II-ember-day')
    });
    expect(emberSaturdayVespers.has('preces-feriales')).toBe(false);

    const emberSaturdayLauds = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebration: celebration('Tempora/Quat3-6'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Quat3-6', 'time-after-pentecost', 6, 'II-ember-day')
    });
    expect(emberSaturdayLauds.has('preces-feriales')).toBe(true);
  });

  it('surfaces dirge-vespers when overlay.dirgeAtVespers is present', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'vespers',
      celebration: celebration('Tempora/Pent03-1'),
      celebrationRules: celebrationRules(),
      hourRules: hourRules('vespers'),
      temporal: temporal('Pent03-1', 'time-after-pentecost', 1),
      overlay: {
        dirgeAtVespers: { source: 1, matchedDateKey: '06-10' }
      }
    });
    expect(directives.has('dirge-vespers')).toBe(true);
  });
});
