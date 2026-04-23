import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildVersionRegistry,
  deriveHourRuleSet,
  loadOrdinariumSkeleton,
  resolveVersion,
  rubrics1960Policy,
  structureVespers,
  type Celebration,
  type CelebrationRuleSet,
  type Commemoration,
  type TemporalContext
} from '../../src/index.js';
import { officeVisitKey } from '../../src/hours/apply-rule-set.js';
import { VERSION_POLICY } from '../../src/version/policy-map.js';
import { TestOfficeTextIndex } from '../helpers.js';

const ORDINARIUM_VESPERA = `
#Incipit
$Pater noster

#Psalmi

#Capitulum Hymnus Versus

#Canticum: Magnificat

#Preces Feriales

#Oratio

#Suffragium

#Conclusio
`.trim();

const SECOND_VESPERS_FILE = `
[Rank]
Holy Family;;Duplex II classis;;5;;

[Ant Vespera]
Jacob autem;;109
Maria autem;;110
Et venerunt;;111
Videntes stellam;;112
Invenerunt puerum;;113

[Ant Vespera 3]
Post triduum;;109
Descendit cum eis;;110
Proficiebat sapientia;;111
Erat subditus;;112
Et mater ejus;;113
`.trim();

const CHRISTMAS_SECOND_VESPERS_FILE = `
[Rank]
In Nativitate Domini;;Duplex I Classis;;6.9

[Rule]
Psalmi Dominica

[Ant Vespera 3]
Tecum princípium;;109
Redemptiónem;;110
Exórtum est;;111
Apud Dóminum;;129
De fructu;;131
`.trim();

const INHERITED_CHRISTMAS_SECOND_VESPERS_FILE = `
[Rank]
S. Joannis Apostoli et Evangelistæ;;Duplex II classis;;5.4;;

[Rule]
Psalmi Dominica

[Ant Vespera 3]
@Sancti/12-25
`.trim();

const CONDITIONED_SECTION_VESPERS_FILE = `
[Rank]
Conditioned sections;;Duplex;;5;;

[Ant Vespera] (feria 2)
Feria ii one;;114
Feria ii two;;115
Feria ii three;;116
Feria ii four;;117
Feria ii five;;118

[Ant Vespera] (nisi feria 2)
Other day one;;109
Other day two;;110
Other day three;;111
Other day four;;112
Other day five;;113
`.trim();

const CONDITIONAL_CONTENT_VESPERS_FILE = `
[Rank]
Conditional content;;Duplex;;5;;

[Ant Vespera]
Feria ii one;;114
(sed feria 3 omittitur)
Other day one;;109
Other day two;;110
Other day three;;111
Other day four;;112
Other day five;;113
`.trim();

const REFERENCED_CONDITIONED_VESPERS_FILE = `
[Rank]
Reference root;;Duplex;;5;;

[Ant Vespera]
@Sancti/08-02:Ant Laudes
`.trim();

const REFERENCED_CONDITIONED_LAUDS_FILE = `
[Rank]
Reference target;;Duplex;;5;;

[Ant Laudes] (feria 2)
Feria ii one;;114
Feria ii two;;115
Feria ii three;;116
Feria ii four;;117
Feria ii five;;118

[Ant Laudes] (nisi feria 2)
Other day one;;109
Other day two;;110
Other day three;;111
Other day four;;112
Other day five;;113
`.trim();

const TRANSFORMED_SECOND_VESPERS_FILE = `
[Rank]
Transformed second Vespers;;Duplex;;5;;

[Ant Vespera]
First-Vespers one;;109
First-Vespers two;;110
First-Vespers three;;111
First-Vespers four;;112
First-Vespers five;;113

[Ant Vespera 3]
@:Ant Vespera:s/;;.*//g
`.trim();

function setup() {
  const corpus = new TestOfficeTextIndex();
  corpus.add('horas/Ordinarium/Vespera.txt', ORDINARIUM_VESPERA);
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
  const skeleton = loadOrdinariumSkeleton('vespers', version, corpus);
  return { corpus, skeleton, version };
}

function celebration(path: string): Celebration {
  return {
    feastRef: { path, id: path, title: path.split('/').at(-1) ?? path },
    rank: { name: 'I', classSymbol: 'I', weight: 1000 },
    source: 'sanctoral'
  };
}

