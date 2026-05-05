import type { ParsedSection, TextContent, TextIndex } from '@officium-novum/parser';

import {
  clampDayOfWeek,
  selectKeyedTextContent,
  WEEKDAY_KEYS
} from './keyed-content.js';
import { resolveAuxiliarySection } from './path.js';

const MATINS_SPECIAL_PATH = 'horas/Latin/Psalterium/Special/Matutinum Special';

export type InvitatoryMaterializationMode = 'Invit2' | 'Invit3' | 'Invit4';

export interface InvitatorySelectorDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function resolveSeasonalInvitatorium(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  section: ParsedSection,
  selector: string,
  dayOfWeek: number,
  date: InvitatorySelectorDate | undefined,
  modernStyleMonthday: boolean | undefined
): readonly TextContent[] | undefined {
  const antiphon = resolveInvitatoryAntiphonContent(
    index,
    language,
    langfb,
    selector,
    dayOfWeek,
    { date, modernStyleMonthday }
  );
  if (!antiphon) {
    return undefined;
  }

  return materializeInvitatoryContent(section.content, antiphon);
}

export function materializeInvitatoryContent(
  skeleton: readonly TextContent[],
  antiphon: readonly TextContent[],
  mode?: InvitatoryMaterializationMode
): readonly TextContent[] {
  const adjustedSkeleton = applyInvitatoryMaterializationMode(skeleton, mode);
  const fullAntiphon = invitatoryAntiphonVariant(antiphon, 'full');
  const repeatedAntiphon = invitatoryAntiphonVariant(antiphon, 'repeat');
  const replaced: TextContent[] = [];

  for (const node of adjustedSkeleton) {
    if (node.type === 'formulaRef' && node.name === 'ant') {
      replaced.push(...fullAntiphon);
      continue;
    }
    if (node.type === 'formulaRef' && node.name === 'ant2') {
      replaced.push(...repeatedAntiphon);
      continue;
    }
    replaced.push(node);
  }

  return Object.freeze(replaced);
}

export function resolveInvitatoryAntiphonContent(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  selector: string,
  dayOfWeek: number,
  options?: {
    readonly date?: InvitatorySelectorDate;
    readonly modernStyleMonthday?: boolean;
  }
): readonly TextContent[] | undefined {
  const source = invitatorySource(selector);
  const section = resolveAuxiliarySection(index, language, langfb, MATINS_SPECIAL_PATH, source.section);
  if (!section) {
    return undefined;
  }

  if (!source.weekdayKeyed) {
    return Object.freeze([...section.content]);
  }

  const weekdayKey = WEEKDAY_KEYS[clampDayOfWeek(dayOfWeek)] ?? WEEKDAY_KEYS[0];
  if (
    source.section === 'Invit' &&
    weekdayKey === 'Dominica' &&
    shouldUseFirstOrdinarySundayInvitatory(
      options?.date,
      options?.modernStyleMonthday ?? false
    )
  ) {
    const ordinarySunday = selectKeyedTextContent(section.content, 'Invit 1');
    if (ordinarySunday) {
      return ordinarySunday;
    }
  }
  return selectKeyedTextContent(section.content, weekdayKey);
}

function applyInvitatoryMaterializationMode(
  content: readonly TextContent[],
  mode?: InvitatoryMaterializationMode
): readonly TextContent[] {
  switch (mode) {
    case 'Invit2': {
      const [adjusted] = stripInvitatoryTailAtStar(content);
      return adjusted;
    }
    case 'Invit3':
      return applyInvit3Materialization(content);
    case 'Invit4': {
      const [adjusted] = stripInvitatoryTailAtPlus(content);
      return adjusted;
    }
    default:
      return content;
  }
}

