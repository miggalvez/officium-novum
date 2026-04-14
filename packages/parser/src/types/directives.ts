import type { Condition } from './conditions.js';

export interface CrossReference {
  path?: string;
  section?: string;
  lineSelector?: LineSelector;
  substitutions: Substitution[];
  isPreamble: boolean;
}

export interface LineSelector {
  type: 'single' | 'range' | 'inverse';
  start: number;
  end?: number;
}

export interface Substitution {
  pattern: string;
  replacement: string;
  flags: string;
}

export type GabcNotation =
  | { kind: 'header'; notation: string; text?: string }
  | { kind: 'path'; path: string }
  | { kind: 'inline'; notation: string };

export type RuleDirective =
  | RuleActionDirective
  | RuleAssignmentDirective
  | RuleReferenceDirective;

export interface RuleActionDirective {
  kind: 'action';
  keyword: string;
  args: string[];
  condition?: Condition;
  raw: string;
}

export interface RuleAssignmentDirective {
  kind: 'assignment';
  key: string;
  value: string;
  condition?: Condition;
  raw: string;
}

export interface RuleReferenceDirective {
  kind: 'reference';
  reference: CrossReference;
  condition?: Condition;
  raw: string;
}
