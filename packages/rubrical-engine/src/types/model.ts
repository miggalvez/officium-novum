import type { KalendariumEntry, ParsedFile } from '@officium-novum/parser';

import type { ScriptureTransferTable } from '../directorium/tables/scripture-transfer-table.js';
import type { YearTransferTable } from '../directorium/tables/year-transfer-table.js';
import type { DirectoriumOverlay, RubricalWarning } from './directorium.js';
import type { ConcurrenceResult } from './concurrence.js';
import type { HourStructure } from './hour-structure.js';
import type { Celebration, Commemoration, HourName } from './ordo.js';
import type { RubricalPolicy } from './policy.js';
import type { CelebrationRuleSet } from './rule-set.js';
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
  readonly source: 'temporal' | 'sanctoral' | 'transferred-in';
  readonly transferredFrom?: string;
  readonly vigilOf?: FeastReference;
}

export interface DayOfficeSummary {
  readonly date: string;
  readonly version: VersionDescriptor;
  readonly temporal: TemporalContext;
  readonly overlay?: DirectoriumOverlay;
  readonly warnings: readonly RubricalWarning[];
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly commemorations: readonly Commemoration[];
  readonly concurrence: ConcurrenceResult;
  readonly compline: HourStructure;
  /**
   * Structured content for every Hour in scope. In Phase 2g-β this now
   * includes all eight Hours, including `matins`.
   */
  readonly hours: Readonly<Partial<Record<HourName, HourStructure>>>;
  readonly candidates: readonly Candidate[];
  /** @deprecated Use `celebration` instead. Kept for Phase 2a API compatibility. */
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
  readonly yearTransfers: YearTransferTable;
  readonly scriptureTransfers: ScriptureTransferTable;
  readonly versionRegistry: VersionRegistry;
  readonly version: VersionHandle;
  readonly policyMap?: ReadonlyMap<VersionHandle, RubricalPolicy>;
  readonly policyOverride?: RubricalPolicy;
}

export interface RubricalEngine {
  readonly version: ResolvedVersion;
  resolveDayOfficeSummary(date: DateInput): DayOfficeSummary;
}
