import { posix as pathPosix } from 'node:path';

export function normalizeRelativePath(relativePath: string): string {
  const slashNormalized = relativePath.replaceAll('\\', '/').trim();
  const normalized = pathPosix.normalize(slashNormalized);

  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

export function ensureTxtSuffix(path: string): string {
  return path.toLowerCase().endsWith('.txt') ? path : `${path}.txt`;
}
