import type { Condition, ConditionalScope } from './conditions.js';
import type { CrossReference, GabcNotation, RuleDirective } from './directives.js';

export interface TextSource {
  readonly path: string;
  readonly section: string;
}

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

type WithTextSource<T> = T & { readonly source?: TextSource };

export type TextContent =
  | WithTextSource<{ type: 'text'; value: string }>
  | WithTextSource<{ type: 'reference'; ref: CrossReference }>
  | WithTextSource<{ type: 'psalmRef'; psalmNumber: number; selector?: string; antiphon?: string; tone?: string }>
  | WithTextSource<{ type: 'macroRef'; name: string }>
  | WithTextSource<{ type: 'formulaRef'; name: string }>
  | WithTextSource<{ type: 'psalmInclude'; psalmNumber: number }>
  | WithTextSource<{ type: 'citation'; value: string }>
  | WithTextSource<{ type: 'rubric'; value: string }>
  | WithTextSource<{
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
    }>
  | WithTextSource<{ type: 'separator' }>
  | WithTextSource<{ type: 'heading'; value: string }>
  | WithTextSource<{
      type: 'conditional';
      condition: Condition;
      content: TextContent[];
      scope: ConditionalScope;
    }>
  | WithTextSource<{ type: 'gabcNotation'; notation: GabcNotation }>;
