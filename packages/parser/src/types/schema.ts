import type { Condition, ConditionalScope } from './conditions.js';
import type { CrossReference, GabcNotation, RuleDirective } from './directives.js';

export interface Feast {
  id: string;
  title: string;
  rank: Rank;
  color?: LiturgicalColor;
  cycle: 'temporal' | 'sanctoral';
  commune?: string;
  rules: RuleDirective[];
}

export interface Rank {
  name: string;
  classWeight: number;
  derivation?: string;
  condition?: Condition;
}

export type LiturgicalColor =
  | 'white'
  | 'red'
  | 'green'
  | 'violet'
  | 'black'
  | 'rose';

export interface TextBlock {
  section: string;
  content: TextContent[];
  condition?: Condition;
  sourceFile: string;
}

export type TextContent =
  | { type: 'text'; value: string }
  | { type: 'reference'; ref: CrossReference }
  | { type: 'psalmRef'; psalmNumber: number; antiphon?: string; tone?: string }
  | { type: 'macroRef'; name: string }
  | { type: 'formulaRef'; name: string }
  | { type: 'psalmInclude'; psalmNumber: number }
  | { type: 'citation'; value: string }
  | { type: 'rubric'; value: string }
  | {
      type: 'verseMarker';
      marker:
        | 'v.'
        | 'r.'
        | 'V.'
        | 'R.'
        | 'R.br.'
        | 'Responsorium.'
        | 'Ant.'
        | 'Benedictio.'
        | 'Absolutio.'
        | 'M.'
        | 'S.';
      text: string;
    }
  | { type: 'separator' }
  | { type: 'heading'; value: string }
  | {
      type: 'conditional';
      condition: Condition;
      content: TextContent[];
      scope: ConditionalScope;
    }
  | { type: 'gabcNotation'; notation: GabcNotation };
