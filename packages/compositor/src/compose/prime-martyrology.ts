import { languageFallbackChain, type TextContent, type TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  DayOfficeSummary,
  HourName,
  SlotContent,
  SlotName,
  TextReference
} from '@officium-novum/rubrical-engine';

import { emitConfiguredSection } from '../emit/sections.js';
import { flattenConditionals } from '../flatten/index.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import { resolveReference } from '../resolve/reference-resolver.js';
import type { ComposeOptions, ComposeWarning, Section } from '../types/composed-hour.js';
import { appendContentWithBoundary } from './content-boundary.js';
import { MAX_DEFERRED_DEPTH } from './shared.js';

const COMMON_PRAYERS_PATH = 'horas/Latin/Psalterium/Common/Prayers';
const LATIN_MOON_ORDINALS = [
  'prima',
  'secúnda',
  'tértia',
  'quarta',
  'quinta',
  'sexta',
  'séptima',
  'octáva',
  'nona',
  'décima',
  'undécima',
  'duodécima',
  'tértia décima',
  'quarta décima',
  'quinta décima',
  'sexta décima',
  'décima séptima',
  'duodevicésima',
  'undevicésima',
  'vicésima',
  'vicésima prima',
  'vicésima secúnda',
  'vicésima tértia',
  'vicésima quarta',
  'vicésima quinta',
  'vicésima sexta',
  'vicésima séptima',
  'vicésima octáva',
  'vicésima nona',
  'tricésima'
] as const;

export interface PrimeMartyrologyComposeArgs {
  readonly slot: SlotName;
  readonly content: SlotContent;
  readonly hour: HourName;
  readonly summary: DayOfficeSummary;
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

interface MartyrologyDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly fileKey: string;
}

export function composePrimeMartyrologySection(
  args: PrimeMartyrologyComposeArgs
): Section | undefined {
  if (args.slot !== 'martyrology' || args.hour !== 'prime' || args.content.kind !== 'prime-martyrology') {
    return undefined;
  }

  const nextDate = nextMartyrologyDate(args.summary.date);
  const perLanguage = new Map<string, readonly TextContent[]>();

  for (const language of args.options.languages) {
    const path = primeMartyrologyPath(
      args.corpus,
      args.context.version.handle,
      language,
      args.options.langfb,
      nextDate.fileKey
    );
    if (!path) {
      continue;
    }

    const mobileKey = nextMobileMartyrologyKey(args.summary.temporal.dayName);
    const mobile = resolvePrimeMobileMartyrologyContent(language, mobileKey, args);
    const martyrology = formatPrimeMartyrologyContent(
      resolvePrimeMartyrologyFile(path, language, nextDate, args)
    );
    const bucket =
      mobileKey === 'Pasc0-1'
        ? [...formatPrimePrependedMobileMartyrologyContent(mobile), ...martyrology]
        : insertPrimeMobileMartyrologyContent(martyrology, mobile);
    appendPrimeMartyrologyTail(bucket, language, args, 'Conclmart');
    if (!shouldSkipPretiosa(args.summary)) {
      appendPrimeMartyrologyTail(bucket, language, args, 'Pretiosa');
    }

    if (bucket.length > 0) {
      perLanguage.set(language, Object.freeze(bucket));
    }
  }

  if (perLanguage.size === 0) {
    return undefined;
  }

  return emitConfiguredSection(
    {
      slot: 'martyrology'
    },
    perLanguage,
    `prime-martyrology:${nextDate.fileKey}`
  );
}

