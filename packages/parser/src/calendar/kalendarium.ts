import type { KalendariumEntry } from '../types/calendar.js';

const MONTH_HEADER_REGEX = /^\*.*\*$/u;

export function parseKalendarium(content: string): KalendariumEntry[] {
  const entries: KalendariumEntry[] = [];

  for (const rawLine of content.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || MONTH_HEADER_REGEX.test(line)) {
      continue;
    }

    const fields = line.split('=');
    const dateKey = fields[0]?.trim();
    const fileRefField = fields[1]?.trim();

    if (!dateKey || !fileRefField) {
      continue;
    }

    if (fileRefField === 'XXXXX') {
      entries.push({
        dateKey,
        fileRef: fileRefField,
        suppressed: true
      });
      continue;
    }

    const refs = fileRefField.split('~').map((value) => value.trim()).filter(Boolean);
    const fileRef = refs[0];
    if (!fileRef) {
      continue;
    }

    entries.push({
      dateKey,
      fileRef,
      alternates: refs.length > 1 ? refs.slice(1) : undefined,
      suppressed: false
    });
  }

  return entries;
}
