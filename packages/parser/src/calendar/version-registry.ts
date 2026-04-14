import type { VersionDefinition } from '../types/calendar.js';

export function parseVersionRegistry(content: string): VersionDefinition[] {
  const lines = content.replace(/\r\n?/gu, '\n').split('\n');
  const definitions: VersionDefinition[] = [];

  for (const [index, rawLine] of lines.entries()) {
    if (index === 0) {
      continue;
    }

    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const fields = line.split(',').map((field) => field.trim());
    const [version, kalendar, transfer, stransfer, base, transferBase] = fields;

    if (!version || !kalendar || !transfer || !stransfer) {
      continue;
    }

    definitions.push({
      version,
      kalendar,
      transfer,
      stransfer,
      base: base || undefined,
      transferBase: transferBase || undefined
    });
  }

  return definitions;
}
