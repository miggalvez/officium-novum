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
  | 'benedictio'
  | 'invitatory'
  | 'martyrology'
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

/**
 * Soft failures and informational signals surfaced during composition.
 *
 * Per Phase 3 plan §3f and ADR-011, the compositor no longer silently
 * returns `undefined` when a reference resolves to nothing usable — it
 * records a {@link ComposeWarning} and flows the partial result forward
 * so downstream consumers can display or log the issue.
 *
 * The shape intentionally mirrors `RubricalWarning` from the
 * rubrical-engine (`packages/rubrical-engine/src/types/directorium.ts`)
 * but is not re-exported from that package — the two warning surfaces
 * are logically distinct (Phase 2 = rubrical decisions, Phase 3 =
 * resolution / rendering), even if the data model is the same.
 */
export interface ComposeWarning {
  /** Stable machine-readable code, e.g. `'unhandled-selector'`. */
  readonly code: string;
  /** Human-readable one-line summary. */
  readonly message: string;
  /** `'info'` is a signal; `'warn'` is recoverable; `'error'` indicates partial output. */
  readonly severity: 'info' | 'warn' | 'error';
  /** Stringly-typed context: file paths, section names, ref counts, etc. */
  readonly context?: Readonly<Record<string, string>>;
}

export interface ComposedHour {
  readonly date: string;
  readonly hour: HourName;
  readonly celebration: string;
  readonly languages: readonly string[];
  readonly sections: readonly Section[];
  /**
   * Compose-time warnings surfaced from the reference resolver,
   * deferred-node expander, conditional flattener, and Matins plan
   * walker. Always present (possibly empty). See {@link ComposeWarning}.
   */
  readonly warnings: readonly ComposeWarning[];
}

export interface ComposeOptions {
  readonly languages: readonly string[];
  readonly langfb?: string;
  /**
   * Caller-supplied intent for the Lauds opening preamble. Per ADR-010 this
   * is not derivable from `DayOfficeSummary` — `summary.hours.matins` being
   * populated only means Matins is in scope for the day, not that the
   * caller has already prayed it in this session.
   *
   * - `undefined` or `false` — the compositor emits the Lauds incipit
   *   verbatim from the Ordinarium (separated form). Under 1911 / 1954 /
   *   Divino Afflatu that includes the secreto Pater / Ave; under the 1955
   *   and 1960 simplified rubrics the corpus-level `omittuntur` conditional
   *   already suppresses them.
   * - `true` — the caller has just prayed Matins and is continuing into
   *   Lauds. The compositor suppresses the secreto Pater / Ave / Secreto-
   *   rubric block at the top of the Lauds `#Incipit`; the caller is
   *   expected to have said them at the Matins opening.
   *
   * The flag is a no-op for every Hour other than Lauds. Future preamble
   * options (e.g. `emitAperiDomine`) live here too per ADR-010.
   */
  readonly joinLaudsToMatins?: boolean;
}
