import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildVersionRegistry,
  deriveHourRuleSet,
  loadOrdinariumSkeleton,
  resolveVersion,
  rubrics1960Policy,
  structureLauds,
  type Celebration,
  type CelebrationRuleSet,
  type Commemoration,
  type LiturgicalSeason,
  type TemporalContext
} from '../../src/index.js';
import { VERSION_POLICY } from '../../src/version/policy-map.js';
import { TestOfficeTextIndex } from '../helpers.js';

const ORDINARIUM_LAUDES = `
#Incipit
$Pater noster

#Hymnus

#Psalmi

#Capitulum Hymnus Versus

#Canticum: Benedictus

#Preces Feriales

#Oratio

#Suffragium

#Conclusio
`.trim();

const FEAST_FILE = `
[Rank]
Feast of the Assumption;;Duplex I classis;;11;;

[Ant Laudes]
;;Laudes proper

[Hymnus Laudes]
Hymnus Laudis

[Capitulum Laudes]
Capitulum Laudis

[Oratio]
Oratio propria
`.trim();

function celebration(path: string): Celebration {
  return {
    feastRef: { path, id: path, title: path.split('/').at(-1) ?? path },
    rank: { name: 'I', classSymbol: 'I', weight: 1000 },
    source: 'sanctoral'
  };
}

function temporal(
  isoDate: string,
  dayName: string,
  season: LiturgicalSeason,
  dayOfWeek: number
): TemporalContext {
  return {
    date: isoDate,
    dayOfWeek,
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season,
    feastRef: { path: `Tempora/${dayName}`, id: `Tempora/${dayName}`, title: dayName },
    rank: { name: 'I', classSymbol: 'I', weight: 1000 }
  };
}

function baseRules(): CelebrationRuleSet {
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

function setup() {
  const corpus = new TestOfficeTextIndex();
  corpus.add('horas/Ordinarium/Laudes.txt', ORDINARIUM_LAUDES);
  corpus.add('horas/Latin/Sancti/08-15.txt', FEAST_FILE);
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
  const skeleton = loadOrdinariumSkeleton('lauds', version, corpus);
  return { corpus, skeleton, version };
}

describe('structureLauds', () => {
  it('fills hymn, chapter, and oration from feast proper', () => {
    const { corpus, skeleton } = setup();
    const celeb = celebration('Sancti/08-15');
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'lauds');

    const result = structureLauds({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-08-15', 'Pent13-4', 'time-after-pentecost', 4),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.hour.hour).toBe('lauds');
    const hymn = result.hour.slots.hymn;
    expect(hymn?.kind).toBe('single-ref');
    if (hymn?.kind === 'single-ref') {
      expect(hymn.ref.section).toBe('Hymnus Laudes');
    }
    expect(result.hour.slots.oration?.kind).toBe('single-ref');
    expect(result.hour.slots.psalmody?.kind).toBe('psalmody');
    expect(result.hour.directives).toContain('omit-suffragium');
  });

  it('emits commemoration-antiphons/-versicles/-orations when commemorations include lauds', () => {
    const { corpus, skeleton } = setup();
    const celeb: Celebration = {
      ...celebration('Sancti/08-15'),
      rank: { name: 'II', classSymbol: 'II', weight: 800 }
    };
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'lauds');
    const commemoration: Commemoration = {
      feastRef: { path: 'Sancti/08-16', id: 'Sancti/08-16', title: 'S. Joachim' },
      rank: { name: 'III', classSymbol: 'III', weight: 600 },
      reason: 'occurrence-impeded',
      hours: ['lauds', 'vespers']
    };

    const result = structureLauds({
      skeleton,
      celebration: celeb,
      commemorations: [commemoration],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-08-15', 'Pent13-4', 'time-after-pentecost', 4),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.hour.slots['commemoration-antiphons']?.kind).toBe('ordered-refs');
    expect(result.hour.slots['commemoration-versicles']?.kind).toBe('ordered-refs');
    expect(result.hour.slots['commemoration-orations']?.kind).toBe('ordered-refs');
  });

  it('suppresses slots listed in hourRules.omit as kind empty', () => {
    const { corpus, skeleton } = setup();
    const celeb = celebration('Sancti/08-15');
    const rules: CelebrationRuleSet = { ...baseRules(), noSuffragium: true };
    const hourRules = deriveHourRuleSet(celeb, rules, 'lauds');

    const result = structureLauds({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-08-15', 'Pent13-4', 'time-after-pentecost', 4),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.hour.slots.suffragium?.kind).toBe('empty');
  });

  it('finds Ant 2 / Versum 2 in a temporal feast file for Lauds (Codex P1 #2)', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Ordinarium/Laudes.txt', ORDINARIUM_LAUDES);
    corpus.add(
      'horas/Latin/Tempora/Pent03-0.txt',
      ['[Rank]', 'Dominica III post Pentecosten;;Semiduplex;;5;;', '', '[Versum 2]', 'v. Custódi', '', '[Ant 2]', 'Quis ex vobis'].join('\n')
    );
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
    const skeleton = loadOrdinariumSkeleton('lauds', version, corpus);
    const celeb: Celebration = {
      feastRef: { path: 'Tempora/Pent03-0', id: 'Tempora/Pent03-0', title: 'Pent03-0' },
      rank: { name: 'I-privilegiata-sundays', classSymbol: 'I-privilegiata-sundays', weight: 1250 },
      source: 'temporal'
    };
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'lauds');

    const result = structureLauds({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-06-16', 'Pent03-0', 'time-after-pentecost', 0),
      policy: rubrics1960Policy,
      corpus
    });

    const ben = result.hour.slots['antiphon-ad-benedictus'];
    expect(ben?.kind).toBe('single-ref');
    if (ben?.kind === 'single-ref') {
      expect(ben.ref.section).toBe('Ant 2');
      expect(ben.ref.path).toBe('horas/Latin/Tempora/Pent03-0');
    }
    const versicle = result.hour.slots.versicle;
    expect(versicle?.kind).toBe('single-ref');
    if (versicle?.kind === 'single-ref') {
      expect(versicle.ref.section).toBe('Versum 2');
    }
  });

  it('attaches hymnOverride metadata when overlay.hymnOverride is present', () => {
    const { corpus, skeleton } = setup();
    const celeb = celebration('Sancti/08-15');
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'lauds');

    const result = structureLauds({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-08-15', 'Pent13-4', 'time-after-pentecost', 4),
      policy: rubrics1960Policy,
      corpus,
      overlay: {
        hymnOverride: { hymnKey: '2', mode: 'shift' }
      }
    });

    const hymn = result.hour.slots.hymn;
    expect(hymn?.kind).toBe('single-ref');
    if (hymn?.kind === 'single-ref') {
      expect(hymn.hymnOverride?.mode).toBe('shift');
      expect(hymn.hymnOverride?.hymnKey).toBe('2');
    }
  });
});