function temporal(isoDate: string, dayName: string, dayOfWeek: number): TemporalContext {
  return {
    date: isoDate,
    dayOfWeek,
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season: 'advent',
    feastRef: { path: `Tempora/${dayName}`, id: `Tempora/${dayName}`, title: dayName },
    rank: { name: 'I', classSymbol: 'I', weight: 1000 }
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

describe('structureVespers', () => {
  it('normalizes visit keys across file and reference path forms', () => {
    expect(officeVisitKey('horas/Latin/Sancti/12-27.txt', 'Ant Vespera 3')).toBe(
      officeVisitKey('Sancti/12-27', 'Ant Vespera 3')
    );
    expect(officeVisitKey('./horas/Latin/Sancti/12-27.txt', 'Ant Vespera 3')).toBe(
      officeVisitKey('Sancti/12-27', 'Ant Vespera 3')
    );
  });

  it('emits psalmody keyed to Sunday when concurrence winner is a Sunday celebration', () => {
    const { corpus, skeleton } = setup();
    const celeb = celebration('Sancti/12-08');
    const hourRules = deriveHourRuleSet(celeb, rules(), 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules(),
      hourRules,
      temporal: temporal('2024-12-08', 'Adv2-0', 0),
      policy: rubrics1960Policy,
      corpus
    });

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.psalmRef.section).toBe('Day0 Vespera');
    }
  });

  it('attaches commemoration slots from concurrence inputs', () => {
    const { corpus, skeleton } = setup();
    const celeb = celebration('Sancti/12-08');
    const commemoration: Commemoration = {
      feastRef: { path: 'Tempora/Adv2-0', id: 'Tempora/Adv2-0', title: 'Adv2-0' },
      rank: { name: 'I-privilegiata-sundays', classSymbol: 'I-privilegiata-sundays', weight: 1250 },
      reason: 'concurrence',
      hours: ['vespers']
    };
    const hourRules = deriveHourRuleSet(celeb, rules(), 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [commemoration],
      celebrationRules: rules(),
      hourRules,
      temporal: temporal('2024-12-08', 'Adv2-0', 0),
      policy: rubrics1960Policy,
      corpus
    });

    const antiphons = result.hour.slots['commemoration-antiphons'];
    expect(antiphons?.kind).toBe('ordered-refs');
    if (antiphons?.kind === 'ordered-refs') {
      expect(antiphons.refs[0]?.path).toBe('horas/Latin/Tempora/Adv2-0');
    }
  });

  it('emits dirge-vespers directive from overlay', () => {
    const { corpus, skeleton } = setup();
    const celeb = celebration('Tempora/Pent03-1');
    const hourRules = deriveHourRuleSet(celeb, rules(), 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules(),
      hourRules,
      temporal: {
        ...temporal('2024-06-10', 'Pent03-1', 1),
        season: 'time-after-pentecost'
      },
      policy: rubrics1960Policy,
      corpus,
      overlay: {
        dirgeAtVespers: { source: 1, matchedDateKey: '06-10' }
      }
    });

    expect(result.hour.directives).toContain('dirge-vespers');
  });

  it('prefers Ant Vespera 3 for second-Vespers psalmody when that proper exists', () => {
    const { corpus, skeleton } = setup();
    corpus.add('horas/Latin/Tempora/Epi1-0.txt', SECOND_VESPERS_FILE);
    const celeb: Celebration = {
      feastRef: { path: 'Tempora/Epi1-0', id: 'Tempora/Epi1-0', title: 'Epi1-0' },
      rank: { name: 'II', classSymbol: 'II', weight: 800 },
      source: 'temporal'
    };
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-01-07', 'Epi1-0', 0),
        season: 'epiphanytide'
      },
      policy: rubrics1960Policy,
      corpus,
      __vespersSide: 'second'
    } as Parameters<typeof structureVespers>[0]);

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.antiphonRef).toEqual({
        path: 'horas/Latin/Tempora/Epi1-0',
        section: 'Ant Vespera 3',
        selector: '1'
      });
      expect(psalmody.psalms[4]?.antiphonRef?.section).toBe('Ant Vespera 3');
    }
  });

  it('keeps Ant Vespera for first-Vespers psalmody when both sets exist', () => {
    const { corpus, skeleton } = setup();
    corpus.add('horas/Latin/Tempora/Epi1-0.txt', SECOND_VESPERS_FILE);
    const celeb: Celebration = {
      feastRef: { path: 'Tempora/Epi1-0', id: 'Tempora/Epi1-0', title: 'Epi1-0' },
      rank: { name: 'II', classSymbol: 'II', weight: 800 },
      source: 'temporal'
    };
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-01-06', 'Epi1-0', 0),
        season: 'epiphanytide'
      },
      policy: rubrics1960Policy,
      corpus,
      __vespersSide: 'first'
    } as Parameters<typeof structureVespers>[0]);

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.antiphonRef).toEqual({
        path: 'horas/Latin/Tempora/Epi1-0',
        section: 'Ant Vespera',
        selector: '1'
      });
      expect(psalmody.psalms[4]?.antiphonRef?.section).toBe('Ant Vespera');
    }
  });

  it('derives second-Vespers psalm refs from proper Ant Vespera 3 psalm numbers', () => {
    const { corpus, skeleton } = setup();
    corpus.add('horas/Latin/Sancti/12-25.txt', CHRISTMAS_SECOND_VESPERS_FILE);
    const celeb: Celebration = {
      feastRef: { path: 'Sancti/12-25', id: 'Sancti/12-25', title: '12-25' },
      rank: { name: 'I', classSymbol: 'I', weight: 1000 },
      source: 'sanctoral'
    };
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-12-25', 'Nat25', 3),
        season: 'christmastide'
      },
      policy: rubrics1960Policy,
      corpus,
      __vespersSide: 'second'
    } as Parameters<typeof structureVespers>[0]);

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[3]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm129'
      );
      expect(psalmody.psalms[3]?.antiphonRef).toEqual({
        path: 'horas/Latin/Sancti/12-25',
        section: 'Ant Vespera 3',
        selector: '4'
      });
    }
  });

  it('keeps inherited Christmas second-Vespers fifth-psalm refs over the generic policy override', () => {
    const { corpus, skeleton } = setup();
    corpus.add('horas/Latin/Sancti/12-25.txt', CHRISTMAS_SECOND_VESPERS_FILE);
    corpus.add('horas/Latin/Sancti/12-27.txt', INHERITED_CHRISTMAS_SECOND_VESPERS_FILE);
    const celeb: Celebration = {
      feastRef: { path: 'Sancti/12-27', id: 'Sancti/12-27', title: '12-27' },
      rank: { name: 'II', classSymbol: 'II', weight: 800 },
      source: 'sanctoral'
    };
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');
    const policy = {
      ...rubrics1960Policy,
      selectPsalmody: (params: Parameters<typeof rubrics1960Policy.selectPsalmody>[0]) => {
        const assignments = rubrics1960Policy.selectPsalmody(params);
        return assignments.map((assignment, index) =>
          index === 4
            ? {
                ...assignment,
                psalmRef: {
                  path: 'horas/Latin/Psalterium/Psalmorum/Psalm116',
                  section: '__preamble',
                  selector: '116'
                }
              }
            : assignment
        );
      }
    };

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-12-27', 'Nat1-5', 5),
        season: 'christmastide'
      },
      policy,
      corpus,
      __vespersSide: 'second'
    } as Parameters<typeof structureVespers>[0]);

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[4]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm131'
      );
      expect(psalmody.psalms[4]?.antiphonRef).toEqual({
        path: 'horas/Latin/Sancti/12-27',
        section: 'Ant Vespera 3',
        selector: '5'
      });
    }
  });

  it('honors section-level conditions when deriving major-hour psalm refs', () => {
    const { corpus, skeleton, version } = setup();
    corpus.add('horas/Latin/Sancti/08-01.txt', CONDITIONED_SECTION_VESPERS_FILE);
    const celeb = celebration('Sancti/08-01');
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-01-02', 'Epi1-2', 2),
        season: 'christmastide'
      },
      policy: rubrics1960Policy,
      corpus,
      version
    });

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm109'
      );
      expect(psalmody.psalms[4]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm113'
      );
    }
  });

  it('honors in-section conditionals when deriving major-hour psalm refs', () => {
    const { corpus, skeleton, version } = setup();
    corpus.add('horas/Latin/Sancti/08-01.txt', CONDITIONAL_CONTENT_VESPERS_FILE);
    const celeb = celebration('Sancti/08-01');
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-01-02', 'Epi1-2', 2),
        season: 'christmastide'
      },
      policy: rubrics1960Policy,
      corpus,
      version
    });

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm109'
      );
      expect(psalmody.psalms[4]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm113'
      );
    }
  });

  it('honors conditions when following referenced major-hour psalm sections', () => {
    const { corpus, skeleton, version } = setup();
    corpus.add('horas/Latin/Sancti/08-01.txt', REFERENCED_CONDITIONED_VESPERS_FILE);
    corpus.add('horas/Latin/Sancti/08-02.txt', REFERENCED_CONDITIONED_LAUDS_FILE);
    const celeb = celebration('Sancti/08-01');
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-01-02', 'Epi1-2', 2),
        season: 'christmastide'
      },
      policy: rubrics1960Policy,
      corpus,
      version
    });

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm109'
      );
      expect(psalmody.psalms[4]?.psalmRef.path).toBe(
        'horas/Latin/Psalterium/Psalmorum/Psalm113'
      );
    }
  });

  it('keeps the generic psalter fallback when Ant Vespera 3 strips psalm payloads', () => {
    const { corpus, skeleton, version } = setup();
    corpus.add('horas/Latin/Sancti/08-03.txt', TRANSFORMED_SECOND_VESPERS_FILE);
    const celeb = celebration('Sancti/08-03');
    const celebrationRules: CelebrationRuleSet = {
      ...rules(),
      festumDomini: true
    };
    const hourRules = deriveHourRuleSet(celeb, celebrationRules, 'vespers');

    const result = structureVespers({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules,
      hourRules,
      temporal: {
        ...temporal('2024-01-07', 'Epi1-0', 0),
        season: 'epiphanytide'
      },
      policy: rubrics1960Policy,
      corpus,
      version,
      __vespersSide: 'second'
    } as Parameters<typeof structureVespers>[0]);

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('psalmody');
    if (psalmody?.kind === 'psalmody') {
      expect(psalmody.psalms[0]?.antiphonRef).toEqual({
        path: 'horas/Latin/Sancti/08-03',
        section: 'Ant Vespera 3',
        selector: '1'
      });
      expect(psalmody.psalms[0]?.psalmRef).toEqual({
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi major',
        section: 'Day0 Vespera',
        selector: '1'
      });
      expect(psalmody.psalms[4]?.psalmRef).toEqual({
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi major',
        section: 'Day0 Vespera',
        selector: '5'
      });
    }
  });
});
