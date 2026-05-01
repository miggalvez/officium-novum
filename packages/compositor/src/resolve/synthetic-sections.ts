import {
  ensureTxtSuffix,
  type ParsedSection,
  type TextContent,
  type TextIndex
} from '@officium-novum/parser';
import type { TextReference } from '@officium-novum/rubrical-engine';

import { swapLanguageSegment } from './path.js';
import type { ResolvedSection, ResolveOptions } from './reference-resolver.js';

type SectionResolver = (
  index: TextIndex,
  path: string,
  sectionName: string
) => ParsedSection | undefined;

export function synthesizeSection(
  index: TextIndex,
  reference: TextReference,
  language: string,
  options: Pick<ResolveOptions, 'season'>,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  const commonPrayer = synthesizeLocalizedCommonPrayerSection(
    index,
    reference,
    language,
    resolveSectionByName
  );
  if (commonPrayer) {
    return commonPrayer;
  }

  const primaChapter = synthesizePrimaSpecialChapter(
    index,
    reference,
    language,
    resolveSectionByName
  );
  if (primaChapter) {
    return primaChapter;
  }

  if (isPaschalSeason(options.season)) {
    const special = synthesizePaschalSpecialResponsory(
      index,
      reference,
      language,
      resolveSectionByName
    );
    if (special) {
      return special;
    }
  }

  return synthesizeLocalizedCommonSection(index, reference, language, resolveSectionByName);
}

function synthesizeLocalizedCommonPrayerSection(
  index: TextIndex,
  reference: TextReference,
  language: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  if (
    language === 'Latin' ||
    reference.section !== 'benedictio Completorium' ||
    !reference.path.endsWith('/Psalterium/Common/Prayers')
  ) {
    return undefined;
  }

  const localizedPath = swapLanguageSegment(reference.path, language);
  const jube = firstSection(index, [localizedPath], 'Jube domne', resolveSectionByName);
  const benediction = firstSection(index, [localizedPath], 'Benedictio Completorium_', resolveSectionByName);
  if (!jube || !benediction) {
    return undefined;
  }

  return Object.freeze({
    language,
    path: jube.path,
    section: {
      header: reference.section,
      condition: undefined,
      startLine: jube.section.startLine,
      endLine: benediction.section.endLine,
      content: []
    },
    content: Object.freeze([...jube.section.content, ...benediction.section.content]),
    selectorUnhandled: false,
    selectorMissing: false
  });
}

function synthesizePrimaSpecialChapter(
  index: TextIndex,
  reference: TextReference,
  language: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  if (
    !PRIMA_SPECIAL_CHAPTER_SECTIONS.has(reference.section) ||
    !reference.path.endsWith('/Psalterium/Special/Prima Special')
  ) {
    return undefined;
  }

  const localizedPath = swapLanguageSegment(reference.path, language);
  const source = firstSection(index, [localizedPath], reference.section, resolveSectionByName);
  if (!source || source.section.content.some(isDeoGratiasFormula)) {
    return undefined;
  }

  const content =
    reference.selector === 'without-deo-gratias'
      ? source.section.content
      : ([...source.section.content, { type: 'formulaRef', name: 'Deo gratias' }] satisfies TextContent[]);

  return Object.freeze({
    language: source.language,
    path: source.path,
    section: source.section,
    content: Object.freeze(content),
    selectorUnhandled: false,
    selectorMissing: false
  });
}

const PRIMA_SPECIAL_CHAPTER_SECTIONS = new Set([
  'Dominica',
  'Feria',
  'Per Annum',
  'Adv',
  'Nat',
  'Epi',
  'Asc',
  'Quad',
  'Quad5',
  'Pasch',
  'Pent'
]);

function isDeoGratiasFormula(node: TextContent): boolean {
  return node.type === 'formulaRef' && /^deo gratias$/iu.test(node.name.trim());
}

function synthesizeLocalizedCommonSection(
  index: TextIndex,
  reference: TextReference,
  language: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  if (!reference.path.includes('/Commune/')) {
    return undefined;
  }

  const section = reference.section;
  const commonPaths = [
    swapLanguageSegment(reference.path, language),
    `horas/${language}/Commune/C1p`
  ];

  if (section === 'Responsory Breve Tertia') {
    return synthesizePaschalCommonShortResponsory(
      index,
      commonPaths,
      section,
      'Versum 1',
      resolveSectionByName
    );
  }
  if (section === 'Responsory Breve Sexta') {
    return synthesizePaschalCommonShortResponsory(
      index,
      commonPaths,
      section,
      'Nocturn 2 Versum',
      resolveSectionByName
    );
  }
  if (section === 'Responsory Breve Nona') {
    return synthesizePaschalCommonShortResponsory(
      index,
      commonPaths,
      section,
      'Nocturn 3 Versum',
      resolveSectionByName
    );
  }
  if (section === 'Capitulum Nona') {
    return synthesizePaschalCommonNonaChapter(index, commonPaths, section, resolveSectionByName);
  }

  return undefined;
}

