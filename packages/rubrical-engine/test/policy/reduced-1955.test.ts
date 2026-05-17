import { describe, expect, it } from 'vitest';

import {
  reduced1955Policy,
  type Candidate,
  type Commemoration,
  type TemporalContext
} from '../../src/index.js';

describe('reduced1955Policy', () => {
  it('normalizes representative ranks into 1955 classes', () => {
    expect(
      reduced1955Policy.resolveRank(
        { name: 'Vigilia', classWeight: 2.5 },
        context('2025-01-05', 'Sancti/01-05cc', 'sanctoral')
      ).classSymbol
    ).toBe('vigil');

    expect(
      reduced1955Policy.resolveRank(
        { name: 'Duplex II classis', classWeight: 5.1 },
        context('2024-09-14', 'Sancti/09-14', 'sanctoral')
      ).classSymbol
    ).toBe('duplex-ii');

    expect(
      reduced1955Policy.resolveRank(
        { name: 'Dominica I classis', classWeight: 6.9 },
        context('2024-03-24', 'Tempora/Quad6-0', 'temporal', 'passiontide')
      ).classSymbol
    ).toBe('privileged-sunday');

    expect(
      reduced1955Policy.resolveRank(
        { name: 'Duplex majus', classWeight: 4.1 },
        context('2024-01-13', 'Sancti/01-13', 'sanctoral', 'epiphanytide')
      ).classSymbol
    ).toBe('duplex-ii');
  });

  it('prefers privileged feriae over sanctoral competitors', () => {
    const privilegedFeria = candidate('Tempora/Quad6-1', 'privileged-feria-major', 'temporal');
    const saint = candidate('Sancti/03-25', 'duplex-i', 'sanctoral');
    expect(reduced1955Policy.compareCandidates(privilegedFeria, saint)).toBeLessThan(0);
  });

  it('limits commemorations more strictly than the 1911 branch', () => {
    const commemorations = [commemoration('Sancti/01-14'), commemoration('Sancti/01-15'), commemoration('Sancti/01-16')];

    expect(
      reduced1955Policy.limitCommemorations(commemorations, {
        hour: 'lauds',
        celebration: celebration('Sancti/12-08', 'duplex-i'),
        celebrationRules: rules(),
        temporal: temporal('2024-12-08', 'Adv2-0', 'advent', 'privileged-sunday')
      }).map((entry) => entry.feastRef.path)
    ).toEqual(['Sancti/01-14', 'Sancti/01-15']);

    expect(
      reduced1955Policy.limitCommemorations(commemorations, {
        hour: 'lauds',
        celebration: celebration('Tempora/Pent07-2', 'feria', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'feria')
      }).map((entry) => entry.feastRef.path)
    ).toEqual(['Sancti/01-14', 'Sancti/01-15', 'Sancti/01-16']);
  });

  it('suppresses duplicate octave commemorations and Pentecost-block accessories', () => {
    expect(
      reduced1955Policy.limitCommemorations([commemoration('Tempora/Nat01')], {
        hour: 'lauds',
        celebration: celebration('Sancti/01-01', 'duplex-ii'),
        celebrationRules: rules(),
        temporal: temporal('2024-01-01', 'Nat01', 'christmastide', 'octave-major')
      })
    ).toEqual([]);

    expect(
      reduced1955Policy.limitCommemorations([commemoration('Tempora/Nat06')], {
        hour: 'lauds',
        celebration: celebration('Sancti/01-06', 'duplex-i'),
        celebrationRules: rules(),
        temporal: temporal('2024-01-06', 'Nat06', 'christmastide', 'duplex-ii')
      })
    ).toEqual([]);

    expect(
      reduced1955Policy.limitCommemorations([commemoration('Sancti/05-19o')], {
        hour: 'lauds',
        celebration: celebration('Tempora/Pasc7-0', 'sunday', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-05-19', 'Pasc7-0', 'pentecost-octave', 'sunday')
      })
    ).toEqual([]);

    expect(
      reduced1955Policy.limitCommemorations(
        [commemoration('Sancti/01-14'), commemoration('Sancti/01-14cc')],
        {
          hour: 'lauds',
          celebration: celebration('Tempora/Epi2-0', 'sunday', 'temporal'),
          celebrationRules: rules(),
          temporal: temporal('2024-01-14', 'Epi2-0', 'time-after-epiphany', 'sunday')
        }
      ).map((entry) => entry.feastRef.path)
    ).toEqual(['Sancti/01-14', 'Sancti/01-14cc']);
  });

  it('emits seasonal directives including the pre-1955 suffragium', () => {
    expect(
      [...reduced1955Policy.hourDirectives({
        hour: 'vespers',
        celebration: celebration('Tempora/Pasc5-4', 'duplex-i', 'temporal'),
        celebrationRules: rules(),
        hourRules: hourRules(),
        temporal: temporal('2024-05-09', 'Pasc5-4', 'eastertide', 'duplex-i')
      })]
    ).toEqual(['add-alleluia', 'add-versicle-alleluia', 'suffragium-of-the-saints']);
  });

  it('emits preces for September Ember days but only Lauds on Ember Saturday', () => {
    const septemberEmberWednesday = reduced1955Policy.hourDirectives({
      hour: 'vespers',
      celebration: celebration('Tempora/Pent18-3', 'feria', 'temporal'),
      celebrationRules: rules(),
      hourRules: hourRules(),
      temporal: temporal('2024-09-18', 'Pent18-3', 'time-after-pentecost', 'feria')
    });
    expect(septemberEmberWednesday.has('preces-feriales')).toBe(true);

    const emberSaturdayVespers = reduced1955Policy.hourDirectives({
      hour: 'vespers',
      celebration: celebration('Tempora/Pent18-6', 'feria', 'temporal'),
      celebrationRules: rules(),
      hourRules: hourRules(),
      temporal: temporal('2024-09-21', 'Pent18-6', 'time-after-pentecost', 'feria')
    });
    expect(emberSaturdayVespers.has('preces-feriales')).toBe(false);

    const emberSaturdayLauds = reduced1955Policy.hourDirectives({
      hour: 'lauds',
      celebration: celebration('Tempora/Pent18-6', 'feria', 'temporal'),
      celebrationRules: rules(),
      hourRules: hourRules(),
      temporal: temporal('2024-09-21', 'Pent18-6', 'time-after-pentecost', 'feria')
    });
    expect(emberSaturdayLauds.has('preces-feriales')).toBe(true);
  });

  it('routes Matins between ferial, paschal-octave, and festal shapes', () => {
    expect(
      reduced1955Policy.resolveMatinsShape({
        celebration: celebration('Tempora/Pent07-2', 'feria', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'feria'),
        commemorations: []
      })
    ).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    expect(
      reduced1955Policy.resolveMatinsShape({
        celebration: celebration('Tempora/Pasc0-1', 'duplex-i', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-04-01', 'Pasc0-1', 'eastertide', 'duplex-i'),
        commemorations: []
      })
    ).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    expect(
      reduced1955Policy.resolveMatinsShape({
        celebration: celebration('Tempora/Pasc7-1', 'duplex-i', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-05-20', 'Pasc7-1', 'pentecost-octave', 'duplex-i'),
        commemorations: []
      })
    ).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    expect(
      reduced1955Policy.resolveMatinsShape({
        celebration: celebration('Tempora/Quadp3-3', 'privileged-feria-major', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-02-14', 'Quadp3-3', 'septuagesima', 'privileged-feria-major'),
        commemorations: []
      })
    ).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    expect(
      reduced1955Policy.resolveMatinsShape({
        celebration: celebration('Tempora/Quad1-6', 'semiduplex', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-02-24', 'Quad1-6', 'lent', 'semiduplex'),
        commemorations: []
      })
    ).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    expect(
      reduced1955Policy.resolveMatinsShape({
        celebration: celebration('Sancti/12-24', 'vigil-major'),
        celebrationRules: rules(),
        temporal: temporal('2024-12-24', 'Adv4-2', 'advent', 'privileged-feria-major'),
        commemorations: []
      })
    ).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    expect(
      reduced1955Policy.resolveMatinsShape({
        celebration: celebration('Sancti/08-15', 'duplex-i'),
        celebrationRules: rules(),
        temporal: temporal('2024-08-15', 'Pent12-4', 'time-after-pentecost', 'feria'),
        commemorations: []
      })
    ).toEqual({
      nocturns: 3,
      totalLessons: 9,
      lessonsPerNocturn: [3, 3, 3]
    });
  });

  it('resolves Te Deum for ferial and Triduum Matins', () => {
    expect(
      reduced1955Policy.resolveTeDeum({
        plan: { nocturns: 1, totalLessons: 3 },
        celebrationRules: rules(),
        temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'feria')
      })
    ).toBe('replace-with-responsory');

    expect(
      reduced1955Policy.resolveTeDeum({
        plan: { nocturns: 3, totalLessons: 9 },
        celebrationRules: rules(),
        temporal: temporal('2024-03-28', 'Quad6-4', 'passiontide', 'privileged-triduum')
      })
    ).toBe('omit');
  });

  it('keeps only the reduced octave set', () => {
    expect(reduced1955Policy.octavesEnabled(feastRef('Sancti/12-25'))).toEqual({
      level: 'privileged'
    });
    expect(reduced1955Policy.octavesEnabled(feastRef('Tempora/Pasc0-0'))).toEqual({
      level: 'privileged'
    });
    expect(reduced1955Policy.octavesEnabled(feastRef('Tempora/Pasc7-0'))).toEqual({
      level: 'privileged'
    });
    expect(reduced1955Policy.octavesEnabled(feastRef('Sancti/12-08'))).toBeNull();
  });
});

function context(
  date: string,
  feastPath: string,
  source: 'temporal' | 'sanctoral',
  season?: TemporalContext['season']
) {
  return {
    date,
    feastPath,
    source,
    version: 'Reduced - 1955',
    ...(season ? { season } : {})
  } as const;
}

function feastRef(path: string) {
  return { path, id: path, title: path };
}

function candidate(path: string, classSymbol: string, source: Candidate['source']): Candidate {
  return {
    feastRef: feastRef(path),
    rank: {
      name: classSymbol,
      classSymbol,
      weight: 1000
    },
    source
  };
}

function celebration(path: string, classSymbol: string, source: 'temporal' | 'sanctoral' = 'sanctoral') {
  return {
    feastRef: feastRef(path),
    rank: {
      name: classSymbol,
      classSymbol,
      weight: 1000
    },
    source
  } as const;
}

function commemoration(path: string): Commemoration {
  return {
    feastRef: feastRef(path),
    rank: {
      name: 'simplex',
      classSymbol: 'simplex',
      weight: 500
    },
    reason: 'occurrence-impeded',
    hours: ['lauds', 'vespers']
  };
}

function rules() {
  return {
    matins: {
      lessonCount: 9,
      nocturns: 3,
      rubricGate: 'always'
    },
    hasFirstVespers: true,
    hasSecondVespers: true,
    lessonSources: [],
    lessonSetAlternates: [],
    festumDomini: false,
    conclusionMode: 'separate',
    specialConclusion: false,
    antiphonScheme: 'default',
    omitCommemoration: false,
    noSuffragium: false,
    quorumFestum: false,
    commemoratio3: false,
    unaAntiphona: false,
    unmapped: [],
    hourScopedDirectives: []
  } as const;
}

function hourRules() {
  return {
    omit: [],
    psalmOverrides: [],
    psalterScheme: 'default',
    useProperAntiphons: false,
    useProperVersicle: false,
    useProperChapter: false,
    useProperOration: false,
    useProperDoxology: false
  } as const;
}

function temporal(
  date: string,
  dayName: string,
  season: TemporalContext['season'],
  classSymbol: string
): TemporalContext {
  return {
    date,
    dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
    weekStem: dayName.replace(/-\d+$/u, ''),
    dayName,
    season,
    feastRef: feastRef(`Tempora/${dayName}`),
    rank: {
      name: classSymbol,
      classSymbol,
      weight: 1000
    }
  };
}
