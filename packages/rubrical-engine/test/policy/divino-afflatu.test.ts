import { describe, expect, it } from 'vitest';

import {
  divinoAfflatuPolicy,
  type Candidate,
  type Commemoration,
  type TemporalContext
} from '../../src/index.js';

describe('divinoAfflatuPolicy', () => {
  it('normalizes representative ranks into pre-1955 classes', () => {
    expect(
      divinoAfflatuPolicy.resolveRank(
        { name: 'Semiduplex', classWeight: 2.5 },
        context('2024-07-09', 'Sancti/07-09', 'sanctoral')
      ).classSymbol
    ).toBe('semiduplex');

    expect(
      divinoAfflatuPolicy.resolveRank(
        { name: 'Simplex', classWeight: 1.2 },
        context('2024-10-11', 'Sancti/10-11', 'sanctoral')
      ).classSymbol
    ).toBe('simplex');

    expect(
      divinoAfflatuPolicy.resolveRank(
        { name: 'Dominica I classis', classWeight: 6.9 },
        context('2024-03-24', 'Tempora/Quad6-0', 'temporal', 'passiontide')
      ).classSymbol
    ).toBe('privileged-sunday');
  });

  it('lets the Immaculate Conception outrank a privileged Sunday exception', () => {
    const privilegedSunday = candidate('Tempora/Adv2-0', 'privileged-sunday', 'temporal');
    const immaculate = candidate('Sancti/12-08', 'duplex-i', 'sanctoral');
    const joseph = candidate('Sancti/03-19', 'duplex-i', 'sanctoral');

    expect(divinoAfflatuPolicy.compareCandidates(privilegedSunday, immaculate)).toBeGreaterThan(0);
    expect(divinoAfflatuPolicy.compareCandidates(privilegedSunday, joseph)).toBeLessThan(0);
  });

  it('limits high-rank commemorations more tightly than ordinary days', () => {
    const commemorations = [commemoration('Sancti/01-14'), commemoration('Sancti/01-15'), commemoration('Sancti/01-16')];

    expect(
      divinoAfflatuPolicy.limitCommemorations(commemorations, {
        hour: 'lauds',
        celebration: celebration('Sancti/12-08', 'duplex-i'),
        celebrationRules: rules(),
        temporal: temporal('2024-12-08', 'Adv2-0', 'advent', 'privileged-sunday')
      }).map((entry) => entry.feastRef.path)
    ).toEqual(['Sancti/01-14', 'Sancti/01-15']);

    expect(
      divinoAfflatuPolicy.limitCommemorations(commemorations, {
        hour: 'lauds',
        celebration: celebration('Tempora/Pent07-2', 'feria', 'temporal'),
        celebrationRules: rules(),
        temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'feria')
      }).map((entry) => entry.feastRef.path)
    ).toEqual(['Sancti/01-14', 'Sancti/01-15', 'Sancti/01-16']);
  });

  it('suppresses duplicate octave commemorations and collapses same-day optional variants', () => {
    expect(
      divinoAfflatuPolicy.limitCommemorations([commemoration('Tempora/Nat01')], {
        hour: 'lauds',
        celebration: celebration('Sancti/01-01', 'duplex-ii'),
        celebrationRules: rules(),
        temporal: temporal('2024-01-01', 'Nat01', 'christmastide', 'octave-major')
      })
    ).toEqual([]);

    expect(
      divinoAfflatuPolicy.limitCommemorations([commemoration('Tempora/Nat06')], {
        hour: 'lauds',
        celebration: celebration('Sancti/01-06', 'duplex-i'),
        celebrationRules: rules(),
        temporal: temporal('2024-01-06', 'Nat06', 'christmastide', 'duplex-ii')
      })
    ).toEqual([]);

    expect(
      divinoAfflatuPolicy.limitCommemorations(
        [commemoration('Sancti/05-26'), commemoration('Sancti/05-26o')],
        {
          hour: 'lauds',
          celebration: celebration('Tempora/Pent02-0', 'privileged-sunday', 'temporal'),
          celebrationRules: rules(),
          temporal: temporal(
            '2024-05-26',
            'Pent02-0',
            'time-after-pentecost',
            'privileged-sunday'
          )
        }
      ).map((entry) => entry.feastRef.path)
    ).toEqual(['Sancti/05-26o']);
  });

  it('emits pre-1955 suffragium and seasonal directives', () => {
    expect(
      [...divinoAfflatuPolicy.hourDirectives({
        hour: 'lauds',
        celebration: celebration('Tempora/Pasc5-4', 'duplex-i', 'temporal'),
        celebrationRules: rules(),
        hourRules: hourRules(),
        temporal: temporal('2024-05-09', 'Pasc5-4', 'eastertide', 'duplex-i')
      })]
    ).toEqual(['add-alleluia', 'add-versicle-alleluia', 'suffragium-of-the-saints']);
  });

  it('routes Matins between ferial, paschal-octave, and festal shapes', () => {
    expect(
      divinoAfflatuPolicy.resolveMatinsShape({
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
      divinoAfflatuPolicy.resolveMatinsShape({
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
      divinoAfflatuPolicy.resolveMatinsShape({
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
      divinoAfflatuPolicy.resolveMatinsShape({
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
      divinoAfflatuPolicy.resolveMatinsShape({
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
      divinoAfflatuPolicy.resolveMatinsShape({
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
      divinoAfflatuPolicy.resolveMatinsShape({
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
      divinoAfflatuPolicy.resolveTeDeum({
        plan: { nocturns: 1, totalLessons: 3 },
        celebrationRules: rules(),
        temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'feria')
      })
    ).toBe('replace-with-responsory');

    expect(
      divinoAfflatuPolicy.resolveTeDeum({
        plan: { nocturns: 3, totalLessons: 9 },
        celebrationRules: rules(),
        temporal: temporal('2024-03-28', 'Quad6-4', 'passiontide', 'privileged-triduum')
      })
    ).toBe('omit');
  });

  it('keeps octave metadata for the surviving octave set', () => {
    expect(divinoAfflatuPolicy.octavesEnabled(feastRef('Sancti/12-25'))).toEqual({
      level: 'privileged'
    });
    expect(divinoAfflatuPolicy.octavesEnabled(feastRef('Tempora/Pasc7-0'))).toEqual({
      level: 'privileged'
    });
    expect(divinoAfflatuPolicy.octavesEnabled(feastRef('Sancti/12-08'))).toEqual({
      level: 'common'
    });
    expect(divinoAfflatuPolicy.octavesEnabled(feastRef('Sancti/02-11'))).toBeNull();
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
    version: 'Divino Afflatu - 1954',
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
