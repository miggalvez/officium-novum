import type { Condition } from '@officium-novum/parser';

import type { PsalmAssignment, TextReference } from './hour-structure.js';
import type { FeastReference } from './model.js';
import type { PapalNameBindings } from './rule-set.js';

export type LessonIndex =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12;

export interface PericopeRef {
  readonly book: string;
  readonly chapter?: number;
  readonly verseStart?: number;
  readonly verseEnd?: number;
  readonly reference: TextReference;
}

export type ScriptureCourse =
  | 'advent-isaias'
  | 'octava-nativitatis'
  | 'tempora-nativitatis'
  | 'post-epiphania'
  | 'septuagesima'
  | 'lent'
  | 'passiontide'
  | 'paschaltide'
  | 'ascensiontide'
  | 'post-pentecost'
  | 'occurring-1960';

export type LessonSource =
  | {
      readonly kind: 'scripture';
      readonly course: ScriptureCourse;
      readonly pericope: PericopeRef;
    }
  | {
      readonly kind: 'scripture-transferred';
      readonly pericope: PericopeRef;
      readonly op: 'R' | 'B' | 'A';
    }
  | { readonly kind: 'patristic'; readonly reference: TextReference }
  | { readonly kind: 'hagiographic'; readonly reference: TextReference }
  | {
      readonly kind: 'commemorated';
      readonly feast: FeastReference;
      readonly lessonIndex: LessonIndex;
    }
  | { readonly kind: 'homily-on-gospel'; readonly gospel: PericopeRef };

export interface LessonPlan {
  readonly index: LessonIndex;
  readonly source: LessonSource;
  readonly gateCondition?: Condition;
}

export type InvitatoriumSource =
  | { readonly kind: 'feast'; readonly reference: TextReference }
  | { readonly kind: 'season'; readonly reference: TextReference }
  | { readonly kind: 'suppressed' };

export type HymnSource =
  | {
      readonly kind: 'feast';
      readonly reference: TextReference;
      readonly doxologyVariant?: string;
      readonly papalNameBinding?: PapalNameBindings;
    }
  | { readonly kind: 'ordinary'; readonly reference: TextReference }
  | { readonly kind: 'suppressed' };

export interface VersicleSource {
  readonly reference: TextReference;
}

export interface ResponsorySource {
  readonly index: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly reference: TextReference;
  readonly replacesTeDeum?: boolean;
}

export interface AntiphonReference {
  readonly index: number;
  readonly reference: TextReference;
  readonly psalmRef?: PsalmAssignment;
}

export interface NocturnPlan {
  readonly index: 1 | 2 | 3;
  readonly psalmody: readonly PsalmAssignment[];
  readonly antiphons: readonly AntiphonReference[];
  readonly versicle: VersicleSource;
  readonly lessons: readonly LessonPlan[];
  readonly responsories: readonly ResponsorySource[];
}

export interface MatinsPlan {
  readonly hour: 'matins';
  readonly nocturns: 1 | 3;
  readonly totalLessons: 3 | 9 | 12 | 4 | 10;
  readonly lessonsPerNocturn: readonly number[];
  readonly invitatorium: InvitatoriumSource;
  readonly hymn: HymnSource;
  readonly nocturnPlan: readonly NocturnPlan[];
  readonly teDeum: 'say' | 'replace-with-responsory' | 'omit';
}
