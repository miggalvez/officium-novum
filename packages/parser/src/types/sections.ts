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
