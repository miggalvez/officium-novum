import { describe, expect, it } from 'vitest';

import {
  deriveSeasonalDirectives1960,
  type CelebrationRuleSet,
  type HourRuleSet,
  type LiturgicalSeason,
  type TemporalContext
} from '../../src/index.js';

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
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Quad2-1', 'lent', 1)
    });
    expect(directives.has('omit-alleluia')).toBe(true);
  });

  it('emits omit-gloria-patri and short-chapter-only in the Triduum', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Quad6-5', 'passiontide', 5, 'I-privilegiata-triduum')
    });
    expect(directives.has('omit-gloria-patri')).toBe(true);
    expect(directives.has('short-chapter-only')).toBe(true);
  });

  it('emits omit-suffragium for Lauds under 1960', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'lauds',
      celebrationRules: celebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('Pent03-1', 'time-after-pentecost', 1)
    });
    expect(directives.has('omit-suffragium')).toBe(true);
  });

  it('surfaces dirge-vespers when overlay.dirgeAtVespers is present', () => {
    const directives = deriveSeasonalDirectives1960({
      hour: 'vespers',
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
