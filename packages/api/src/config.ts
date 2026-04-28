import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { VersionRegistry } from '@officium-novum/rubrical-engine';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const API_PACKAGE_ROOT = resolve(MODULE_DIR, '..');
const REPOSITORY_ROOT = resolve(API_PACKAGE_ROOT, '../..');

export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  readonly corpusPath: string;
  readonly contentVersion: string;
  readonly logger: boolean;
  readonly versionRegistry?: VersionRegistry;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    host: env.OFFICIUM_API_HOST ?? '127.0.0.1',
    port: parsePort(env.OFFICIUM_API_PORT),
    corpusPath: env.OFFICIUM_CORPUS_PATH
      ? resolve(env.OFFICIUM_CORPUS_PATH)
      : resolve(REPOSITORY_ROOT, 'upstream/web/www'),
    contentVersion: env.OFFICIUM_CONTENT_VERSION ?? 'dev',
    logger: parseBoolean(env.OFFICIUM_API_LOGGER)
  };
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid OFFICIUM_API_PORT: ${value}`);
  }
  return port;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  if (value === '1' || value.toLowerCase() === 'true') {
    return true;
  }
  if (value === '0' || value.toLowerCase() === 'false') {
    return false;
  }
  throw new Error(`Invalid OFFICIUM_API_LOGGER: ${value}`);
}
