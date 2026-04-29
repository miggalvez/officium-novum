import type { HourName, PublicLanguageTag, TextOrthographyProfile } from '../api/types';
import {
  DEFAULT_LANGUAGES,
  DEFAULT_ORTHOGRAPHY,
  DEFAULT_VERSION,
  type CommonState
} from './paths';

export interface BuildOfficeRouteInput {
  readonly date: string;
  readonly hour: HourName;
  readonly version?: string;
  readonly languages?: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography?: TextOrthographyProfile;
  readonly displayMode?: 'parallel' | 'sequential';
  readonly fontSize?: 'normal' | 'large' | 'larger';
  readonly strict?: boolean;
}

export interface BuildDayRouteInput {
  readonly date: string;
  readonly version?: string;
  readonly languages?: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography?: TextOrthographyProfile;
  readonly displayMode?: 'parallel' | 'sequential';
  readonly fontSize?: 'normal' | 'large' | 'larger';
  readonly strict?: boolean;
}

export interface BuildCalendarRouteInput {
  readonly year: number;
  readonly month: number;
  readonly version?: string;
}

function commonParams(input: Partial<CommonState>): URLSearchParams {
  const params = new URLSearchParams();
  params.set('version', input.version ?? DEFAULT_VERSION);
  params.set('lang', (input.languages ?? DEFAULT_LANGUAGES).join(','));
  if (input.langfb) {
    params.set('langfb', input.langfb);
  }
  params.set('orthography', input.orthography ?? DEFAULT_ORTHOGRAPHY);
  if (input.displayMode && input.displayMode !== 'parallel') {
    params.set('mode', input.displayMode);
  }
  if (input.fontSize && input.fontSize !== 'normal') {
    params.set('fontSize', input.fontSize);
  }
  if (input.strict === false) {
    params.set('strict', 'false');
  }
  return params;
}

export function buildOfficeRoute(input: BuildOfficeRouteInput): string {
  const params = commonParams(input);
  return `/office/${input.date}/${input.hour}?${params.toString()}`;
}

export function buildDayRoute(input: BuildDayRouteInput): string {
  const params = commonParams(input);
  return `/day/${input.date}?${params.toString()}`;
}

export function buildCalendarRoute(input: BuildCalendarRouteInput): string {
  const params = new URLSearchParams();
  params.set('version', input.version ?? DEFAULT_VERSION);
  return `/calendar/${input.year}/${pad2(input.month)}?${params.toString()}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
