import type { HourName, PublicLanguageTag, TextOrthographyProfile } from '../api/types';

export type RouteName =
  | 'home'
  | 'office'
  | 'day'
  | 'calendar'
  | 'settings'
  | 'status'
  | 'about'
  | 'api'
  | 'preview'
  | 'unknown';

export interface CommonState {
  readonly version: string;
  readonly languages: readonly PublicLanguageTag[];
  readonly langfb?: PublicLanguageTag;
  readonly orthography: TextOrthographyProfile;
  readonly strict: boolean;
  readonly displayMode: 'parallel' | 'sequential';
  readonly fontSize: 'normal' | 'large' | 'larger';
}

export interface OfficeRoute extends CommonState {
  readonly name: 'office';
  readonly date: string;
  readonly hour: HourName;
}

export interface DayRoute extends CommonState {
  readonly name: 'day';
  readonly date: string;
}

export interface CalendarRoute {
  readonly name: 'calendar';
  readonly year: number;
  readonly month: number;
  readonly version: string;
}

export interface PlainRoute {
  readonly name: Exclude<RouteName, 'office' | 'day' | 'calendar'>;
}

export type Route = OfficeRoute | DayRoute | CalendarRoute | PlainRoute;

export const DEFAULT_VERSION = 'Rubrics 1960 - 1960';
export const DEFAULT_LANGUAGES: readonly PublicLanguageTag[] = ['la', 'en'];
export const DEFAULT_ORTHOGRAPHY: TextOrthographyProfile = 'version';
export const DEFAULT_HOUR: HourName = 'lauds';
