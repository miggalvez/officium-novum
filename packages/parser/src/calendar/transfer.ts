import type { TransferEntry } from '../types/calendar.js';

export function parseTransfer(_content: string): TransferEntry[] {
  throw new Error('Transfer parser is not implemented in Phase 1 scaffold.');
}

export function parseScriptureTransfer(_content: string): TransferEntry[] {
  throw new Error('Scripture transfer parser is not implemented in Phase 1 scaffold.');
}
