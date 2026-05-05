import type { Celebration } from './ordo.js';
import type { HourName } from './ordo.js';
import type {
  InvitatoriumSource,
  NocturnPlan
} from './matins.js';

export type SlotName =
  | 'incipit'
  | 'invitatory'
  | 'hymn'
  | 'psalmody'
  | 'martyrology'
  | 'de-officio-capituli'
  | 'chapter'
  | 'responsory'
  | 'versicle'
  | 'antiphon-ad-benedictus'
  | 'canticle-ad-benedictus'
  | 'antiphon-ad-magnificat'
  | 'canticle-ad-magnificat'
  | 'antiphon-ad-nunc-dimittis'
  | 'canticle-ad-nunc-dimittis'
  | 'oration'
  | 'lectio-brevis'
  | 'benedictio'
  | 'commemoration-antiphons'
  | 'commemoration-versicles'
  | 'commemoration-orations'
  | 'suffragium'
  | 'preces'
  | 'final-antiphon-bvm'
  | 'doxology-variant'
  | 'te-deum'
  | 'conclusion';

export interface TextReference {
  readonly path: string;
  readonly section: string;
  readonly selector?: string;
  /**
   * Optional owning office for name substitution when a slot renders inherited
   * common text on behalf of a proper office.
   */
  readonly nameSourcePath?: string;
}

export interface PsalmAssignment {
  readonly psalmRef: TextReference;
  readonly antiphonRef?: TextReference;
}

export interface HymnOverrideMeta {
  readonly mode: 'merge' | 'shift';
  readonly hymnKey: string;
  readonly source: 'overlay';
}

export type SlotContent =
  | {
      readonly kind: 'single-ref';
      readonly ref: TextReference;
      readonly hymnOverride?: HymnOverrideMeta;
    }
  | { readonly kind: 'ordered-refs'; readonly refs: readonly TextReference[] }
  | { readonly kind: 'psalmody'; readonly psalms: readonly PsalmAssignment[] }
  | { readonly kind: 'prime-martyrology' }
  | { readonly kind: 'empty' }
  // Matins-only rich slot forms from design §16.3 (plan-first architecture).
  | { readonly kind: 'matins-invitatorium'; readonly source: InvitatoriumSource }
  | { readonly kind: 'matins-nocturns'; readonly nocturns: readonly NocturnPlan[] }
  | { readonly kind: 'te-deum'; readonly decision: 'say' | 'replace-with-responsory' | 'omit' };

/**
 * Hour-scoped directives emitted by the structurer for Phase 3 to apply to
 * the resolved text. Psalter-selection outcomes are NOT encoded here — they
 * live on `HourRuleSet` psalmody fields.
 */
export type HourDirective =
  | 'omit-gloria-patri'
  | 'omit-responsory-gloria'
  | 'omit-alleluia'
  | 'add-alleluia'
  | 'add-versicle-alleluia'
  | 'preces-dominicales'
  | 'preces-feriales'
  | 'suffragium-of-the-saints'
  | 'omit-suffragium'
  | 'short-chapter-only'
  | 'genuflection-at-oration'
  | 'dirge-vespers'
  | 'dirge-lauds'
  | 'matins-merge-second-third-scripture-lessons'
  | 'matins-invitatory-paschal-alleluia'
  | 'paschal-short-responsory';

export type ComplineSource =
  | { readonly kind: 'vespers-winner'; readonly celebration: Celebration }
  | { readonly kind: 'ordinary' }
  | { readonly kind: 'triduum-special'; readonly dayName: string };

export interface HourStructure {
  readonly hour: HourName;
  /**
   * Compline-only: the concurrence-derived source for the day. `undefined`
   * for other Hours.
   */
  readonly source?: ComplineSource;
  readonly slots: Readonly<Partial<Record<SlotName, SlotContent>>>;
  readonly directives: readonly HourDirective[];
}
