export interface KalendariumEntry {
  dateKey: string;
  fileRef: string;
  alternates?: string[];
}

export interface VersionDefinition {
  version: string;
  kalendar: string;
  transfer: string;
  stransfer: string;
  base?: string;
  transferBase?: string;
}

export interface TransferEntry {
  dateKey: string;
  target: string;
  versionFilter?: string;
}
