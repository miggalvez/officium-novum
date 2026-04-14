import type { RuleDirective } from '../types/directives.js';
import type { ParsedFile, ParsedSection, RawSection } from '../types/sections.js';
import { parseCondition } from './condition-parser.js';
import { parseDirectiveLine } from './directive-parser.js';
import { parseRankSection } from './rank-parser.js';
import { parseRuleLine } from './rule-parser.js';
import { splitSections } from './section-splitter.js';

export function parseFile(content: string, path: string): ParsedFile {
  const sections = splitSections(content).map((section) => parseSection(section));

  return {
    path,
    sections
  };
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
    const rules: RuleDirective[] = [];

    for (const line of section.lines) {
      const directive = parseRuleLine(line.text);
      if (directive) {
        rules.push(directive);
      }
    }

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
    content: section.lines.map((line) => parseDirectiveLine(line.text)),
    startLine: section.startLine,
    endLine: section.endLine
  };
}