function nextMartyrologyDate(date: string): MartyrologyDateParts {
  const current = new Date(`${date}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + 1);

  return {
    year: current.getUTCFullYear(),
    month: current.getUTCMonth() + 1,
    day: current.getUTCDate(),
    fileKey: `${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`
  };
}

function primeMartyrologyPath(
  corpus: TextIndex,
  handle: string,
  language: string,
  langfb: string | undefined,
  fileKey: string
): string | undefined {
  const fallbackChain = languageFallbackChain(language, { langfb });
  for (const candidateLanguage of fallbackChain) {
    for (const candidatePath of primeMartyrologyCandidates(
      handle,
      candidateLanguage,
      fileKey
    )) {
      if (corpus.getFile(`${candidatePath}.txt`)) {
        return candidatePath;
      }
    }
  }

  return undefined;
}

function primeMartyrologyCandidates(
  handle: string,
  language: string,
  fileKey: string
): readonly string[] {
  const candidates: string[] = [];
  const latin = /^(Latin|la)(?:-|$)/iu.test(language);
  if (latin && handle.includes('1960')) {
    candidates.push(`horas/${language}/Martyrologium1960/${fileKey}`);
  } else if (latin && handle.includes('1955')) {
    candidates.push(`horas/${language}/Martyrologium1955R/${fileKey}`);
  } else if (latin && handle.includes('1570')) {
    candidates.push(`horas/${language}/Martyrologium1570/${fileKey}`);
  }
  candidates.push(`horas/${language}/Martyrologium/${fileKey}`);
  return candidates;
}

function resolvePrimeMobileMartyrologyContent(
  language: string,
  key: string | undefined,
  args: PrimeMartyrologyComposeArgs
): readonly TextContent[] {
  if (!key) {
    return [];
  }

  const path = primeMobileMartyrologyPath(
    args.corpus,
    args.context.version.handle,
    language,
    args.options.langfb
  );
  if (!path) {
    return [];
  }

  const resolved = resolveReference(
    args.corpus,
    {
      path,
      section: key
    },
    {
      languages: [language],
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek,
      date: args.context.date,
      season: args.context.season,
      version: args.context.version,
      modernStyleMonthday: args.context.version.handle.includes('1960'),
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    }
  );
  const section = resolved[language];
  if (!section || section.selectorMissing) {
    return [];
  }

  const expanded = expandDeferredNodes(section.content, {
    index: args.corpus,
    language,
    langfb: args.options.langfb,
    season: args.context.season,
    seen: new Set(),
    maxDepth: MAX_DEFERRED_DEPTH,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  return flattenConditionals(expanded, args.context);
}

function nextMobileMartyrologyKey(dayName: string): string | undefined {
  const easterOctave = /^Pasc0-([0-6])$/u.exec(dayName);
  if (easterOctave) {
    const day = Number(easterOctave[1]);
    return day === 6 ? 'Pasc1-0' : `Pasc0-${day + 1}`;
  }

  return undefined;
}

function primeMobileMartyrologyPath(
  corpus: TextIndex,
  handle: string,
  language: string,
  langfb: string | undefined
): string | undefined {
  const fallbackChain = languageFallbackChain(language, { langfb });
  for (const candidateLanguage of fallbackChain) {
    for (const candidatePath of primeMobileMartyrologyCandidates(handle, candidateLanguage)) {
      if (corpus.getFile(`${candidatePath}.txt`)) {
        return candidatePath;
      }
    }
  }

  return undefined;
}

function primeMobileMartyrologyCandidates(
  handle: string,
  language: string
): readonly string[] {
  const candidates: string[] = [];
  const latin = /^(Latin|la)(?:-|$)/iu.test(language);
  if (latin && handle.includes('1960')) {
    candidates.push(`horas/${language}/Martyrologium1960/Mobile`);
  } else if (latin && handle.includes('1955')) {
    candidates.push(`horas/${language}/Martyrologium1955R/Mobile`);
  } else if (latin && handle.includes('1570')) {
    candidates.push(`horas/${language}/Martyrologium1570/Mobile`);
  }
  candidates.push(`horas/${language}/Martyrologium/Mobile`);
  return candidates;
}

function resolvePrimeMartyrologyFile(
  path: string,
  language: string,
  nextDate: MartyrologyDateParts,
  args: PrimeMartyrologyComposeArgs
): TextContent[] {
  const ref: TextReference = {
    path,
    section: '__preamble'
  };
  const resolved = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  const section = resolved[language];
  if (!section || section.selectorMissing) {
    return [];
  }

  const expanded = expandDeferredNodes(section.content, {
    index: args.corpus,
    language,
    langfb: args.options.langfb,
    season: args.context.season,
    seen: new Set(),
    maxDepth: MAX_DEFERRED_DEPTH,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  const flattened = flattenConditionals(expanded, args.context);
  return appendMoonLabel(flattened, moonLabelForDate(nextDate, language));
}

function formatPrimeMartyrologyContent(content: readonly TextContent[]): TextContent[] {
  const bucket: TextContent[] = [];
  let marker: 'v.' | 'r.' = 'v.';
  for (const node of content) {
    if (node.type === 'separator') {
      bucket.push(node);
      marker = 'r.';
      continue;
    }

    if (node.type === 'text') {
      bucket.push({
        type: 'verseMarker',
        marker,
        text: node.value
      });
      marker = 'r.';
      continue;
    }

    bucket.push(node);
    marker = 'r.';
  }

  return bucket;
}

function formatPrimePrependedMobileMartyrologyContent(content: readonly TextContent[]): TextContent[] {
  if (content.length === 0) {
    return [];
  }

  return [
    ...content.map(
      (node): TextContent =>
        node.type === 'text'
          ? {
              type: 'verseMarker',
              marker: 'v.',
              text: node.value
            }
          : node
    ),
    { type: 'separator' }
  ];
}

function insertPrimeMobileMartyrologyContent(
  martyrology: readonly TextContent[],
  mobile: readonly TextContent[]
): TextContent[] {
  if (mobile.length === 0) {
    return [...martyrology];
  }

  const insertion = mobile.map(
    (node): TextContent =>
      node.type === 'text'
        ? {
            type: 'verseMarker',
            marker: 'r.',
            text: node.value
          }
        : node
  );
  const separatorIndex = martyrology.findIndex((node) => node.type === 'separator');
  if (separatorIndex === -1) {
    return [...martyrology, ...insertion];
  }

  return [
    ...martyrology.slice(0, separatorIndex + 1),
    ...insertion,
    ...martyrology.slice(separatorIndex + 1)
  ];
}

function appendPrimeMartyrologyTail(
  bucket: TextContent[],
  language: string,
  args: PrimeMartyrologyComposeArgs,
  section: 'Conclmart' | 'Pretiosa'
): void {
  const ref: TextReference = {
    path: COMMON_PRAYERS_PATH,
    section
  };
  const resolved = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  const sectionContent = resolved[language];
  if (!sectionContent || sectionContent.selectorMissing) {
    return;
  }

  const expanded = expandDeferredNodes(sectionContent.content, {
    index: args.corpus,
    language,
    langfb: args.options.langfb,
    season: args.context.season,
    seen: new Set(),
    maxDepth: MAX_DEFERRED_DEPTH,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  appendContentWithBoundary(bucket, flattenConditionals(expanded, args.context));
}

function appendMoonLabel(content: readonly TextContent[], label: string): TextContent[] {
  const out: TextContent[] = [];
  let appended = false;

  for (const node of content) {
    if (!appended && node.type === 'text') {
      out.push({
        type: 'text',
        value: `${node.value.trimEnd()} ${label}`.trim()
      });
      appended = true;
      continue;
    }

    out.push(node);
  }

  return out;
}

function moonLabelForDate(date: MartyrologyDateParts, language: string): string {
  const moonDay =
    date.year >= 1900 && date.year < 2200
      ? gregorianMoonDay(date)
      : computedMoonDay(date);

  if (/Latin/i.test(language)) {
    return `Luna ${LATIN_MOON_ORDINALS[moonDay - 1]} Anno Dómini ${date.year}`;
  }

  return `the ${moonDay}${ordinalSuffix(moonDay)} day of the Moon, in the year of our Lord ${date.year}`;
}

function gregorianMoonDay(date: MartyrologyDateParts): number {
  const golden = date.year % 19;
  const epact = [29, 10, 21, 2, 13, 24, 5, 16, 27, 8, 19, 30, 11, 22, 3, 14, 25, 6, 17];
  const om = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 100];

  om[12] = golden === 18 ? 29 : 30;
  if (isLeapYear(date.year) && date.month > 2) {
    om[1] = 30;
  }
  if (golden === 0) {
    om.unshift(30);
  }
  if (golden === 8 || golden === 11) {
    om.unshift(30);
  }

  const yday = perlYday(date);
  let num = -epact[golden]! - 1;
  let index = 0;

  while (num < yday) {
    num += om[index]!;
    index += 1;
  }
  num -= om[index - 1]!;
  return yday - num;
}

function computedMoonDay(date: MartyrologyDateParts): number {
  const epoch = perlDateToDays({ year: 2008, month: 1, day: 1, fileKey: '01-01' });
  const current = perlDateToDays(date);
  const elapsedDays = current - epoch;
  const lunarMonth = 29.53059;
  const epact2008 = 23;
  let distance =
    Math.floor(
      elapsedDays +
        epact2008 -
        Math.floor((elapsedDays + epact2008) / lunarMonth) * lunarMonth -
        0.25
    );
  if (distance <= 0) {
    distance += 30;
  }
  return distance;
}

function perlYday(date: MartyrologyDateParts): number {
  const days = perlDateToDays(date);
  if (days > 0 && days < 24_837) {
    return civilDayOfYear(date) - 1;
  }

  let count = 10_957;
  let yc = 20;
  let add = 0;
  let oldCount = count;
  let oldYc = yc;

  if (days < count) {
    while (days < count) {
      yc -= 1;
      add = yc % 4 === 0 ? 36_525 : 36_524;
      count -= add;
    }
  } else {
    while (days >= count) {
      oldCount = count;
      oldYc = yc;
      add = yc % 4 === 0 ? 36_525 : 36_524;
      count += add;
      yc += 1;
    }
    count = oldCount;
    yc = oldYc;
  }

  add = 4 * 365;
  if (yc % 4 === 0) {
    add += 1;
  }
  yc *= 100;
  oldCount = count;
  oldYc = yc;
  while (count <= days) {
    oldCount = count;
    oldYc = yc;
    count += add;
    add = 4 * 365 + 1;
    yc += 4;
  }

  count = oldCount;
  yc = oldYc;
  add = 366;
  if (yc % 100 === 0 && yc % 400 > 0) {
    add = 365;
  }
  let oldAdd = add;
  oldYc = yc;
  while (count <= days) {
    oldAdd = add;
    oldYc = yc;
    count += add;
    add = 365;
    yc += 1;
  }

  count -= oldAdd;
  return days - count + 1;
}

function perlDateToDays(date: MartyrologyDateParts): number {
  const year = date.year;
  const monthIndex = date.month - 1;
  const day = date.day;

  let yc = Math.floor(year / 100);
  let century = 20;
  let ret = 10_957;
  let add = 0;

  if (year < 2000) {
    while (century > yc) {
      century -= 1;
      add = century % 4 === 0 ? 36_525 : 36_524;
      ret -= add;
    }
  } else {
    while (century < yc) {
      add = century % 4 === 0 ? 36_525 : 36_524;
      ret += add;
      century += 1;
    }
  }

  add = 4 * 365;
  if (yc % 4 === 0) {
    add += 1;
  }
  yc *= 100;
  while (yc < year - (year % 4)) {
    ret += add;
    add = 4 * 365 + 1;
    yc += 4;
  }

  add = 366;
  if (yc % 100 === 0 && yc % 400 > 0) {
    add = 365;
  }
  while (yc < year) {
    ret += add;
    add = 365;
    yc += 1;
  }

  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  monthLengths[1] = isLeapYear(year) ? 29 : 28;
  let cursor = 0;
  while (cursor < monthIndex) {
    ret += monthLengths[cursor]!;
    cursor += 1;
  }
  ret += day - 1;
  return ret;
}

function civilDayOfYear(date: MartyrologyDateParts): number {
  const start = Date.UTC(date.year, 0, 1);
  const current = Date.UTC(date.year, date.month - 1, date.day);
  return Math.floor((current - start) / 86_400_000) + 1;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function ordinalSuffix(value: number): string {
  if (value > 3 && value < 21) {
    return 'th';
  }

  switch (value % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function shouldSkipPretiosa(summary: DayOfficeSummary): boolean {
  return summary.celebrationRules.comkey === 'C9' || summary.celebration.feastRef.path === 'Sancti/11-02';
}
