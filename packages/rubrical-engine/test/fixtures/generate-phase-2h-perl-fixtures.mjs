import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PHASE_2H_2024_DATES = [
  '2024-01-01',
  '2024-01-06',
  '2024-01-07',
  '2024-01-13',
  '2024-01-14',
  '2024-01-28',
  '2024-02-11',
  '2024-02-14',
  '2024-02-18',
  '2024-02-24',
  '2024-02-25',
  '2024-03-03',
  '2024-03-10',
  '2024-03-17',
  '2024-03-19',
  '2024-03-24',
  '2024-03-25',
  '2024-03-26',
  '2024-03-27',
  '2024-03-28',
  '2024-03-29',
  '2024-03-30',
  '2024-03-31',
  '2024-04-01',
  '2024-04-02',
  '2024-04-03',
  '2024-04-04',
  '2024-04-05',
  '2024-04-06',
  '2024-04-07',
  '2024-05-09',
  '2024-05-19',
  '2024-05-26',
  '2024-05-30',
  '2024-06-16',
  '2024-06-20',
  '2024-06-24',
  '2024-06-29',
  '2024-06-30',
  '2024-07-01',
  '2024-07-06',
  '2024-08-15',
  '2024-08-19',
  '2024-08-22',
  '2024-09-08',
  '2024-09-12',
  '2024-09-15',
  '2024-09-29',
  '2024-10-04',
  '2024-10-06',
  '2024-11-01',
  '2024-11-05',
  '2024-11-08',
  '2024-12-01',
  '2024-12-08',
  '2024-12-15',
  '2024-12-22',
  '2024-12-24',
  '2024-12-25',
  '2024-12-26',
  '2024-12-27'
];

const FIXTURES = [
  {
    handle: 'Divino Afflatu - 1954',
    fixturePath: 'divino-afflatu-2024.json',
    dates: insertAfter(PHASE_2H_2024_DATES, '2024-04-07', '2024-04-08')
  },
  {
    handle: 'Reduced - 1955',
    fixturePath: 'reduced-1955-2024.json',
    dates: PHASE_2H_2024_DATES
  }
];

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = resolve(THIS_DIR, 'officium-snapshot.pl');

if (!existsSync(SNAPSHOT)) {
  throw new Error(`Missing snapshot helper at ${SNAPSHOT}`);
}

for (const fixtureConfig of FIXTURES) {
  const fixturePath = resolve(THIS_DIR, fixtureConfig.fixturePath);
  const rows = [];
  const failures = [];

  for (const date of fixtureConfig.dates) {
    try {
      rows.push(projectFixtureRow(fixtureConfig.handle, date));
    } catch (error) {
      failures.push({
        date,
        error: String(error instanceof Error ? error.message : error)
      });
    }
  }

  writeFileSync(
    fixturePath,
    JSON.stringify(
      {
        year: 2024,
        version: fixtureConfig.handle,
        rows,
        failures
      },
      null,
      2
    ).concat('\n')
  );
  console.log(`wrote ${fixtureConfig.fixturePath}: ${rows.length} rows, ${failures.length} failures`);
}

function insertAfter(dates, existingDate, insertedDate) {
  const index = dates.indexOf(existingDate);
  if (index === -1) {
    throw new Error(`Cannot insert ${insertedDate}; ${existingDate} is not in the date list.`);
  }
  return [...dates.slice(0, index + 1), insertedDate, ...dates.slice(index + 1)];
}

function projectFixtureRow(handle, isoDate) {
  const laudes = runSnapshot(handle, isoDate, 'Laudes');
  const vespers = runSnapshot(handle, isoDate, 'Vespera');
  const matins = runSnapshot(handle, isoDate, 'Matutinum');
  const tomorrowLaudes = runSnapshot(handle, nextIsoDate(isoDate), 'Laudes');

  const celebrationPath = normalizePath(laudes.winner);
  const concurrenceSourcePath = normalizePath(vespers.winner);
  const tomorrowCelebrationPath = normalizePath(tomorrowLaudes.winner);

  return {
    date: isoDate,
    celebrationPath,
    commemorations: normalizePaths(laudes.commemoentries),
    concurrenceWinner:
      concurrenceSourcePath === tomorrowCelebrationPath && concurrenceSourcePath !== celebrationPath
        ? 'tomorrow'
        : 'today',
    concurrenceSourcePath,
    complineSourceKind: /^Tempora\/Quad6-[456]r?$/u.test(celebrationPath)
      ? 'triduum-special'
      : 'vespers-winner',
    matinsTotalLessons:
      typeof matins.matinsLessons === 'number' && Number.isFinite(matins.matinsLessons)
        ? matins.matinsLessons
        : null
  };
}

function runSnapshot(version, isoDate, hour) {
  const result = spawnSync('perl', [SNAPSHOT, version, isoToMdy(isoDate), hour], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(
      `snapshot failed for ${version} ${isoDate} ${hour}: ${(result.stderr || result.stdout || '').trim()}`
    );
  }

  return JSON.parse(result.stdout);
}

function isoToMdy(isoDate) {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) {
    throw new Error(`invalid ISO date ${isoDate}`);
  }
  return `${month}-${day}-${year}`;
}

function nextIsoDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function normalizePaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }

  return paths
    .map((path) => normalizePath(path))
    .filter((path) => path.length > 0);
}

function normalizePath(path) {
  if (typeof path !== 'string') {
    return '';
  }

  return path.replace(/\.txt$/u, '');
}
