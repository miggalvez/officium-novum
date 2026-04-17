import type { ScriptureTransferEntry } from '@officium-novum/parser';

export function extractScriptureTransfer(
  entries: readonly ScriptureTransferEntry[],
  dateKey: string
): ScriptureTransferEntry | undefined {
  return entries.find((entry) => entry.dateKey === dateKey);
}
