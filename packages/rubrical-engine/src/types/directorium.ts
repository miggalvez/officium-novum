import type { ScriptureTransferEntry } from '@officium-novum/parser';

import type { FeastReference } from './model.js';

export interface DirectoriumOverlay {
  readonly officeSubstitution?: FeastReference;
  readonly dirgeAtVespers?: DirgeAttachment;
  readonly dirgeAtLauds?: DirgeAttachment;
  readonly hymnOverride?: HymnOverride;
  readonly scriptureTransfer?: ScriptureTransferEntry;
}

export interface DirgeAttachment {
  readonly source: 1 | 2 | 3;
  readonly matchedDateKey: string;
}

export interface HymnOverride {
  readonly hymnKey: string;
  readonly mode: 'merge' | 'shift';
}

export interface RubricalWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: 'info' | 'warn' | 'error';
  readonly context?: Readonly<Record<string, string>>;
}
