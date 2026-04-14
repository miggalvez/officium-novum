import type { RawSection } from '../types/sections.js';

const SECTION_HEADER_REGEX = /^\s*\[([\p{L}\p{N}_ #,:-]+)\](?:\s*\((.+)\))?/u;

export function splitSections(content: string): RawSection[] {
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  const sections: RawSection[] = [];
  let current: RawSection | undefined;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const headerMatch = line.match(SECTION_HEADER_REGEX);

    if (headerMatch) {
      const header = headerMatch[1];
      if (!header) {
        return;
      }

      if (current) {
        sections.push(current);
      }

      current = {
        header: header.trim(),
        condition: headerMatch[2]?.trim() || undefined,
        lines: [],
        startLine: lineNumber,
        endLine: lineNumber
      };
      return;
    }

    if (!current) {
      current = {
        header: '__preamble',
        lines: [],
        startLine: lineNumber,
        endLine: lineNumber
      };
    }

    current.lines.push({ lineNumber, text: line });
    current.endLine = lineNumber;
  });

  if (current) {
    sections.push(current);
  }

  return sections;
}