function stripInvitatoryTailAtStar(
  content: readonly TextContent[]
): readonly [readonly TextContent[], boolean] {
  let stripped = false;
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      const [nested, nestedStripped] = stripInvitatoryTailAtStar(node.content);
      out.push({
        ...node,
        content: [...nested]
      });
      stripped ||= nestedStripped;
      continue;
    }

    if (!stripped && node.type === 'verseMarker' && node.text.includes('*')) {
      out.push({
        ...node,
        text: node.text.replace(/\s+\*.*$/u, '')
      });
      stripped = true;
      continue;
    }

    out.push(node);
  }

  return [Object.freeze(out), stripped];
}

function applyInvit3Materialization(
  content: readonly TextContent[]
): readonly TextContent[] {
  const [tailAdjusted] = stripInvitatoryTailAtCaret(content);
  const out: TextContent[] = [];

  for (let index = 0; index < tailAdjusted.length; index += 1) {
    const node = tailAdjusted[index]!;
    const nextNode = tailAdjusted[index + 1];
    if (node.type === 'conditional') {
      out.push({
        ...node,
        content: [...applyInvit3Materialization(node.content)]
      });
      continue;
    }
    if (node.type === 'macroRef' && node.name === 'Gloria') {
      out.push({ type: 'formulaRef', name: 'Gloria omittitur' });
      continue;
    }
    if (
      node.type === 'formulaRef' &&
      node.name === 'ant2' &&
      nextNode?.type === 'formulaRef' &&
      nextNode.name === 'ant'
    ) {
      continue;
    }
    out.push(node);
  }

  return Object.freeze(out);
}

function stripInvitatoryTailAtCaret(
  content: readonly TextContent[]
): readonly [readonly TextContent[], boolean] {
  let stripped = false;
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      const [nested, nestedStripped] = stripInvitatoryTailAtCaret(node.content);
      out.push({
        ...node,
        content: [...nested]
      });
      stripped ||= nestedStripped;
      continue;
    }

    if (!stripped && node.type === 'verseMarker' && /\s\^\s/u.test(node.text)) {
      const caretIndex = node.text.indexOf('^');
      const tail = node.text.slice(caretIndex + 1).trimStart();
      out.push({
        ...node,
        text: uppercaseLeadingText(tail)
      });
      stripped = true;
      continue;
    }

    out.push(node);
  }

  return [Object.freeze(out), stripped];
}

function stripInvitatoryTailAtPlus(
  content: readonly TextContent[]
): readonly [readonly TextContent[], boolean] {
  let stripped = false;
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      const [nested, nestedStripped] = stripInvitatoryTailAtPlus(node.content);
      out.push({
        ...node,
        content: [...nested]
      });
      stripped ||= nestedStripped;
      continue;
    }

    if (!stripped && node.type === 'verseMarker' && /\s\+\s/u.test(node.text)) {
      const plusIndex = node.text.indexOf('+');
      const tail = node.text.slice(plusIndex + 1).trimStart();
      out.push({
        ...node,
        text: uppercaseLeadingText(tail)
      });
      stripped = true;
      continue;
    }

    out.push(node);
  }

  return [Object.freeze(out), stripped];
}

