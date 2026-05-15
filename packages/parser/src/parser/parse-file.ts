import type { RuleDirective } from '../types/directives.js';
import type { ParsedFile, ParsedSection, RawSection } from '../types/sections.js';
import { parseCondition } from './condition-parser.js';
import { buildSectionContentFromLines } from './directive-parser.js';
import { parseRankSection } from './rank-parser.js';
import { parseRuleSection } from './rule-parser.js';
import { splitSections } from './section-splitter.js';

export function parseFile(content: string, path: string): ParsedFile {
  const rawSections = splitSections(content);
  const sections = parseRawSections(rawSections);

  return {
    path,
    sections
  };
}

export function parseRawSections(rawSections: readonly RawSection[]): ParsedSection[] {
  return rawSections.map((section) => parseSection(section));
}

function parseSection(section: RawSection): ParsedSection {
  const condition = section.condition ? parseCondition(section.condition) : undefined;

  if (section.header === 'Rank') {
    return {
      header: section.header,
      condition,
      content: [],
      rank: parseRankSection(
        section.lines.map((line) => ({
          text: line.text,
          lineNumber: line.lineNumber
        })),
        { condition }
      ),
      startLine: section.startLine,
      endLine: section.endLine
    };
  }

  if (section.header === 'Rule') {
    const rules: RuleDirective[] = parseRuleSection(
      section.lines.map((line) => ({
        text: line.text,
        lineNumber: line.lineNumber
      }))
    );

    return {
      header: section.header,
      condition,
      content: [],
      rules,
      startLine: section.startLine,
      endLine: section.endLine
    };
  }

  return {
    header: section.header,
    condition,
    content: buildSectionContentFromLines(section.lines.map((line) => line.text)),
    startLine: section.startLine,
    endLine: section.endLine
  };
}
