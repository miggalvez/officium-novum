import { languageFallbackChain, type TextContent, type TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  DayOfficeSummary,
  HourName,
  HourStructure,
  ResolvedVersion,
  SlotContent,
  SlotName,
  TextReference
} from '@officium-novum/rubrical-engine';

import { stripLaudsSecretoPrayers } from './compose/incipit.js';
import { resolveGloriaOmittiturReplacement } from './compose/gloria-omittitur.js';
import { composeMatinsSections } from './compose/matins.js';
import { applyDirectives } from './directives/index.js';
import { isWholeAntiphonSlot, markAntiphonFirstText } from './emit/antiphon-marker.js';
import { emitConfiguredSection } from './emit/sections.js';
import { flattenConditionals } from './flatten/index.js';
import { emitSection } from './emit/index.js';
import { expandDeferredNodes } from './resolve/expand-deferred-nodes.js';
import { resolveReference } from './resolve/reference-resolver.js';
import type { ComposedHour, ComposeOptions, ComposeWarning, Section } from './types/composed-hour.js';

const MAX_DEFERRED_DEPTH = 8;
const PSALMI_MINOR_SUFFIX = '/Psalterium/Psalmi/Psalmi minor';
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
const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;
const GLORIA_PATRI_MACRO: Extract<TextContent, { type: 'macroRef' }> = {
  type: 'macroRef',
  name: 'Gloria'
};

export interface ComposeInput {
  readonly corpus: TextIndex;
  readonly summary: DayOfficeSummary;
  readonly version: ResolvedVersion;
  readonly hour: HourName;
  readonly options: ComposeOptions;
}

/**
 * Assemble a {@link ComposedHour} for a given date/Hour/language set. Pure
 * function: consumes the corpus text index (Phase 1), the day-office summary
 * (Phase 2), and the resolved version, and emits a format-agnostic document.
 *
 * Expects a Phase-1-resolved corpus (`loadCorpus()` default behavior). This
 * phase still expands deferred node kinds that Phase 1 intentionally leaves in
 * place (`psalmInclude`, `macroRef`, `formulaRef`) and surfaces any residual
 * unresolved `reference` nodes in the output rather than dropping them.
 *
 * The pipeline for each slot is:
 *   1. Collect {@link TextReference}s from the slot content.
 *   2. Resolve each reference per requested language (with fallback chain).
 *   3. Expand deferred macros/formulas/psalm includes.
 *   4. Flatten conditional {@link TextContent} using the day's context.
 *   5. Apply {@link HourDirective} post-transforms.
 *   6. Emit a {@link Section} with merged parallel-language lines.
 */
export function composeHour(input: ComposeInput): ComposedHour {
  const hour = input.summary.hours[input.hour];
  if (!hour) {
    throw new Error(`HourStructure for ${input.hour} is not present on DayOfficeSummary`);
  }

  const context = buildConditionContext(input.summary, input.version);
  const sections: Section[] = [];
  const hymnDoxology = hour.slots['doxology-variant'];
  // Phase 3 §3f: warnings surfaced from the reference resolver,
  // deferred-node expander, and downstream Matins plan walker. Each
  // slot-compose pass pushes into this array; the aggregate lands on
  // `ComposedHour.warnings`.
  const warnings: ComposeWarning[] = [];
  const onWarning = (warning: ComposeWarning): void => {
    warnings.push(warning);
  };

  const specialCompline = composeTriduumSpecialComplineSection({
    hour: input.hour,
    structure: hour,
    summary: input.summary,
    corpus: input.corpus,
    options: input.options,
    context,
    onWarning
  });
  if (specialCompline) {
    sections.push(specialCompline);
    return Object.freeze({
      date: input.summary.date,
      hour: input.hour,
      celebration: input.summary.celebration.feastRef.title,
      languages: Object.freeze(Array.from(input.options.languages)),
      sections: Object.freeze(sections),
      warnings: Object.freeze(warnings)
    });
  }

  // Matins is plan-shaped (§16.3): composition walks InvitatoriumSource /
  // NocturnPlan / te-deum decisions rather than the generic SlotContent
  // dispatch. The generic path still emits the non-Matins slots (oration,
  // conclusion, commemorations, etc.) after the Matins-specific output.
  if (input.hour === 'matins') {
    const incipit = hour.slots.incipit;
    if (incipit) {
      const section = composeSlot({
        slot: 'incipit',
        content: incipit,
        hour: input.hour,
        summary: input.summary,
        directives: hour.directives,
        structure: hour,
        corpus: input.corpus,
        options: input.options,
        context,
        onWarning
      });
      if (section) {
        sections.push(section);
      }
    }

    sections.push(
      ...composeMatinsSections(hour, {
        corpus: input.corpus,
        summary: input.summary,
        options: input.options,
        directives: hour.directives,
        context,
        onWarning
      })
    );
  }

  for (const [slotName, slotContent] of Object.entries(hour.slots) as ReadonlyArray<
    [SlotName, SlotContent]
  >) {
    if (!slotContent) continue;
    if (slotName === 'doxology-variant') {
      continue;
    }
    if (input.hour === 'matins' && slotName === 'incipit') {
      continue;
    }
    if (input.hour === 'matins' && isMatinsOwnedSlot(slotName, slotContent)) {
      continue;
    }
    const section = composeSlot({
      slot: slotName,
      content: slotContent,
      hour: input.hour,
      summary: input.summary,
      directives: hour.directives,
      structure: hour,
      corpus: input.corpus,
      options: input.options,
      context,
      ...(slotName === 'hymn' && hymnDoxology ? { hymnDoxology } : {}),
      onWarning
    });
    if (section) {
      sections.push(section);
    }
  }

  return Object.freeze({
    date: input.summary.date,
    hour: input.hour,
    celebration: input.summary.celebration.feastRef.title,
    languages: Object.freeze(Array.from(input.options.languages)),
    sections: Object.freeze(sections),
    warnings: Object.freeze(warnings)
  });
}

