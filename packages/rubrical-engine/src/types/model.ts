import type { KalendariumEntry, ParsedFile } from '@officium-nova/parser';

import type { RubricalPolicy } from './policy.js';
import type {
  ResolvedVersion,
  VersionDescriptor,
  VersionHandle,
  VersionRegistry
} from './version.js';

export type DateInput = Date | string;

export interface FeastReference {
  /** Canonical path into the office corpus, excluding the `.txt` suffix. */
  readonly path: string;
  /** Stable identifier for the feast; Phase 2a uses the canonical path. */
  readonly id: string;
  /** Human-readable Latin title when available. */
  readonly title: string;
}

export interface ResolvedRank {
  readonly name: string;
  readonly weight: number;
  readonly classSymbol: string;
}

export type LiturgicalSeason =
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

export interface TemporalContext {
  readonly date: string;
  readonly dayOfWeek: number;
  readonly weekStem: string;
  readonly dayName: string;
  readonly season: LiturgicalSeason;
  readonly feastRef: FeastReference;
  readonly rank: ResolvedRank;
}

export interface SanctoralCandidate {
  readonly dateKey: string;
  readonly feastRef: FeastReference;
  readonly rank: ResolvedRank;
}

export interface Candidate {
  readonly feastRef: FeastReference;
  readonly rank: ResolvedRank;
  readonly source: 'temporal' | 'sanctoral';
}

export interface DayOfficeSummary {
  readonly date: string;
  readonly version: VersionDescriptor;
  readonly temporal: TemporalContext;
  readonly candidates: readonly Candidate[];
  readonly winner: Candidate;
}

export interface KalendariumTable {
  get(kalendar: string): ReadonlyMap<string, readonly KalendariumEntry[]> | undefined;
  readonly size: number;
}

export interface OfficeTextIndex {
  getFile(path: string): ParsedFile | undefined;
  findByContentPath(contentPath: string): ParsedFile[];
}

export interface RubricalEngineConfig {
  readonly corpus: OfficeTextIndex;
  readonly kalendarium: KalendariumTable;
  readonly versionRegistry: VersionRegistry;
  readonly version: VersionHandle;
  readonly policyMap?: ReadonlyMap<VersionHandle, RubricalPolicy>;
  readonly policyOverride?: RubricalPolicy;
}

export interface RubricalEngine {
  readonly version: ResolvedVersion;
  resolveDayOfficeSummary(date: DateInput): DayOfficeSummary;
}
