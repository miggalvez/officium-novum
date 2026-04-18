import type { CrossReference } from '@officium-novum/parser';
import type { HourName } from '@officium-novum/rubrical-engine';

export type SectionType =
  | 'psalm'
  | 'antiphon'
  | 'chapter'
  | 'hymn'
  | 'versicle'
  | 'responsory'
  | 'oration'
  | 'rubric'
  | 'heading'
  | 'commemoration'
  | 'preces'
  | 'suffragium'
  | 'te-deum'
  | 'lectio-brevis'
  | 'invitatory'
  | 'conclusion'
  | 'other';

export type ComposedRun =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'rubric'; readonly value: string }
  | { readonly type: 'citation'; readonly value: string }
  | { readonly type: 'unresolved-macro'; readonly name: string }
  | { readonly type: 'unresolved-formula'; readonly name: string }
  | { readonly type: 'unresolved-reference'; readonly ref: CrossReference };

export interface ComposedLine {
  readonly marker?: string;
  readonly texts: Readonly<Record<string, readonly ComposedRun[]>>;
}

export interface HeadingDescriptor {
  readonly kind: 'nocturn' | 'lesson';
  readonly ordinal: number;
}

export interface Section {
  readonly type: SectionType;
  readonly slot: string;
  readonly reference?: string;
  readonly lines: readonly ComposedLine[];
  readonly languages: readonly string[];
  readonly heading?: HeadingDescriptor;
}

export interface ComposedHour {
  readonly date: string;
  readonly hour: HourName;
  readonly celebration: string;
  readonly languages: readonly string[];
  readonly sections: readonly Section[];
}

export interface ComposeOptions {
  readonly languages: readonly string[];
  readonly langfb?: string;
}