function uppercaseLeadingText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`;
}

function invitatoryAntiphonVariant(
  content: readonly TextContent[],
  mode: 'full' | 'repeat'
): readonly TextContent[] {
  const [variant, captured] = invitatoryAntiphonVariantInner(content, mode);
  return captured ? Object.freeze(variant) : content;
}

function invitatoryAntiphonVariantInner(
  content: readonly TextContent[],
  mode: 'full' | 'repeat'
): readonly [readonly TextContent[], boolean] {
  let captured = false;
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      const [nested, nestedCaptured] = invitatoryAntiphonVariantInner(node.content, mode);
      out.push({
        ...node,
        content: [...nested]
      });
      captured ||= nestedCaptured;
      continue;
    }
    if (!captured && node.type === 'text') {
      out.push({
        type: 'verseMarker',
        marker: 'Ant.',
        text: mode === 'repeat' ? invitatoryRepeatText(node.value) : node.value
      });
      captured = true;
      continue;
    }
    out.push(node);
  }

  return [Object.freeze(out), captured];
}

function invitatoryRepeatText(text: string): string {
  const starIndex = text.indexOf('*');
  if (starIndex === -1) {
    return text.trim();
  }
  return text.slice(starIndex + 1).trim();
}

function invitatorySource(
  selector: string
): { readonly section: string; readonly weekdayKeyed: boolean } {
  switch (selector) {
    case 'Adventus':
      return { section: 'Invit Adv', weekdayKeyed: false };
    case 'Adventus3':
      return { section: 'Invit Adv3', weekdayKeyed: false };
    case 'Quadragesima':
      return { section: 'Invit Quad', weekdayKeyed: false };
    case 'Passio':
      return { section: 'Invit Quad5', weekdayKeyed: false };
    case 'Pascha':
    case 'Ascensio':
    case 'Pentecostes':
      return { section: 'Invit Pasch', weekdayKeyed: false };
    case 'Nativitatis':
    case 'Epiphania':
    case 'Septuagesima':
    case 'PostPentecosten':
    default:
      return { section: 'Invit', weekdayKeyed: true };
  }
}

function shouldUseFirstOrdinarySundayInvitatory(
  date: InvitatorySelectorDate | undefined,
  modernStyleMonthday: boolean
): boolean {
  if (!date) {
    return false;
  }
  if (date.month < 4) {
    return true;
  }
  const monthday = computeMonthdayKey(date, modernStyleMonthday);
  return monthday ? /^1\d\d-/u.test(monthday) : false;
}

function computeMonthdayKey(
  date: InvitatorySelectorDate,
  modernStyle: boolean
): string | undefined {
  if (date.month < 7) {
    return undefined;
  }

  const currentDayOfYear = dateToDayOfYear(date.day, date.month, date.year);
  let liturgicalMonth = 0;
  const firstSundays: number[] = [];

  for (let month = 8; month <= 12; month += 1) {
    const firstOfMonth = dateToDayOfYear(1, month, date.year);
    const weekday = dayOfWeek(1, month, date.year);
    let firstSunday = firstOfMonth - weekday;
    if (weekday >= 4 || (weekday > 0 && modernStyle)) {
      firstSunday += 7;
    }
    firstSundays[month - 8] = firstSunday;

    if (currentDayOfYear >= firstSunday) {
      liturgicalMonth = month;
    } else {
      break;
    }
  }

  if (liturgicalMonth === 0) {
    return undefined;
  }

  const adventStart = getAdventStartDayOfYear(date.year);
  if (liturgicalMonth > 10 && currentDayOfYear >= adventStart) {
    return undefined;
  }

  let week = Math.floor((currentDayOfYear - firstSundays[liturgicalMonth - 8]!) / 7);

  if (
    liturgicalMonth === 10 &&
    modernStyle &&
    week >= 2 &&
    dayOfMonthFromDayOfYear(firstSundays[10 - 8]!, date.year) >= 4
  ) {
    week += 1;
  }

  if (liturgicalMonth === 11 && (week > 0 || modernStyle)) {
    week = 4 - Math.floor((adventStart - currentDayOfYear - 1) / 7);
    if (modernStyle && week === 1) {
      week = 0;
    }
  }

  return `${String(liturgicalMonth).padStart(2, '0')}${week + 1}-${dayOfWeek(
    date.day,
    date.month,
    date.year
  )}`;
}

function getAdventStartDayOfYear(year: number): number {
  const christmas = dateToDayOfYear(25, 12, year);
  const christmasWeekday = dayOfWeek(25, 12, year) || 7;
  return christmas - christmasWeekday - 21;
}

function dayOfMonthFromDayOfYear(dayOfYear: number, year: number): number {
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];
  let remaining = dayOfYear;
  for (const length of monthLengths) {
    if (remaining <= length) {
      return remaining;
    }
    remaining -= length;
  }
  return remaining;
}

function dateToDayOfYear(day: number, month: number, year: number): number {
  const monthOffsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const leapOffset = isLeapYear(year) && month > 2 ? 1 : 0;
  return monthOffsets[month - 1]! + day + leapOffset;
}

function dayOfWeek(day: number, month: number, year: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
