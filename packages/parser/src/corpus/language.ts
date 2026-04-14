export interface LanguageFallbackOptions {
  langfb?: string;
  latin?: string;
}

export function languageFallbackChain(
  language: string,
  options: LanguageFallbackOptions = {}
): string[] {
  const requested = language.trim();
  const langfb = options.langfb?.trim();
  const latin = options.latin?.trim() || 'Latin';
  const chain: string[] = [];

  appendLanguage(chain, requested);
  appendLanguage(chain, parentLanguage(requested));
  appendLanguage(chain, langfb);
  appendLanguage(chain, parentLanguage(langfb));
  appendLanguage(chain, latin);

  if (latin.toLowerCase() !== 'la') {
    appendLanguage(chain, 'la');
  }

  return chain.length > 0 ? chain : [latin];
}

function appendLanguage(chain: string[], value?: string): void {
  if (!value) {
    return;
  }

  const normalized = value.trim();
  if (!normalized) {
    return;
  }

  const exists = chain.some((entry) => entry.toLowerCase() === normalized.toLowerCase());
  if (!exists) {
    chain.push(normalized);
  }
}

function parentLanguage(language?: string): string | undefined {
  if (!language) {
    return undefined;
  }

  const index = language.indexOf('-');
  if (index < 0) {
    return undefined;
  }

  const parent = language.slice(0, index).trim();
  return parent.length > 0 ? parent : undefined;
}