function synthesizePaschalSpecialResponsory(
  index: TextIndex,
  reference: TextReference,
  language: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  if (
    reference.section === 'Responsory' &&
    reference.path.endsWith('/Psalterium/Special/Prima Special')
  ) {
    return synthesizePrimePaschalResponsory(index, reference, language, resolveSectionByName);
  }

  if (
    reference.section === 'Responsory Completorium' &&
    reference.path.endsWith('/Psalterium/Special/Minor Special')
  ) {
    return synthesizeComplinePaschalResponsory(index, reference, language, resolveSectionByName);
  }

  return undefined;
}

function synthesizePrimePaschalResponsory(
  index: TextIndex,
  reference: TextReference,
  language: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  const localizedPath = swapLanguageSegment(reference.path, language);
  const responsory = firstSection(index, [localizedPath], 'Responsory', resolveSectionByName);
  const paschal = firstSection(index, [localizedPath], 'Responsory Pasch', resolveSectionByName);
  const firstResponse = firstResponsoryResponse(responsory?.section.content);
  const paschalVersicle = firstTextContent(paschal?.section.content);
  if (!responsory || !firstResponse || !paschalVersicle) {
    return undefined;
  }

  return buildPaschalShortResponsorySection({
    source: responsory,
    header: reference.section,
    responseBase: normalizeStarredShortResponsoryBase(firstResponse.text),
    versicle: paschalVersicle,
    language
  });
}

function synthesizeComplinePaschalResponsory(
  index: TextIndex,
  reference: TextReference,
  language: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  const localizedPath = swapLanguageSegment(reference.path, language);
  const responsory = firstSection(index, [localizedPath], 'Responsory Completorium', resolveSectionByName);
  const firstResponse = firstResponsoryResponse(responsory?.section.content);
  const versicle = firstVerseMarker(responsory?.section.content, /^v\.?$/iu);
  if (!responsory || !firstResponse) {
    return undefined;
  }

  return buildPaschalShortResponsorySection({
    source: responsory,
    header: reference.section,
    responseBase: normalizeStarredShortResponsoryBase(firstResponse.text),
    language,
    ...(versicle ? { versicle: versicle.text } : {})
  });
}

function synthesizePaschalCommonShortResponsory(
  index: TextIndex,
  candidatePaths: readonly string[],
  sectionName: string,
  versicleSectionName: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  const source = firstSection(index, candidatePaths, versicleSectionName, resolveSectionByName);
  const first = source?.section.content.find(
    (node): node is Extract<TextContent, { type: 'verseMarker' }> =>
      node.type === 'verseMarker' && /^v\.?$/iu.test(node.marker.trim())
  );
  const second = source?.section.content.find(
    (node): node is Extract<TextContent, { type: 'verseMarker' }> =>
      node.type === 'verseMarker' && /^r\.?$/iu.test(node.marker.trim())
  );
  if (!source || !first || !second) {
    return undefined;
  }
  if (!hasAlleluiaTail(first.text) && !hasAlleluiaTail(second.text)) {
    return undefined;
  }

  const response = stripAlleluiaTail(first.text);
  const versicle = stripAlleluiaTail(second.text);
  return buildPaschalShortResponsorySection({
    source,
    header: sectionName,
    responseBase: response,
    versicle,
    language: source.language
  });
}

function synthesizePaschalCommonNonaChapter(
  index: TextIndex,
  candidatePaths: readonly string[],
  sectionName: string,
  resolveSectionByName: SectionResolver
): ResolvedSection | undefined {
  const source = firstSection(index, candidatePaths, 'Lectio Prima', resolveSectionByName);
  if (!source) {
    return undefined;
  }

  return Object.freeze({
    language: source.language,
    path: source.path,
    section: {
      header: sectionName,
      condition: undefined,
      startLine: source.section.startLine,
      endLine: source.section.endLine,
      content: []
    },
    content: Object.freeze([
      ...source.section.content,
      { type: 'formulaRef', name: 'Deo gratias' }
    ] satisfies TextContent[]),
    selectorUnhandled: false,
    selectorMissing: false
  });
}

