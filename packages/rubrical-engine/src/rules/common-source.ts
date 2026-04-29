import type { TemporalContext } from '../types/model.js';
import type { CommonSourceVariant, RuleSeason } from '../types/rule-set.js';

const PASCHALTIDE_SEASONS = new Set<RuleSeason>([
  'eastertide',
  'ascensiontide',
  'pentecost-octave'
]);

const PASCHAL_COMMON_KEY_PATTERN = /^(C[1-3][a-z]*(?:-[12])?)$/iu;

export function commonSourceVariantForTemporal(
  temporal: Pick<TemporalContext, 'season' | 'dayName'>
): CommonSourceVariant | undefined {
  return PASCHALTIDE_SEASONS.has(temporal.season) || /^Pasc/iu.test(temporal.dayName)
    ? 'paschaltide'
    : undefined;
}

export function commonContentPathVariants(
  contentPath: string,
  variant: CommonSourceVariant | undefined
): readonly string[] {
  const normalized = stripTxtSuffix(contentPath);
  if (variant !== 'paschaltide') {
    return [normalized];
  }

  const paschal = paschalCommonContentPath(normalized);
  return paschal && paschal !== normalized ? [paschal, normalized] : [normalized];
}

export function commonKeyVariants(
  key: string,
  variant: CommonSourceVariant | undefined
): readonly string[] {
  const normalized = stripTxtSuffix(key);
  if (variant !== 'paschaltide') {
    return [normalized];
  }

  const paschal = paschalCommonKey(normalized);
  return paschal && paschal !== normalized ? [paschal, normalized] : [normalized];
}

function paschalCommonContentPath(contentPath: string): string | undefined {
  const match = /^(?:(horas\/Latin\/)?Commune\/)?([^/]+)$/iu.exec(contentPath);
  if (!match) {
    return undefined;
  }

  const prefix = match[1] ? 'horas/Latin/Commune/' : contentPath.includes('/') ? 'Commune/' : '';
  const key = match[2];
  if (!key) {
    return undefined;
  }

  const paschalKey = paschalCommonKey(key);
  return paschalKey ? `${prefix}${paschalKey}` : undefined;
}

function paschalCommonKey(key: string): string | undefined {
  if (key.endsWith('p')) {
    return key;
  }

  return PASCHAL_COMMON_KEY_PATTERN.test(key) ? `${key}p` : undefined;
}

function stripTxtSuffix(value: string): string {
  return value.replace(/\.txt$/iu, '');
}
