import type { Condition } from './conditions.js';
import type { RuleDirective } from './directives.js';
import type { ParsedRankLine } from './rank.js';
import type { TextContent } from './schema.js';

export interface SectionLine {
  lineNumber: number;
  text: string;
}

export interface RawSection {
  header: string;
  condition?: string;
  lines: SectionLine[];
  startLine: number;
  endLine: number;
}

export interface ParsedFile {
  path: string;
  sections: ParsedSection[];
}

export interface ParsedSection {
  header: string;
  condition?: Condition;
  content: TextContent[];
  rank?: ParsedRankLine[];
  rules?: RuleDirective[];
  startLine: number;
  endLine: number;
}
