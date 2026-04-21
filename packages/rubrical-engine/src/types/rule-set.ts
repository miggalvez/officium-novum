import type { Condition, ParsedFile, RuleDirective } from '@officium-novum/parser';

import type { RubricalWarning } from './directorium.js';
import type { Celebration, Commemoration, HourName } from './ordo.js';
import type { ResolvedVersion } from './version.js';

export interface RuleDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export type RuleSeason =
  | 'advent'
  | 'christmastide'
  | 'epiphanytide'
  | 'septuagesima'
  | 'lent'
  | 'passiontide'
  | 'eastertide'
  | 'ascensiontide'
  | 'pentecost-octave'
  | 'time-after-pentecost'
  | 'time-after-epiphany';

export interface RuleCorpusIndex {
  getFile(path: string): ParsedFile | undefined;
  findByContentPath(contentPath: string): ParsedFile[];
}

export interface RuleEvaluationContext {
  readonly date: RuleDate;
  readonly dayOfWeek: number;
  readonly season?: RuleSeason;
  readonly version: ResolvedVersion;
  readonly dayName: string;
  readonly celebration: Celebration;
  readonly commemorations: readonly Commemoration[];
  readonly corpus: RuleCorpusIndex;
}

export interface CelebrationRuleEvaluation {
  readonly celebrationRules: CelebrationRuleSet;
  readonly warnings: readonly RubricalWarning[];
}

export interface CelebrationRuleSet {
  readonly matins: MatinsRuleSpec;
  readonly hasFirstVespers: boolean;
  readonly hasSecondVespers: boolean;
  readonly lessonSources: readonly LessonSourceOverride[];
  readonly lessonSetAlternates: readonly LessonSetAlternate[];
  readonly teDeumOverride?: 'forced' | 'suppressed';
  readonly festumDomini: boolean;
  readonly papalNames?: PapalNameBindings;
  readonly conclusionMode: 'separate' | 'sub-unica';
  readonly antiphonScheme: AntiphonScheme;
  readonly doxologyVariant?: string;
  readonly omitCommemoration: boolean;
  readonly comkey?: string;
  readonly suffragium?: string;
  readonly noSuffragium: boolean;
  readonly quorumFestum: boolean;
  readonly commemoratio3: boolean;
  readonly unaAntiphona: boolean;
  readonly unmapped: readonly RuleDirective[];
  // Hour-scoped raw directives, bucketed for deriveHourRuleSet.
  readonly hourScopedDirectives: readonly HourScopedDirective[];
}

export interface HourRuleSet {
  readonly hour: HourName;
  readonly omit: readonly OmittableSlot[];
  readonly psalterScheme: PsalterScheme;
  readonly psalmOverrides: readonly PsalmOverride[];
  readonly matinsLessonIntroduction: MatinsLessonIntroduction;
  readonly minorHoursSineAntiphona: boolean;
  readonly minorHoursFerialPsalter: boolean;
  readonly capitulumVariant?: CapitulumVariant;
}

export interface MatinsRuleSpec {
  readonly lessonCount: 3 | 9 | 12;
  readonly nocturns: 1 | 3;
  readonly rubricGate?: 'always' | string;
}

export interface LessonSourceOverride {
  readonly lesson: number;
  readonly source: string;
}

export interface AlternateLocation {
  readonly location: 1 | 2 | 3;
  readonly gate?: Condition;
}

export interface LessonSetAlternate {
  readonly nocturn: 1 | 2 | 3;
  readonly alternate: AlternateLocation;
}

export interface PapalNameBindings {
  readonly office?: string;
  readonly commemoration?: string;
}

export interface PsalmOverride {
  readonly key: string;
  readonly value: string;
}

export type OmittableSlot =
  | 'hymnus'
  | 'preces'
  | 'suffragium'
  | 'invitatorium'
  | 'tedeum'
  | 'gloria-patri'
  | 'incipit';

export type AntiphonScheme = 'default' | 'proper-minor-hours';
export type PsalterScheme = 'ferial' | 'dominica' | 'festal' | 'proper';

export type CapitulumVariant = {
  readonly scheme: 2;
  readonly scope?: 'lauds' | 'vespers' | 'lauds-vespers';
};

export type MatinsLessonIntroduction = 'ordinary' | 'pater-totum-secreto';

export interface HourScopedDirective {
  readonly directive: RuleDirective;
  readonly hours?: readonly HourName[];
}
