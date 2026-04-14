import type { Condition } from './conditions.js';
import type { Rank } from './schema.js';

export interface ParsedRankLine {
  title: string;
  rank: Rank;
  sourceLine?: number;
  raw: string;
}

export interface RankParseOptions {
  condition?: Condition;
  language?: string;
}

export interface RankSectionMetadata {
  language: string;
  authoritative: boolean;
}
