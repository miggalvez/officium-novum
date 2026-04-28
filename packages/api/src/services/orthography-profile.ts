import { invalidQueryValue } from './errors.js';

export type TextOrthographyProfile = 'source' | 'version';

export function resolveOrthographyProfile(value: string | undefined): TextOrthographyProfile {
  const normalized = value ?? 'version';
  if (normalized === 'source' || normalized === 'version') {
    return normalized;
  }

  throw invalidQueryValue('orthography', 'Expected "source" or "version".');
}
