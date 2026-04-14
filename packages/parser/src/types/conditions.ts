export interface Condition {
  expression: ConditionExpression;
  stopword?: Stopword;
  scopeDescriptor?: ScopeDescriptor;
  instruction?: Instruction;
  instructionModifier?: InstructionModifier;
}

export type ConditionExpression =
  | { type: 'match'; subject: ConditionSubject; predicate: string }
  | { type: 'not'; inner: ConditionExpression }
  | { type: 'and'; left: ConditionExpression; right: ConditionExpression }
  | { type: 'or'; left: ConditionExpression; right: ConditionExpression };

export type ConditionSubject =
  | 'rubrica'
  | 'rubricis'
  | 'tempore'
  | 'feria'
  | 'mense'
  | 'die'
  | 'missa'
  | 'communi'
  | 'commune'
  | 'votiva'
  | 'officio'
  | 'ad'
  | 'tonus'
  | 'toni';

export type Stopword = 'si' | 'sed' | 'vero' | 'atque' | 'attamen' | 'deinde';

export type ScopeDescriptor =
  | 'loco hujus versus'
  | 'loco horum versuum'
  | 'hic versus'
  | 'hoc versus'
  | 'hi versus'
  | 'hæc versus'
  | 'haec versus';

export type Instruction = 'dicitur' | 'dicuntur' | 'omittitur' | 'omittuntur';
export type InstructionModifier = 'semper';

export interface ConditionalScope {
  backwardLines: number;
  forwardMode: 'line' | 'paragraph' | 'block';
}
