import {
  ensureTxtSuffix,
  languageFallbackChain,
  type ParsedSection,
  type TextIndex
} from '@officium-novum/parser';

export function resolveAuxiliarySection(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  latinPath: string,
  sectionName: string
): ParsedSection | undefined {
  const chain = languageFallbackChain(language, { langfb });
  for (const candidate of chain) {
    const candidatePath = swapLanguageSegment(latinPath, candidate);
    const section = index.getSection(ensureTxtSuffix(candidatePath), sectionName);
    if (section) {
      return section;
    }
  }
  return undefined;
}

/**
 * Replace the `Latin/` segment in a Phase-2-emitted reference path with the
 * requested language. Paths from Phase 2 are always Latin-rooted, e.g.
 * `horas/Latin/Commune/C4` or `horas/Latin/Psalterium/Major Special/Te Deum`.
 */
export function swapLanguageSegment(path: string, language: string): string {
  if (language === 'Latin') {
    return path;
  }
  if (path.startsWith('horas/Latin/')) {
    return `horas/${language}/${path.slice('horas/Latin/'.length)}`;
  }
  if (path.startsWith('missa/Latin/')) {
    return `missa/${language}/${path.slice('missa/Latin/'.length)}`;
  }
  if (path.startsWith('Latin/')) {
    return `${language}/${path.slice('Latin/'.length)}`;
  }
  return path;
}
