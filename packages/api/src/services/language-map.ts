import { invalidLanguage } from './errors.js';

export type PublicLanguageTag = 'la' | 'en';
export type CorpusLanguageName = 'Latin' | 'English';

export interface LanguageEntry {
  readonly tag: PublicLanguageTag;
  readonly corpusName: CorpusLanguageName;
  readonly label: string;
  readonly defaultFallback?: PublicLanguageTag;
}

export interface LanguageSelection {
  readonly publicTags: readonly PublicLanguageTag[];
  readonly corpusNames: readonly CorpusLanguageName[];
  readonly publicFallback?: PublicLanguageTag;
  readonly corpusFallback?: CorpusLanguageName;
  readonly toPublic: ReadonlyMap<CorpusLanguageName, PublicLanguageTag>;
  readonly toCorpus: ReadonlyMap<PublicLanguageTag, CorpusLanguageName>;
}

export function buildLanguageRegistry(): ReadonlyMap<PublicLanguageTag, LanguageEntry> {
  return new Map<PublicLanguageTag, LanguageEntry>([
    [
      'la',
      {
        tag: 'la',
        corpusName: 'Latin',
        label: 'Latin'
      }
    ],
    [
      'en',
      {
        tag: 'en',
        corpusName: 'English',
        label: 'English',
        defaultFallback: 'la'
      }
    ]
  ]);
}

export function resolveLanguages(input: {
  readonly lang?: string;
  readonly langfb?: string;
  readonly registry: ReadonlyMap<PublicLanguageTag, LanguageEntry>;
}): LanguageSelection {
  const publicTags = splitCommaList(input.lang ?? 'la');
  if (publicTags.length === 0) {
    throw invalidLanguage('At least one language is required.');
  }

  const entries = publicTags.map((tag) => {
    const entry = input.registry.get(tag as PublicLanguageTag);
    if (!entry) {
      throw invalidLanguage(`Unsupported language: ${tag}`);
    }
    return entry;
  });

  const fallback = input.langfb ? input.registry.get(input.langfb as PublicLanguageTag) : undefined;
  if (input.langfb && !fallback) {
    throw invalidLanguage(`Unsupported language fallback: ${input.langfb}`);
  }

  return {
    publicTags: entries.map((entry) => entry.tag),
    corpusNames: entries.map((entry) => entry.corpusName),
    ...(fallback ? { publicFallback: fallback.tag, corpusFallback: fallback.corpusName } : {}),
    toPublic: invertLanguageRegistry(input.registry),
    toCorpus: corpusLanguageRegistry(input.registry)
  };
}

function splitCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function invertLanguageRegistry(
  registry: ReadonlyMap<PublicLanguageTag, LanguageEntry>
): ReadonlyMap<CorpusLanguageName, PublicLanguageTag> {
  return new Map(Array.from(registry.values()).map((entry) => [entry.corpusName, entry.tag]));
}

function corpusLanguageRegistry(
  registry: ReadonlyMap<PublicLanguageTag, LanguageEntry>
): ReadonlyMap<PublicLanguageTag, CorpusLanguageName> {
  return new Map(Array.from(registry.values()).map((entry) => [entry.tag, entry.corpusName]));
}
