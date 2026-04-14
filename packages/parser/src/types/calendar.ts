export interface KalendariumEntry {
  dateKey: string;
  fileRef: string;
  alternates?: string[];
  suppressed: boolean;
}

export interface VersionDefinition {
  version: string;
  kalendar: string;
  transfer: string;
  stransfer: string;
  base?: string;
  transferBase?: string;
}

export type TransferEntry =
  | {
      kind: 'transfer';
      dateKey: string;
      target: string;
      alternates?: string[];
      versionFilter?: string;
    }
  | {
      kind: 'dirge';
      dirgeNumber: 1 | 2 | 3;
      dates: string[];
      versionFilter?: string;
    }
  | {
      kind: 'hymn';
      dateKey: string;
      value: string;
      versionFilter?: string;
    };

export interface ScriptureTransferEntry {
  dateKey: string;
  target: string;
  operation?: 'R' | 'B' | 'A';
  versionFilter?: string;
}
