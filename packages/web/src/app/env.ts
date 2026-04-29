declare const __OFFICIUM_BUILD_SHA__: string;
declare const __OFFICIUM_BUILD_DATE__: string;

export type DemoEnv = 'development' | 'preview' | 'production';

export interface DemoEnvironment {
  readonly apiBaseUrl: string;
  readonly publicBaseUrl: string;
  readonly githubReportUrl: string;
  readonly reportEmail: string;
  readonly buildSha: string;
  readonly buildDate: string;
  readonly env: DemoEnv;
}

function readVite(name: string, fallback = ''): string {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return meta[name] ?? fallback;
}

function readEnv(name: string, fallback: DemoEnv = 'development'): DemoEnv {
  const value = readVite(name);
  if (value === 'development' || value === 'preview' || value === 'production') {
    return value;
  }
  return fallback;
}

let cached: DemoEnvironment | undefined;

export function getEnvironment(): DemoEnvironment {
  if (cached) {
    return cached;
  }

  const buildSha =
    typeof __OFFICIUM_BUILD_SHA__ !== 'undefined' ? __OFFICIUM_BUILD_SHA__ : 'unknown';
  const buildDate =
    typeof __OFFICIUM_BUILD_DATE__ !== 'undefined'
      ? __OFFICIUM_BUILD_DATE__
      : new Date(0).toISOString();

  cached = {
    apiBaseUrl: readVite('VITE_OFFICIUM_API_BASE_URL', ''),
    publicBaseUrl: readVite('VITE_OFFICIUM_PUBLIC_BASE_URL', ''),
    githubReportUrl: readVite(
      'VITE_OFFICIUM_GITHUB_REPORT_URL',
      'https://github.com/miggalvez/officium-novum/issues/new'
    ),
    reportEmail: readVite('VITE_OFFICIUM_REPORT_EMAIL', ''),
    buildSha: readVite('VITE_OFFICIUM_BUILD_SHA', buildSha),
    buildDate: readVite('VITE_OFFICIUM_BUILD_DATE', buildDate),
    env: readEnv('VITE_OFFICIUM_ENV')
  };
  return cached;
}

export function resetEnvironmentCache(): void {
  cached = undefined;
}
