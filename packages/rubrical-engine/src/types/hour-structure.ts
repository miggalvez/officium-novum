import type { Celebration } from './ordo.js';
import type { HourName } from './ordo.js';

export type SlotName =
  | 'invitatory'
  | 'hymn'
  | 'psalmody'
  | 'chapter'
  | 'responsory'
  | 'versicle'
  | 'antiphon-ad-benedictus'
  | 'antiphon-ad-magnificat'
  | 'antiphon-ad-nunc-dimittis'
  | 'oration'
  | 'commemoration-antiphons'
  | 'commemoration-versicles'
  | 'commemoration-orations'
  | 'suffragium'
  | 'preces'
  | 'doxology-variant'
  | 'conclusion';

export interface TextReference {
  readonly path: string;
  readonly section: string;
  readonly selector?: string;
}

export interface PsalmAssignment {
  readonly psalmRef: TextReference;
  readonly antiphonRef?: TextReference;
}

export type SlotContent =
  | { readonly kind: 'single-ref'; readonly ref: TextReference }
  | { readonly kind: 'ordered-refs'; readonly refs: readonly TextReference[] }
  | { readonly kind: 'psalmody'; readonly psalms: readonly PsalmAssignment[] }
  | { readonly kind: 'empty' };

export type HourDirective =
  | 'omit-gloria-patri'
  | 'preces-dominicales'
  | 'short-chapter-only';

export type ComplineSource =
  | { readonly kind: 'vespers-winner'; readonly celebration: Celebration }
  | { readonly kind: 'ordinary' }
  | { readonly kind: 'triduum-special'; readonly dayName: string };

export interface HourStructure {
  readonly hour: HourName;
  /**
   * For Phase 2f this is the only populated information for Compline.
   * Slot-level structure is deferred to Phase 2g.
   */
  readonly source: ComplineSource;
  readonly slots: Readonly<Partial<Record<SlotName, SlotContent>>>;
  readonly directives: readonly HourDirective[];
}
