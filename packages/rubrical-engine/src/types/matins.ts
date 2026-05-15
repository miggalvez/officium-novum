import type { Condition } from '@officium-novum/parser';

import type { PsalmAssignment, TextReference } from './hour-structure.js';
import type { FeastReference } from './model.js';
import type {
  MatinsLessonIntroduction,
  PapalNameBindings
} from './rule-set.js';

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

/**
 * The Benedictio said before each Lectio in Matins. Selection is
 * policy-driven and mirrors Perl's `specmatins.pl:get_absolutio_et_benedictiones`
 * semantics: the nocturn number, lesson index, lesson source kind, and season
 * together pick a line out of `horas/Latin/Psalterium/Benedictions.txt`.
 *
 * Populated per-lesson in the Matins plan. Matching is by `LessonIndex` so a
 * lesson that has been suppressed (e.g. commemorated in a 3-lesson office)
 * will not carry a benediction entry; the compositor renders what is
 * provided and emits nothing for missing indices.
 */
export interface BenedictioEntry {
  readonly index: LessonIndex;
  readonly reference: TextReference;
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
  readonly appendGloria?: boolean;
  readonly suppressEmbeddedGloria?: boolean;
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
  readonly lessonIntroduction: MatinsLessonIntroduction;
  readonly lessons: readonly LessonPlan[];
  readonly responsories: readonly ResponsorySource[];
  /**
   * One {@link BenedictioEntry} per lesson that carries a benediction. Kept
   * as a **required** field so the type checker enumerates every consumer of
   * `NocturnPlan` when populated — see the Phase 3 completion plan §3d for
   * the rationale. Empty when the policy emits no benedictions for this
   * nocturn.
   */
  readonly benedictions: readonly BenedictioEntry[];
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
