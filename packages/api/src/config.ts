import { resolve } from 'node:path';

import type { VersionRegistry } from '@officium-novum/rubrical-engine';

export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  readonly corpusPath: string;
  readonly contentVersion: string;
  readonly versionRegistry?: VersionRegistry;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    host: env.OFFICIUM_API_HOST ?? '127.0.0.1',
    port: parsePort(env.OFFICIUM_API_PORT),
    corpusPath: resolve(process.cwd(), env.OFFICIUM_CORPUS_PATH ?? 'upstream/web/www'),
    contentVersion: env.OFFICIUM_CONTENT_VERSION ?? 'dev'
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
