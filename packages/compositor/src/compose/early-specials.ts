import type { TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  DayOfficeSummary,
  HourName,
  HourStructure
} from '@officium-novum/rubrical-engine';

import type { ComposeOptions, ComposeWarning, Section } from '../types/composed-hour.js';
import {
  composeDATriduumSecretoSection,
  composeEasterSundayPreludeSection,
  composeSpecialVespersSection,
  composeTriduumSpecialComplineSection,
  composeTriduumSuppressedVespersSection
} from './triduum-special.js';

interface ComposeEarlySpecialSectionsArgs {
  readonly hour: HourName;
  readonly structure: HourStructure;
  readonly summary: DayOfficeSummary;
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

export interface EarlySpecialSectionsResult {
  readonly sections: readonly Section[];
  readonly terminal: boolean;
}

export function composeEarlySpecialSections(
  args: ComposeEarlySpecialSectionsArgs
): EarlySpecialSectionsResult {
  const specialVespers = composeSpecialVespersSection(args);
  if (specialVespers) {
    return { sections: [specialVespers], terminal: true };
  }

  const sections: Section[] = [];
  const suppressedVespers = composeTriduumSuppressedVespersSection(args);
  if (suppressedVespers) {
    sections.push(suppressedVespers);
  }

  const easterSundayPrelude = composeEasterSundayPreludeSection(args);
  if (easterSundayPrelude) {
    sections.push(easterSundayPrelude);
  }

  const daTriduumSecreto = composeDATriduumSecretoSection(args);
  if (daTriduumSecreto) {
    sections.push(daTriduumSecreto);
  }

  const specialCompline = composeTriduumSpecialComplineSection(args);
  if (specialCompline) {
    sections.push(specialCompline);
    return { sections, terminal: true };
  }

  return { sections, terminal: false };
}