interface ComposeTriduumSpecialComplineArgs {
  readonly hour: HourName;
  readonly structure: HourStructure;
  readonly summary: DayOfficeSummary;
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

function composeTriduumSpecialComplineSection(
  args: ComposeTriduumSpecialComplineArgs
): Section | undefined {
  if (args.hour !== 'compline' || args.structure.source?.kind !== 'triduum-special') {
    return undefined;
  }

  const ref: TextReference = {
    path: `horas/Latin/${args.summary.celebration.feastRef.path}`,
    section: 'Special Completorium'
  };
  const resolved = resolveReference(args.corpus, ref, {
    languages: args.options.languages,
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });

  const perLanguage = new Map<string, readonly TextContent[]>();
  for (const lang of args.options.languages) {
    const section = resolved[lang];
    if (!section) {
      continue;
    }
    if (section.selectorMissing) {
      perLanguage.set(
        lang,
        Object.freeze([
          {
            type: 'rubric',
            value: `(Section missing: ${ref.section})`
          } satisfies TextContent
        ])
      );
      continue;
    }
    const bucket: TextContent[] = [];
    const gloriaOmittiturReplacement = resolveGloriaOmittiturReplacement({
      directives: args.structure.directives,
      corpus: args.corpus,
      language: lang,
      langfb: args.options.langfb,
      context: args.context,
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const sourceNodes = flattenConditionals(section.content, args.context);
    for (const node of sourceNodes) {
      if (node.type === 'separator') {
        bucket.push({
          type: 'gabcNotation',
          notation: {
            kind: 'header',
            notation: '',
            text: '_'
          }
        });
        continue;
      }

      if (node.type === 'psalmInclude') {
        appendContentWithBoundary(bucket, [
          {
            type: 'gabcNotation',
            notation: {
              kind: 'header',
              notation: '',
              text: `Psalmus ${node.psalmNumber} [${node.psalmNumber}]`
            }
          }
        ]);
      }

      const expanded = expandDeferredNodes([node], {
        index: args.corpus,
        language: lang,
        langfb: args.options.langfb,
        season: args.context.season,
        seen: new Set(),
        maxDepth: MAX_DEFERRED_DEPTH,
        ...(args.onWarning ? { onWarning: args.onWarning } : {})
      });
      const flattened = flattenConditionals(expanded, args.context);
      // The Triduum uses a single `Special Completorium` source block rather
      // than the ordinary slot lattice. We still run the psalmody-style
      // normalizer/directive pass so inline psalm text canonicalizes the same
      // way as ordinary Compline while bypassing the ordinary short reading.
      const transformed = applyDirectives('psalmody', flattened, {
        hour: args.hour,
        directives: args.structure.directives,
        gloriaOmittiturReplacement
      });
      appendContentWithBoundary(bucket, transformed);
    }
    if (bucket.length > 0) {
      perLanguage.set(lang, Object.freeze(bucket));
    }
  }

  if (perLanguage.size === 0) {
    return undefined;
  }

  return emitConfiguredSection(
    {
      slot: 'psalmody',
      sectionSlot: 'special-compline',
      sectionType: 'other'
    },
    perLanguage,
    referenceKey(ref)
  );
}

interface MartyrologyDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly fileKey: string;
}

function composePrimeMartyrologySection(args: ComposeSlotArgs): Section | undefined {
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

    const bucket = formatPrimeMartyrologyContent(resolvePrimeMartyrologyFile(path, language, nextDate, args));
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

function composeLucanCanticleSection(args: ComposeSlotArgs): Section | undefined {
  if (!isLucanCanticleSlot(args.slot) || args.content.kind !== 'single-ref') {
    return undefined;
  }

  const perLanguage = new Map<string, readonly TextContent[]>();
  for (const language of args.options.languages) {
    const resolved = resolveReference(args.corpus, args.content.ref, {
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
      continue;
    }

    const gloriaOmittiturReplacement = resolveGloriaOmittiturReplacement({
      directives: args.directives,
      corpus: args.corpus,
      language,
      langfb: args.options.langfb,
      context: args.context,
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const expanded = expandDeferredNodes(withPsalmGloriaPatri(section.content), {
      index: args.corpus,
      language,
      langfb: args.options.langfb,
      season: args.context.season,
      seen: new Set(),
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives(args.slot, flattened, {
      hour: args.hour,
      directives: args.directives,
      gloriaOmittiturReplacement
    });

    const bucket = [...formatLucanCanticleContent(transformed)];
    const repeatedAntiphon = resolveRepeatedCanticleAntiphon(args, language);
    if (repeatedAntiphon.length > 0) {
      appendContentWithBoundary(bucket, repeatedAntiphon);
    }
    if (bucket.length > 0) {
      perLanguage.set(language, Object.freeze(bucket));
    }
  }

  if (perLanguage.size === 0) {
    return undefined;
  }

  return emitSection(args.slot, perLanguage, referenceKey(args.content.ref));
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

function resolvePrimeMartyrologyFile(
  path: string,
  language: string,
  nextDate: MartyrologyDateParts,
  args: ComposeSlotArgs
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

function formatLucanCanticleContent(content: readonly TextContent[]): readonly TextContent[] {
  const bucket: TextContent[] = [];
  let splitTitle = false;

  for (const node of content) {
    if (!splitTitle && node.type === 'text') {
      const parts = splitLucanCanticleTitle(node.value);
      if (parts) {
        bucket.push({ type: 'text', value: parts.title });
        bucket.push({ type: 'separator' });
        bucket.push({ type: 'text', value: parts.citation });
        bucket.push({ type: 'separator' });
        splitTitle = true;
        continue;
      }
    }

    bucket.push(node);
    if (node.type === 'text') {
      bucket.push({ type: 'separator' });
    }
  }

  return Object.freeze(bucket);
}

function splitLucanCanticleTitle(
  text: string
): { readonly title: string; readonly citation: string } | undefined {
  const match = text.trim().match(/^\((.+?)\s+\*\s+(.+)\)$/u);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return {
    title: match[1].trim(),
    citation: match[2].trim()
  };
}

function appendPrimeMartyrologyTail(
  bucket: TextContent[],
  language: string,
  args: ComposeSlotArgs,
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

/**
 * Matins owns slots that are plan-shaped or already composed by the
 * Matins-specific pass. We explicitly list them to avoid double-emission
 * when falling through to the generic dispatcher.
 */
function isMatinsOwnedSlot(slot: SlotName, content: SlotContent): boolean {
  if (slot === 'invitatory' || slot === 'psalmody' || slot === 'te-deum') {
    return true;
  }
  if (slot === 'hymn' && content.kind === 'single-ref') {
    return true;
  }
  return false;
}

interface ComposeSlotArgs {
  readonly slot: SlotName;
  readonly content: SlotContent;
  readonly hour: HourName;
  readonly summary: DayOfficeSummary;
  readonly directives: HourStructure['directives'];
  readonly structure: HourStructure;
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
  readonly hymnDoxology?: SlotContent;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

interface TaggedRef {
  readonly ref: TextReference;
  readonly isAntiphon: boolean;
  readonly openingAntiphon?: boolean;
  readonly repeatAntiphon?: boolean;
  /**
   * True when the psalm assignment also carried an explicit `antiphonRef`.
   * Wrapper sections such as `Psalmi major:Day0 Vespera` already embed their
   * own inline antiphons on each inner `psalmRef`; when an explicit antiphon
   * is present, the compositor suppresses only the first inline antiphon so
   * the rendered stream does not duplicate it before the first heading.
   */
  readonly hasExplicitAntiphon?: boolean;
  /**
   * 1-based position of this ref within the psalmody slot, counting every
   * {@link PsalmAssignment} (both psalms and any canticle assignments). Used
   * to emit the `Psalmus N [index]` heading that Perl prints before each
   * psalm at Lauds, Vespers, Prime, and the minor hours. `undefined` for
   * non-psalmody slots and for the antiphon half of each assignment pair.
   */
  readonly psalmIndex?: number;
}

function composeSlot(args: ComposeSlotArgs): Section | undefined {
  const primeMartyrology = composePrimeMartyrologySection(args);
  if (primeMartyrology) {
    return primeMartyrology;
  }

  const lucanCanticle = composeLucanCanticleSection(args);
  if (lucanCanticle) {
    return lucanCanticle;
  }

  const effectiveContent = directiveDrivenSlotContent(args) ?? args.content;
  const refs = taggedReferencesFrom(args.hour, args.slot, effectiveContent);
  if (refs.length === 0) return undefined;

  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }
  const hymnDoxologyByLanguage = resolveHymnDoxologyByLanguage(args);

  const primary = refs[0]?.ref;
  for (const { ref, isAntiphon, openingAntiphon, psalmIndex, hasExplicitAntiphon, repeatAntiphon } of refs) {
    const resolved = resolveReference(args.corpus, ref, {
      languages: args.options.languages,
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek,
      date: args.context.date,
      season: args.context.season,
      version: args.context.version,
      modernStyleMonthday: args.context.version.handle.includes('1960'),
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    for (const lang of args.options.languages) {
      const bucket = perLanguage.get(lang);
      if (!bucket) continue;
      const gloriaOmittiturReplacement =
        args.slot === 'psalmody'
          ? resolveGloriaOmittiturReplacement({
              directives: args.directives,
              corpus: args.corpus,
              language: lang,
              langfb: args.options.langfb,
              context: args.context,
              maxDepth: MAX_DEFERRED_DEPTH,
              ...(args.onWarning ? { onWarning: args.onWarning } : {})
            })
          : undefined;
      const section = resolved[lang];
      if (!section) continue;
      if (section.selectorMissing) {
        // Phase 2 emitted a `selector: 'missing'` sentinel — the source
        // section does not exist, so surface a rubric placeholder rather
        // than silently rendering whatever remained in the section.
        bucket.push({
          type: 'rubric',
          value: `(Section missing: ${ref.section})`
        });
        continue;
      }
      // Caller-supplied rubric intent per ADR-010: when the caller has just
      // prayed Matins and is continuing into Lauds, suppress the secreto
      // Pater / Ave block at the head of the Lauds `#Incipit`. The filter is
      // a no-op for every other Hour and slot.
      const sourceContent =
        args.hour === 'lauds' &&
        args.slot === 'incipit' &&
        args.options.joinLaudsToMatins === true
          ? stripLaudsSecretoPrayers(section.content)
          : section.content;
      if (args.slot === 'psalmody' && isAntiphon && containsInlinePsalmRefs(sourceContent)) {
        const antiphonOnly = markAntiphonFirstText(extractInlinePsalmAntiphons(sourceContent));
        const flattened = flattenConditionals(antiphonOnly, args.context);
        const transformed = applyDirectives(args.slot, flattened, {
          hour: args.hour,
          directives: args.directives
        });
        appendContentWithBoundary(
          bucket,
          repeatAntiphon
            ? normalizeRepeatedAntiphonContent(transformed)
            : openingAntiphon
              ? normalizeOpeningPsalmodyAntiphonContent(
                  transformed,
                  args.hour,
                  args.context.version,
                  ref
                )
              : transformed
        );
        continue;
      }
      if (
        args.slot === 'psalmody' &&
        !isAntiphon &&
        psalmIndex !== undefined &&
        containsInlinePsalmRefs(sourceContent)
      ) {
        appendExpandedPsalmWrapper(bucket, sourceContent, {
          hour: args.hour,
          directives: args.directives,
          context: args.context,
          index: args.corpus,
          language: lang,
          langfb: args.options.langfb,
          seen: new Set(),
          maxDepth: MAX_DEFERRED_DEPTH,
          psalmIndex,
          suppressFirstInlineAntiphon: hasExplicitAntiphon === true,
          suppressTrailingAntiphon: hasExplicitAntiphon === true,
          ...(args.onWarning ? { onWarning: args.onWarning } : {})
        });
        continue;
      }
      const expanded = expandDeferredNodes(
        args.slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? withPsalmGloriaPatri(sourceContent)
          : sourceContent,
        {
        index: args.corpus,
        language: lang,
        langfb: args.options.langfb,
        season: args.context.season,
        seen: new Set(),
        maxDepth: MAX_DEFERRED_DEPTH,
        ...(args.onWarning ? { onWarning: args.onWarning } : {})
        }
      );
      const flattened = flattenConditionals(expanded, args.context);
      // Directives run before final emission. For psalmody antiphon refs we
      // synthesize the `Ant.` marker first so transforms like `add-alleluia`
      // can target the antiphon line rather than no-op on bare text.
      const directiveInput = isAntiphon ? markAntiphonFirstText(flattened) : flattened;
      const transformed = applyDirectives(args.slot, directiveInput, {
        hour: args.hour,
        directives: args.directives,
        gloriaOmittiturReplacement
      });
      const withHymnDoxology =
        args.slot === 'hymn'
          ? replaceFinalHymnDoxology(transformed, hymnDoxologyByLanguage?.get(lang))
          : transformed;
      // Synthesise the `Ant.` marker the Perl renderer adds at presentation
      // time. Scoped per-ref: whole-antiphon slots (invitatory, canticle
      // antiphons, commemoration antiphons) mark every ref; psalmody marks
      // only its antiphon refs so psalm verses stay unmarked.
      const markered = isAntiphon
        ? repeatAntiphon
          ? normalizeRepeatedAntiphonContent(withHymnDoxology)
          : openingAntiphon
            ? normalizeOpeningPsalmodyAntiphonContent(
                withHymnDoxology,
                args.hour,
                args.context.version,
                ref
              )
            : withHymnDoxology
        : withHymnDoxology;
      // Phase 3 §3h — emit a `Psalmus N [index]` heading before each psalm
      // of the psalmody slot (and only for the psalmody slot — Matins
      // psalmody runs through its own composer and gets its headings from
      // `composeMatinsSections`). Perl prints this heading before every
      // psalm at Lauds / Vespers / minor hours; without it the compositor's
      // line stream diverges from the legacy renderer at the first psalm.
      if (args.slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined) {
        const heading = buildPsalmHeading(ref, transformed, psalmIndex);
        if (heading) {
          // Route the heading + its trailing separator through
          // `appendContentWithBoundary` so that the preceding psalm's last
          // text node gets a separator between itself and the heading —
          // without that the two text nodes would concatenate into a
          // single line at emit time.
          appendContentWithBoundary(bucket, [
            { type: 'text', value: heading },
            { type: 'separator' }
          ]);
        }
      }
      appendContentWithBoundary(bucket, markered);
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) frozen.set(lang, Object.freeze(nodes));
  }
  if (frozen.size === 0) return undefined;

  return emitSection(args.slot, frozen, primary ? referenceKey(primary) : undefined);
}

function directiveDrivenSlotContent(args: ComposeSlotArgs): SlotContent | undefined {
  const majorHourPrelude = majorHourOrationPreludeContent(args);
  if (majorHourPrelude) {
    return majorHourPrelude;
  }

  const oneAloneWrapper = oneAloneMinorHourWrapperContent(args);
  if (oneAloneWrapper) {
    return oneAloneWrapper;
  }

  if (args.slot === 'preces') {
    const ref = precesDirectiveReference(args.hour, args.directives);
    if (!ref) {
      return undefined;
    }

    return {
      kind: 'single-ref',
      ref
    };
  }

  if (args.slot !== 'suffragium') {
    return undefined;
  }

  const ref = suffragiumDirectiveReference(args);
  if (!ref) {
    return undefined;
  }

  return {
    kind: 'single-ref',
    ref
  };
}

function majorHourOrationPreludeContent(args: ComposeSlotArgs): SlotContent | undefined {
  if (args.slot !== 'oration' || (args.hour !== 'lauds' && args.hour !== 'vespers')) {
    return undefined;
  }

  const innerRefs = refsForWrappedOration(args.content);
  if (!innerRefs) {
    return undefined;
  }

  return {
    kind: 'ordered-refs',
    refs: [
      commonPrayerRef('Domine exaudi'),
      commonPrayerRef('Oremus'),
      ...innerRefs
    ]
  };
}

function precesDirectiveReference(
  hour: HourName,
  directives: HourStructure['directives']
): TextReference | undefined {
  const flags = new Set(directives);
  if (flags.has('preces-dominicales')) {
    if (hour === 'compline') {
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces dominicales Completorium'
      };
    }
    return undefined;
  }

  if (!flags.has('preces-feriales')) {
    return undefined;
  }

  switch (hour) {
    case 'lauds':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales Laudes'
      };
    case 'vespers':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales Vespera'
      };
    case 'prime':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales Prima'
      };
    case 'terce':
    case 'sext':
    case 'none':
      return {
        path: 'horas/Latin/Psalterium/Special/Preces',
        section: 'Preces feriales minora'
      };
    default:
      return undefined;
  }
}

function suffragiumDirectiveReference(args: ComposeSlotArgs): TextReference | undefined {
  const flags = new Set(args.directives);
  if (flags.has('omit-suffragium') || !flags.has('suffragium-of-the-saints')) {
    return undefined;
  }

  if (args.hour !== 'lauds' && args.hour !== 'vespers') {
    return undefined;
  }

  return {
    path: 'horas/Latin/Psalterium/Special/Major Special',
    section: suffragiumSection(args)
  };
}

function suffragiumSection(args: ComposeSlotArgs): string {
  const handle = args.context.version.handle;
  if (args.context.season === 'eastertide') {
    return 'Suffragium Paschale';
  }

  if (handle.includes('Tridentine') || handle.includes('1570') || handle.includes('1888') || handle.includes('1906')) {
    return args.hour === 'vespers' ? 'Suffragium Vespera' : 'Suffragium Laudes';
  }

  return 'Suffragium';
}

/**
 * Easter-Octave / one-alone minor-hour shape: `Capitulum Versum 2` replaces
 * the later block, leaving responsory + versicle empty while the source-backed
 * collect still needs the shared `Domine exaudi / Oremus` wrapper. For Prime,
 * the post-collect `Domine exaudi / Benedicamus` bridge lives in the oration
 * block itself; for Terce/Sext/None, the same lane materializes as a distinct
 * conclusion block immediately after the collect.
 */
function oneAloneMinorHourWrapperContent(args: ComposeSlotArgs): SlotContent | undefined {
  if (!usesOneAloneMinorHourWrapper(args)) {
    return undefined;
  }

  if (args.slot === 'oration') {
    const innerRefs = refsForOneAloneMinorHourOration(args.content);
    if (!innerRefs) {
      return undefined;
    }

    const refs: TextReference[] = [
      commonPrayerRef('Domine exaudi'),
      commonPrayerRef('Oremus'),
      ...innerRefs
    ];
    if (args.hour === 'prime') {
      refs.push(commonPrayerRef('Domine exaudi'), commonPrayerRef('Benedicamus Domino'));
    }

    return { kind: 'ordered-refs', refs };
  }

  if (args.slot === 'conclusion' && args.hour !== 'prime') {
    return {
      kind: 'ordered-refs',
      refs: [
        commonPrayerRef('Domine exaudi'),
        commonPrayerRef('Benedicamus Domino'),
        commonPrayerRef('Fidelium animae')
      ]
    };
  }

  return undefined;
}

function usesOneAloneMinorHourWrapper(args: ComposeSlotArgs): boolean {
  if (!isMinorHour(args.hour) || (args.slot !== 'oration' && args.slot !== 'conclusion')) {
    return false;
  }

  const chapter = args.structure.slots.chapter;
  const responsory = args.structure.slots.responsory;
  const versicle = args.structure.slots.versicle;

  return (
    chapter?.kind === 'single-ref' &&
    chapter.ref.section.trim() === 'Versum 2' &&
    responsory?.kind === 'empty' &&
    versicle?.kind === 'empty'
  );
}

function refsForOneAloneMinorHourOration(
  content: SlotContent
): readonly TextReference[] | undefined {
  return refsForWrappedOration(content);
}

function refsForWrappedOration(
  content: SlotContent
): readonly TextReference[] | undefined {
  switch (content.kind) {
    case 'single-ref':
      return [content.ref];
    case 'ordered-refs':
      return content.refs;
    default:
      return undefined;
  }
}

function commonPrayerRef(section: string): TextReference {
  return {
    path: COMMON_PRAYERS_PATH,
    section
  };
}

function taggedReferencesFrom(
  hour: HourName,
  slot: SlotName,
  content: SlotContent
): readonly TaggedRef[] {
  const wholeAntiphon = isWholeAntiphonSlot(slot);
  switch (content.kind) {
    case 'single-ref':
      return [{ ref: content.ref, isAntiphon: wholeAntiphon }];
    case 'ordered-refs':
      return content.refs.map((ref) => ({ ref, isAntiphon: wholeAntiphon }));
    case 'psalmody': {
      const refs: TaggedRef[] = [];
      const slotWideAntiphonRef = isMinorHour(hour) ? content.psalms[0]?.antiphonRef : undefined;
      if (slotWideAntiphonRef) {
        refs.push({
          ref: slotWideAntiphonRef,
          isAntiphon: true,
          openingAntiphon: true
        });
      }
      for (const [index, assignment] of content.psalms.entries()) {
        if (!slotWideAntiphonRef && assignment.antiphonRef) {
          refs.push({
            ref: assignment.antiphonRef,
            isAntiphon: true
          });
        }
        refs.push({
          ref: assignment.psalmRef,
          isAntiphon: false,
          psalmIndex: index + 1,
          hasExplicitAntiphon: slotWideAntiphonRef
            ? index === 0
            : Boolean(assignment.antiphonRef)
        });
        if (!slotWideAntiphonRef && assignment.antiphonRef) {
          refs.push({
            ref: assignment.antiphonRef,
            isAntiphon: true,
            repeatAntiphon: true
          });
        }
      }
      if (slotWideAntiphonRef) {
        refs.push({
          ref: slotWideAntiphonRef,
          isAntiphon: true,
          repeatAntiphon: true
        });
      }
      return refs;
    }
    case 'empty':
    case 'matins-invitatorium':
    case 'matins-nocturns':
    case 'te-deum':
      return [];
  }

  return [];
}

/**
 * Build the Perl-compatible `Psalmus N [index]` heading line for a psalm
 * reference. The psalm number is extracted in priority order:
 *
 *   1. Direct path match — the reference's `path` ends in `/Psalm<N>`.
 *      Simple case; used by the synthetic tests and by direct Psalmorum
 *      references.
 *   2. Selector-embedded psalm number — some selectors carry the psalm
 *      number in the form `"118(1-16)"` or `"N-M"` applied to a
 *      Psalmorum-anchored ref.
 *   3. Resolved-content verse prefix — when the ref goes through a
 *      wrapper (e.g. `Psalmi major:Day0 Laudes1`) the psalm verses in the
 *      expanded content carry `N:M` prefixes (e.g. `92:1 Dóminus
 *      regnávit...`); the first such prefix identifies the psalm.
 *
 * Returns `undefined` when no psalm number can be recovered; the compositor
 * then suppresses the heading rather than emitting a broken one. The
 * verse-range suffix appears when the reference's selector is an explicit
 * range like `"1-16"`, mirroring Perl's `Psalmus 118(1-16) [2]`.
 */
function buildPsalmHeading(
  ref: TextReference,
  expandedContent: readonly TextContent[],
  psalmIndex: number
): string | undefined {
  const selector = ref.selector?.trim();

  const pathMatch = ref.path.match(/\/Psalm(\d+)(?:\.txt)?$/u);
  const directPsalm = pathMatch?.[1];

  const contentPsalm = directPsalm ? undefined : extractPsalmNumberFromContent(expandedContent);
  const psalmNumber = directPsalm ?? contentPsalm;
  if (!psalmNumber) return undefined;

  const tokenRange =
    directPsalm && selector ? selector.match(/^\d+\(([^)]+)\)$/u)?.[1] : undefined;
  const rangeSuffix =
    directPsalm && selector && /^\d+-\d+$/u.test(selector)
      ? `(${selector})`
      : tokenRange
        ? `(${tokenRange})`
        : '';
  return `Psalmus ${psalmNumber}${rangeSuffix} [${psalmIndex}]`;
}

function containsInlinePsalmRefs(content: readonly TextContent[]): boolean {
  return content.some((node) => node.type === 'psalmRef');
}

function extractInlinePsalmAntiphons(content: readonly TextContent[]): readonly TextContent[] {
  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type === 'psalmRef') {
      const antiphon = node.antiphon?.trim();
      if (antiphon) {
        out.push({ type: 'text', value: antiphon });
      }
      continue;
    }
    out.push(node);
  }
  return out;
}

interface ExpandPsalmWrapperArgs {
  readonly hour: HourName;
  readonly directives: HourStructure['directives'];
  readonly context: ConditionEvalContext;
  readonly index: TextIndex;
  readonly language: string;
  readonly langfb?: string;
  readonly seen: ReadonlySet<string>;
  readonly maxDepth: number;
  readonly psalmIndex: number;
  readonly suppressFirstInlineAntiphon: boolean;
  readonly suppressTrailingAntiphon: boolean;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

function appendExpandedPsalmWrapper(
  target: TextContent[],
  content: readonly TextContent[],
  args: ExpandPsalmWrapperArgs
): void {
  let localPsalmOffset = 0;
  const gloriaOmittiturReplacement = resolveGloriaOmittiturReplacement({
    directives: args.directives,
    corpus: args.index,
    language: args.language,
    langfb: args.langfb,
    context: args.context,
    maxDepth: args.maxDepth,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  for (const node of content) {
    if (node.type !== 'psalmRef') {
      continue;
    }
    const priorAntiphon = lastStandaloneAntiphonText(target);
    const suppressFirstInlineAntiphon =
      args.suppressFirstInlineAntiphon ||
      (priorAntiphon !== undefined &&
        node.antiphon !== undefined &&
        normalizeRepeatedAntiphonText(priorAntiphon) === normalizeRepeatedAntiphonText(node.antiphon));
    const psalmNode =
      suppressFirstInlineAntiphon && localPsalmOffset === 0 && node.antiphon
        ? { ...node, antiphon: undefined }
        : node;
    const expanded = expandDeferredNodes(withPsalmGloriaPatri([psalmNode]), {
      index: args.index,
      language: args.language,
      langfb: args.langfb,
      season: args.context.season,
      seen: args.seen,
      maxDepth: args.maxDepth,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives('psalmody', flattened, {
      hour: args.hour,
      directives: args.directives,
      gloriaOmittiturReplacement
    });
    const [leadingAntiphon, psalmBody] = splitLeadingPsalmAntiphon(transformed);
    if (leadingAntiphon.length > 0) {
      appendContentWithBoundary(target, leadingAntiphon);
    }
    const heading = buildInlinePsalmHeading(node, transformed, args.psalmIndex + localPsalmOffset);
    if (heading) {
      appendContentWithBoundary(target, [
        { type: 'text', value: heading },
        { type: 'separator' }
      ]);
    }
    appendContentWithBoundary(target, psalmBody);
    const trailingAntiphon =
      args.suppressTrailingAntiphon ? undefined : node.antiphon?.trim();
    if (trailingAntiphon) {
      appendContentWithBoundary(target, [
        {
          type: 'verseMarker',
          marker: 'Ant.',
          text: normalizeRepeatedAntiphonText(trailingAntiphon)
        }
      ]);
    }
    localPsalmOffset += 1;
  }
}

function buildInlinePsalmHeading(
  node: Extract<TextContent, { type: 'psalmRef' }>,
  expandedContent: readonly TextContent[],
  psalmIndex: number
): string | undefined {
  const inlinePsalmNumber =
    Number.isFinite(node.psalmNumber) && node.psalmNumber > 0 ? String(node.psalmNumber) : undefined;
  const psalmNumber = inlinePsalmNumber ?? extractPsalmNumberFromContent(expandedContent);
  if (!psalmNumber) {
    return undefined;
  }
  return `Psalmus ${psalmNumber} [${psalmIndex}]`;
}

function splitLeadingPsalmAntiphon(
  content: readonly TextContent[]
): readonly [readonly TextContent[], readonly TextContent[]] {
  const first = content[0];
  if (first?.type === 'verseMarker' && first.marker === 'Ant.') {
    return [content.slice(0, 1), content.slice(1)];
  }
  return [[], content];
}

/**
 * Scan the expanded psalm content for the first text node whose value
 * begins with a `N:M` verse-number prefix (Perl's psalm verse format).
 * Return the psalm number as a string, or `undefined` if no match.
 *
 * The content may lead with non-text nodes (rubrics, antiphon marker,
 * heading, etc.), so the scan looks at every text node in order and stops
 * at the first verse-prefixed one. Nested conditionals are ignored — by
 * the time this runs, conditional flattening has collapsed matching
 * branches into the top-level content list.
 */
function extractPsalmNumberFromContent(
  content: readonly TextContent[]
): string | undefined {
  for (const node of content) {
    if (node.type !== 'text') continue;
    const match = node.value.match(/^\s*(\d+):\d+/u);
    if (match) return match[1];
  }
  return undefined;
}

function withPsalmGloriaPatri(content: readonly TextContent[]): readonly TextContent[] {
  return Object.freeze([...content, GLORIA_PATRI_MACRO]);
}

function lastStandaloneAntiphonText(content: readonly TextContent[]): string | undefined {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const node = content[index];
    if (!node || node.type === 'separator') {
      continue;
    }
    return node.type === 'verseMarker' && node.marker === 'Ant.' ? node.text : undefined;
  }
  return undefined;
}

function normalizeRepeatedAntiphonContent(
  content: readonly TextContent[]
): readonly TextContent[] {
  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node) continue;
    if (node.type === 'text') {
      out[index] = {
        type: 'text',
        value: normalizeRepeatedAntiphonText(node.value)
      };
      break;
    }
    if (node.type === 'verseMarker') {
      out[index] = {
        type: 'verseMarker',
        marker: node.marker,
        text: normalizeRepeatedAntiphonText(node.text)
      };
      break;
    }
  }
  return out;
}

function normalizeRepeatedAntiphonText(text: string): string {
  return text.replace(/\s*[*‡†]\s*/gu, ' ').replace(/\s{2,}/gu, ' ').trim();
}

function resolveRepeatedCanticleAntiphon(
  args: ComposeSlotArgs,
  language: string
): readonly TextContent[] {
  const antiphonSlot = lucanCanticleAntiphonSlot(args.slot);
  if (!antiphonSlot) {
    return [];
  }

  const content = args.structure.slots[antiphonSlot];
  if (!content) {
    return [];
  }

  const ref = taggedReferencesFrom(args.hour, antiphonSlot, content)[0]?.ref;
  if (!ref) {
    return [];
  }

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
  const transformed = applyDirectives(
    antiphonSlot,
    markAntiphonFirstText(flattened),
    {
      hour: args.hour,
      directives: args.directives
    }
  );

  return normalizeRepeatedAntiphonContent(transformed);
}

function isLucanCanticleSlot(slot: SlotName): boolean {
  return (
    slot === 'canticle-ad-benedictus' ||
    slot === 'canticle-ad-magnificat' ||
    slot === 'canticle-ad-nunc-dimittis'
  );
}

function lucanCanticleAntiphonSlot(
  slot: SlotName
): 'antiphon-ad-benedictus' | 'antiphon-ad-magnificat' | 'antiphon-ad-nunc-dimittis' | undefined {
  return (
    slot === 'canticle-ad-benedictus' ? 'antiphon-ad-benedictus'
    : slot === 'canticle-ad-magnificat' ? 'antiphon-ad-magnificat'
    : slot === 'canticle-ad-nunc-dimittis' ? 'antiphon-ad-nunc-dimittis'
    : undefined
  );
}

function normalizeOpeningPsalmodyAntiphonContent(
  content: readonly TextContent[],
  hour: HourName,
  version: ResolvedVersion,
  ref: TextReference
): readonly TextContent[] {
  if (!shouldNormalizeOpeningPsalmodyAntiphon(hour, version, ref)) {
    return content;
  }

  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node) continue;
    if (node.type === 'text') {
      out[index] = {
        type: 'text',
        value: normalizeOpeningPsalmodyAntiphonText(node.value)
      };
      break;
    }
    if (node.type === 'verseMarker') {
      out[index] = {
        type: 'verseMarker',
        marker: node.marker,
        text: normalizeOpeningPsalmodyAntiphonText(node.text)
      };
      break;
    }
  }
  return out;
}

function shouldNormalizeOpeningPsalmodyAntiphon(
  hour: HourName,
  version: ResolvedVersion,
  ref: TextReference
): boolean {
  if (!isMinorHour(hour) || version.handle.includes('1960')) {
    return false;
  }

  if (!ref.path.endsWith(PSALMI_MINOR_SUFFIX)) {
    return true;
  }

  return hour === 'prime';
}

function normalizeOpeningPsalmodyAntiphonText(text: string): string {
  const match = text.match(/^(.*?)(?:\s*[*‡†]\s*)(.+)$/u);
  if (!match) {
    return text;
  }

  const prefix = match[1]?.trim();
  if (!prefix) {
    return text;
  }

  if (/[.:!?]$/u.test(prefix)) {
    return prefix;
  }

  return `${prefix.replace(/[;,]\s*$/u, '').trim()}.`;
}

function isMinorHour(hour: SlotName | HourName): hour is 'prime' | 'terce' | 'sext' | 'none' {
  return hour === 'prime' || hour === 'terce' || hour === 'sext' || hour === 'none';
}

function resolveHymnDoxologyByLanguage(
  args: ComposeSlotArgs
): ReadonlyMap<string, readonly TextContent[]> | undefined {
  if (args.slot !== 'hymn' || !args.hymnDoxology) {
    return undefined;
  }

  const refs = taggedReferencesFrom(args.hour, 'doxology-variant', args.hymnDoxology);
  if (refs.length === 0) {
    return undefined;
  }

  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }

  for (const { ref } of refs) {
    const resolved = resolveReference(args.corpus, ref, {
      languages: args.options.languages,
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek,
      date: args.context.date,
      season: args.context.season,
      version: args.context.version,
      modernStyleMonthday: args.context.version.handle.includes('1960'),
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });

    for (const lang of args.options.languages) {
      const bucket = perLanguage.get(lang);
      const section = resolved[lang];
      if (!bucket || !section || section.selectorMissing) {
        continue;
      }

      const expanded = expandDeferredNodes(section.content, {
        index: args.corpus,
        language: lang,
        langfb: args.options.langfb,
        season: args.context.season,
        seen: new Set(),
        maxDepth: MAX_DEFERRED_DEPTH,
        ...(args.onWarning ? { onWarning: args.onWarning } : {})
      });
      const flattened = flattenConditionals(expanded, args.context);
      const transformed = applyDirectives('doxology-variant', flattened, {
        hour: args.hour,
        directives: args.directives
      });
      appendContentWithBoundary(bucket, transformed);
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) {
      frozen.set(lang, Object.freeze(nodes));
    }
  }
  return frozen.size > 0 ? frozen : undefined;
}

function replaceFinalHymnDoxology(
  content: readonly TextContent[],
  variant: readonly TextContent[] | undefined
): readonly TextContent[] {
  if (!variant || variant.length === 0) {
    return content;
  }

  let lastSeparator = -1;
  for (let index = content.length - 1; index >= 0; index -= 1) {
    if (content[index]?.type === 'separator') {
      lastSeparator = index;
      break;
    }
  }
  if (lastSeparator < 0) {
    return content;
  }

  return Object.freeze([
    ...content.slice(0, lastSeparator + 1),
    ...trimLeadingSeparators(variant)
  ]);
}

function trimLeadingSeparators(content: readonly TextContent[]): readonly TextContent[] {
  let start = 0;
  while (content[start]?.type === 'separator') {
    start += 1;
  }
  return content.slice(start);
}

function referenceKey(ref: TextReference): string {
  return `${ref.path}#${ref.section}${ref.selector ? `:${ref.selector}` : ''}`;
}

function appendContentWithBoundary(
  target: TextContent[],
  next: readonly TextContent[]
): void {
  if (next.length === 0) {
    return;
  }

  const last = target.at(-1);
  const first = next[0];
  if (last && first && isInlineBoundaryNode(last) && isInlineBoundaryNode(first)) {
    target.push({ type: 'separator' });
  }

  target.push(...next);
}

function isInlineBoundaryNode(node: TextContent): boolean {
  switch (node.type) {
    case 'text':
    case 'citation':
    case 'psalmRef':
    case 'macroRef':
    case 'formulaRef':
    case 'psalmInclude':
    case 'reference':
      return true;
    case 'verseMarker':
    case 'rubric':
    case 'separator':
    case 'heading':
    case 'conditional':
    case 'gabcNotation':
      return false;
  }
}

function buildConditionContext(
  summary: DayOfficeSummary,
  version: ResolvedVersion
): ConditionEvalContext {
  const [yearStr, monthStr, dayStr] = summary.date.split('-');
  return {
    date: {
      year: Number(yearStr),
      month: Number(monthStr),
      day: Number(dayStr)
    },
    dayOfWeek: summary.temporal.dayOfWeek,
    season: summary.temporal.season,
    version
  };
}
