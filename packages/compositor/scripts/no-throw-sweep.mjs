import { spawnSync } from 'node:child_process';

const years = parseYears(process.argv.slice(2));

const result = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', 'test/integration/no-throw-sweep.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(years.length > 0 ? { OFFICIUM_NO_THROW_YEARS: years.join(',') } : {})
    }
  }
);

process.exitCode = result.status ?? 1;

function parseYears(argv) {
  const years = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }
    if (arg.startsWith('--year=')) {
      const next = arg.slice('--year='.length);
      years.push(parseYear(next));
      continue;
    }
    if (arg !== '--year') {
      throw new Error(`Unknown argument ${arg}`);
    }
    const next = argv[index + 1];
    if (!next) {
      throw new Error('--year requires a value');
    }
    years.push(parseYear(next));
    index += 1;
  }
  return Array.from(new Set(years)).sort((left, right) => left - right);
}

function parseYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1583 || year > 9999) {
    throw new Error(`--year must be a valid Gregorian year, received ${JSON.stringify(value)}`);
  }
  return year;
}