function firstSection(
  index: TextIndex,
  candidatePaths: readonly string[],
  sectionName: string,
  resolveSectionByName: SectionResolver
): { readonly language: string; readonly path: string; readonly section: ParsedSection } | undefined {
  for (const path of candidatePaths) {
    const section = resolveSectionByName(index, path, sectionName);
    if (section) {
      const language = path.match(/^horas\/([^/]+)\//u)?.[1] ?? 'Latin';
      return {
        language,
        path: ensureTxtSuffix(path),
        section
      };
    }
  }
  return undefined;
}

function stripAlleluiaTail(value: string): string {
  return value.replace(/,?\s*allel(?:u|ú)(?:ia|ja)(?:,?\s*allel(?:u|ú)(?:ia|ja))*\.?\s*$/iu, '').trimEnd();
}

function hasAlleluiaTail(value: string): boolean {
  return /allel(?:u|ú)(?:ia|ja)(?:,?\s*allel(?:u|ú)(?:ia|ja))*\.?\s*$/iu.test(value.trim());
}

function isPaschalSeason(season: ResolveOptions['season']): boolean {
  return season === 'eastertide' || season === 'ascensiontide';
}

function firstResponsoryResponse(
  content: readonly TextContent[] | undefined
): Extract<TextContent, { type: 'verseMarker' }> | undefined {
  return firstVerseMarker(content, /^r\.?\s*br\.?$/iu);
}

function firstTextContent(content: readonly TextContent[] | undefined): string | undefined {
  const node = firstTextLike(content);
  if (!node) {
    return undefined;
  }
  return node.type === 'text' ? node.value : node.text;
}

function firstVerseMarker(
  content: readonly TextContent[] | undefined,
  marker: RegExp
): Extract<TextContent, { type: 'verseMarker' }> | undefined {
  for (const node of content ?? []) {
    if (node.type === 'verseMarker' && marker.test(node.marker.trim())) {
      return node;
    }
    if (node.type === 'conditional') {
      const nested = firstVerseMarker(node.content, marker);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function firstTextLike(
  content: readonly TextContent[] | undefined
): Extract<TextContent, { type: 'text' | 'verseMarker' }> | undefined {
  for (const node of content ?? []) {
    if (node.type === 'text' || node.type === 'verseMarker') {
      return node;
    }
    if (node.type === 'conditional') {
      const nested = firstTextLike(node.content);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function normalizeStarredShortResponsoryBase(value: string): string {
  const withoutAlleluia = stripAlleluiaTail(value).replace(/\s+/gu, ' ').trim();
  const match = /^(?<left>.*?)(?<comma>,?)\s*\*\s*(?<right>.+?)\.?$/u.exec(withoutAlleluia);
  if (!match?.groups) {
    return withoutAlleluia.replace(/\.?$/u, '');
  }

  const rawLeft = (match.groups.left ?? '').trim();
  const hasSourceComma = Boolean(match.groups.comma) || rawLeft.endsWith(',');
  const left = rawLeft.replace(/[,.]?$/u, '');
  const right = lowerInitial((match.groups.right ?? '').trim().replace(/\.?$/u, ''));
  return `${left}${hasSourceComma ? ', ' : ' '}${right}`;
}

function lowerInitial(value: string): string {
  const first = value[0];
  if (!first) {
    return value;
  }
  return `${first.toLocaleLowerCase()}${value.slice(1)}`;
}

function buildPaschalShortResponsorySection(args: {
  readonly source: { readonly language: string; readonly path: string; readonly section: ParsedSection };
  readonly header: string;
  readonly responseBase: string;
  readonly language: string;
  readonly versicle?: string;
}): ResolvedSection {
  const alleluia = alleluiaWords(args.language);
  const response = `${args.responseBase.replace(/\.?$/u, '')}, * ${alleluia.capitalized}, ${alleluia.lowercase}.`;
  const content: TextContent[] = [];
  if (args.header === 'Responsory Completorium') content.push({ type: 'separator' });
  content.push({ type: 'verseMarker', marker: 'R.br.', text: response }, { type: 'verseMarker', marker: 'R.', text: response });
  if (args.versicle) content.push({ type: 'verseMarker', marker: 'V.', text: stripAlleluiaTail(args.versicle).replace(/\.?$/u, '.') });
  content.push(
    { type: 'verseMarker', marker: 'R.', text: `${alleluia.capitalized}, ${alleluia.lowercase}.` },
    { type: 'macroRef', name: 'Gloria1' },
    { type: 'verseMarker', marker: 'R.', text: response }
  );
  if (args.header === 'Responsory Completorium') content.push({ type: 'separator' });

  return Object.freeze({
    language: args.source.language,
    path: args.source.path,
    section: {
      header: args.header,
      condition: undefined,
      startLine: args.source.section.startLine,
      endLine: args.source.section.endLine,
      content: []
    },
    content: Object.freeze(content),
    selectorUnhandled: false,
    selectorMissing: false
  });
}

function alleluiaWords(language: string): { readonly capitalized: string; readonly lowercase: string } {
  return language === 'English'
    ? { capitalized: 'Alleluia', lowercase: 'alleluia' }
    : { capitalized: 'Allelúia', lowercase: 'allelúia' };
}
