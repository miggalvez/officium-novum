import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(THIS_DIR, '..', '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const UPSTREAM_ROOT = resolve(REPO_ROOT, 'upstream/web/www');
const DIVERGENCE_DIR = resolve(PACKAGE_ROOT, 'test/divergence');
const ADJUDICATIONS_FILE = resolve(DIVERGENCE_DIR, 'adjudications.json');
const PERL_SNAPSHOT = resolve(THIS_DIR, 'officium-content-snapshot.pl');

const PARSER_DIST = resolve(REPO_ROOT, 'packages/parser/dist/index.js');
const RUBRICAL_ENGINE_DIST = resolve(REPO_ROOT, 'packages/rubrical-engine/dist/index.js');
const COMPOSITOR_DIST = resolve(REPO_ROOT, 'packages/compositor/dist/index.js');

const HANDLE_CONFIG = {
  'Divino Afflatu - 1954': {
    title: 'Divino Afflatu',
    slug: 'divino-afflatu',
    dateFixture: resolve(REPO_ROOT, 'packages/rubrical-engine/test/fixtures/divino-afflatu-2024.json')
  },
  'Reduced - 1955': {
    title: 'Reduced 1955',
    slug: 'reduced-1955',
    dateFixture: resolve(REPO_ROOT, 'packages/rubrical-engine/test/fixtures/reduced-1955-2024.json')
  },
  'Rubrics 1960 - 1960': {
    title: 'Rubrics 1960',
    slug: 'rubrics-1960',
    // Phase 2h used the same shared 61-date Roman matrix for 1955 and 1960.
    dateFixture: resolve(REPO_ROOT, 'packages/rubrical-engine/test/fixtures/reduced-1955-2024.json')
  }
};

const HOURS = [
  { hour: 'matins', perlHour: 'Matutinum', label: 'Matins' },
  { hour: 'lauds', perlHour: 'Laudes', label: 'Lauds' },
  { hour: 'prime', perlHour: 'Prima', label: 'Prime' },
  { hour: 'terce', perlHour: 'Tertia', label: 'Terce' },
  { hour: 'sext', perlHour: 'Sexta', label: 'Sext' },
  { hour: 'none', perlHour: 'Nona', label: 'None' },
  { hour: 'vespers', perlHour: 'Vespera', label: 'Vespers' },
  { hour: 'compline', perlHour: 'Completorium', label: 'Compline' }
];

const args = parseArgs(process.argv.slice(2));

if (!existsSync(UPSTREAM_ROOT)) {
  throw new Error(`Missing upstream corpus at ${UPSTREAM_ROOT}`);
}
if (!existsSync(PERL_SNAPSHOT)) {
  throw new Error(`Missing Perl snapshot helper at ${PERL_SNAPSHOT}`);
}
for (const distPath of [PARSER_DIST, RUBRICAL_ENGINE_DIST, COMPOSITOR_DIST]) {
  if (!existsSync(distPath)) {
    throw new Error(
      `Missing build artifact ${distPath}. Run pnpm -r build before compare:phase-3-perl.`
    );
  }
}

const parser = await import(pathToFileURL(PARSER_DIST).href);
const rubricalEngine = await import(pathToFileURL(RUBRICAL_ENGINE_DIST).href);
const compositor = await import(pathToFileURL(COMPOSITOR_DIST).href);

const {
  loadCorpus,
  parseKalendarium,
  parseScriptureTransfer,
  parseTemporalSubstitutions,
  parseTransfer,
  parseVersionRegistry
} = parser;
const {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildTemporalSubstitutionTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine
} = rubricalEngine;
const { applyPublicSourceDisplayProfile, composeHour } = compositor;

const selectedHandles = args.version
  ? [args.version]
  : Object.keys(HANDLE_CONFIG);

for (const handle of selectedHandles) {
  if (!HANDLE_CONFIG[handle]) {
    throw new Error(
      `Unsupported --version ${JSON.stringify(handle)}. Expected one of: ${Object.keys(HANDLE_CONFIG).join(', ')}`
    );
  }
}

const selectedHours = args.hour
  ? HOURS.filter((entry) => entry.hour === args.hour || entry.perlHour === args.hour || entry.label === args.hour)
  : HOURS;
if (selectedHours.length === 0) {
  throw new Error(`Unknown --hour ${JSON.stringify(args.hour)}`);
}

const rawCorpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
const resolvedCorpus = await loadCorpus(UPSTREAM_ROOT);
const versionRegistry = buildVersionRegistry(
  parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
);
const kalendarium = buildKalendariumTable(loadKalendaria());
const yearTransfers = buildYearTransferTable(loadTransferTables());
const scriptureTransfers = buildScriptureTransferTable(loadScriptureTransferTables());
const temporalSubstitutions = buildTemporalSubstitutionTable(loadTemporalSubstitutionTables());

let totalMismatches = 0;
mkdirSync(DIVERGENCE_DIR, { recursive: true });

// Hand-maintained adjudication sidecar; see ADR-011.
// The harness reads and merges this into the generated ledger but never writes
// it back, so classifications and citations survive ledger regeneration.
const adjudications = loadAdjudications();

for (const handle of selectedHandles) {
  const config = HANDLE_CONFIG[handle];
  const dates = loadDates(config.dateFixture, args.date, args.year, args.yearProvided);
  const engine = createRubricalEngine({
    corpus: rawCorpus.index,
    kalendarium,
    yearTransfers,
    scriptureTransfers,
    temporalSubstitutions,
    versionRegistry,
    version: asVersionHandle(handle),
    policyMap: VERSION_POLICY
  });

  const mismatches = [];
  const mismatchCountsByHour = new Map(selectedHours.map((entry) => [entry.label, 0]));
  let comparedHours = 0;

  for (const date of dates) {
    const summary = engine.resolveDayOfficeSummary(date);

    for (const hourConfig of selectedHours) {
      comparedHours += 1;

      try {
        const perlSnapshot = runPerlSnapshot({
          handle,
          date,
          perlHour: hourConfig.perlHour,
          language: args.language,
          otherLanguage: args.otherLanguage
        });
        const expected = normalizePerlLines(selectUnitsForLanguage(perlSnapshot, args.language));

        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: hourConfig.hour,
          options: {
            languages: [args.language],
            langfb: args.langfb,
            // ADR-010: the Perl helper at `officium-content-snapshot.pl`
            // snapshots one Hour at a time via `command=pray$hour`, which
            // renders Lauds in the *separated* form (Pater / Ave are
            // emitted at the Lauds opening under policies that do not
            // suppress them via `omittuntur`). Mirror that explicitly so
            // the Hour-by-Hour parity comparison is apples-to-apples.
            ...(hourConfig.hour === 'lauds' ? { joinLaudsToMatins: false } : {})
          }
        });
        const actual = normalizeComposedLines(composed, args.language);
        const mismatch = compareLineArrays(expected, actual, { window: args.debugWindow });
        if (mismatch) {
          mismatches.push({
            date,
            hour: hourConfig.label,
            expectedCount: expected.length,
            actualCount: actual.length,
            ...mismatch
          });
          mismatchCountsByHour.set(
            hourConfig.label,
            (mismatchCountsByHour.get(hourConfig.label) ?? 0) + 1
          );
        }
      } catch (error) {
        mismatches.push({
          date,
          hour: hourConfig.label,
          expectedCount: 0,
          actualCount: 0,
          firstMismatchIndex: 0,
          expectedLine: null,
          actualLine: null,
          expectedContext: [],
          actualContext: [],
          error: String(error instanceof Error ? error.message : error)
        });
        mismatchCountsByHour.set(
          hourConfig.label,
          (mismatchCountsByHour.get(hourConfig.label) ?? 0) + 1
        );
      }
    }
  }

  totalMismatches += mismatches.length;

  console.log(
    `${handle}: ${mismatches.length} divergent hours across ${comparedHours} comparisons`
  );
  for (const mismatch of mismatches.slice(0, args.maxReport)) {
    const expected = mismatch.expectedLine === null ? '∅' : JSON.stringify(mismatch.expectedLine);
    const actual = mismatch.actualLine === null ? '∅' : JSON.stringify(mismatch.actualLine);
    const suffix = mismatch.error ? ` (${mismatch.error})` : '';
    console.log(
      `  ${mismatch.date} ${mismatch.hour} line ${mismatch.firstMismatchIndex + 1}: expected=${expected} actual=${actual}${suffix}`
    );
    if (args.debugWindow > 0) {
      const start = (mismatch.contextStart ?? 0) + 1;
      console.log(`    expected (Perl) context [from line ${start}]:`);
      for (const line of mismatch.expectedContext ?? []) {
        console.log(`      ${JSON.stringify(line).slice(0, 220)}`);
      }
      console.log(`    actual (compositor) context [from line ${start}]:`);
      for (const line of mismatch.actualContext ?? []) {
        console.log(`      ${JSON.stringify(line).slice(0, 220)}`);
      }
    }
  }

  const classifiedMismatches = mismatches.map((mismatch) => ({
    ...mismatch,
    rowKey: computeRowKey({
      policy: handle,
      date: mismatch.date,
      hour: mismatch.hour,
      firstExpected: mismatch.expectedLine,
      firstActual: mismatch.actualLine
    }),
    adjudication: adjudications[
      computeRowKey({
        policy: handle,
        date: mismatch.date,
        hour: mismatch.hour,
        firstExpected: mismatch.expectedLine,
        firstActual: mismatch.actualLine
      })
    ]
  }));

  if (args.writeDocs) {
    writeFileSync(
      divergenceDocPath(config, args.year),
      renderDivergenceDoc({
        handle,
        title: config.title,
        year: args.year,
        comparedHours,
        dates,
        mismatches: classifiedMismatches,
        mismatchCountsByHour,
        hours: selectedHours,
        language: args.language,
        maxRows: args.maxDocRows
      })
    );
  }
}

if (totalMismatches > 0) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {
    version: undefined,
    hour: undefined,
    date: undefined,
    year: 2024,
    yearProvided: false,
    language: 'Latin',
    otherLanguage: 'English',
    langfb: 'English',
    maxReport: 20,
    maxDocRows: 40,
    writeDocs: true,
    debugWindow: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case '--':
        break;
      case '--version':
        if (!next) throw new Error('--version requires a value');
        out.version = next;
        index += 1;
        break;
      case '--hour':
        if (!next) throw new Error('--hour requires a value');
        out.hour = next;
        index += 1;
        break;
      case '--date':
        if (!next) throw new Error('--date requires a value');
        out.date = next;
        index += 1;
        break;
      case '--year':
        if (!next) throw new Error('--year requires a value');
        out.year = Number(next);
        if (!Number.isInteger(out.year) || out.year < 1583 || out.year > 9999) {
          throw new Error(`--year must be a valid Gregorian year, received ${JSON.stringify(next)}`);
        }
        out.yearProvided = true;
        index += 1;
        break;
      case '--language':
        if (!next) throw new Error('--language requires a value');
        out.language = next;
        index += 1;
        break;
      case '--other-language':
        if (!next) throw new Error('--other-language requires a value');
        out.otherLanguage = next;
        index += 1;
        break;
      case '--langfb':
        if (!next) throw new Error('--langfb requires a value');
        out.langfb = next;
        index += 1;
        break;
      case '--max-report':
        if (!next) throw new Error('--max-report requires a value');
        out.maxReport = Number(next);
        index += 1;
        break;
      case '--max-doc-rows':
        if (!next) throw new Error('--max-doc-rows requires a value');
        out.maxDocRows = Number(next);
        index += 1;
        break;
      case '--no-write-docs':
        out.writeDocs = false;
        break;
      case '--debug-window':
        if (!next) throw new Error('--debug-window requires a value');
        out.debugWindow = Number(next);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument ${arg}`);
    }
  }

  return out;
}

function loadDates(fixturePath, selectedDate, year, yearProvided) {
  // Phase 3 §3g: `--date __full-year__` stays backward-compatible with the
  // original 2024 full-year runner. Explicit `--year` means the caller wants
  // the whole civil year, including `--year 2024`.
  if (selectedDate === '__full-year__') {
    return enumerateYear(year ?? 2024);
  }

  if (!selectedDate && yearProvided) {
    return enumerateYear(year);
  }

  if (!existsSync(fixturePath)) {
    throw new Error(`Missing fixture ${fixturePath}`);
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const dates = Array.from(
    new Set((fixture.rows ?? []).map((row) => row.date).filter((value) => typeof value === 'string'))
  ).sort((left, right) => left.localeCompare(right));

  if (!selectedDate) {
    return dates;
  }

  return [selectedDate];
}

function enumerateYear(year) {
  const out = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  for (let day = start; day < end; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
    const month = String(day.getUTCMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(day.getUTCDate()).padStart(2, '0');
    out.push(`${day.getUTCFullYear()}-${month}-${dayOfMonth}`);
  }
  return out;
}

function divergenceDocPath(config, year) {
  return resolve(DIVERGENCE_DIR, `${config.slug}-${year}.md`);
}

function loadKalendaria() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Kalendaria');
  return readDirTxt(dir).map((name) => ({
    name: name.slice(0, -4),
    entries: parseKalendarium(readFileSync(resolve(dir, name), 'utf8'))
  }));
}

function loadTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Transfer');
  return readDirTxt(dir).map((name) => ({
    yearKey: name.slice(0, -4),
    entries: parseTransfer(readFileSync(resolve(dir, name), 'utf8'))
  }));
}

function loadScriptureTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Stransfer');
  return readDirTxt(dir).map((name) => ({
    yearKey: name.slice(0, -4),
    entries: parseScriptureTransfer(readFileSync(resolve(dir, name), 'utf8'))
  }));
}

function loadTemporalSubstitutionTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Tempora');
  return readDirTxt(dir).map((name) => ({
    name: name.slice(0, -4),
    entries: parseTemporalSubstitutions(readFileSync(resolve(dir, name), 'utf8'))
  }));
}

function readDirTxt(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right));
}

function runPerlSnapshot({ handle, date, perlHour, language, otherLanguage }) {
  const result = spawnSync(
    'perl',
    [PERL_SNAPSHOT, handle, isoToMdy(date), perlHour, language, otherLanguage],
    {
      encoding: 'utf8'
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Perl snapshot failed for ${handle} ${date} ${perlHour}: ${(result.stderr || result.stdout || '').trim()}`
    );
  }

  return JSON.parse(result.stdout);
}

function selectUnitsForLanguage(snapshot, language) {
  if (snapshot.language1 === language) {
    return snapshot.units1 ?? [];
  }
  if (snapshot.language2 === language) {
    return snapshot.units2 ?? [];
  }
  throw new Error(
    `Perl snapshot did not capture language ${language}; available=${snapshot.language1}, ${snapshot.language2}`
  );
}

function normalizePerlLines(units) {
  const lines = [];

  for (const unit of units) {
    let unitLines = htmlToLines(unit.html ?? '');
    if ((unit.rawFirstLine ?? '').startsWith('#') && unitLines.length > 0) {
      unitLines = unitLines.slice(1);
    }

    for (const line of unitLines) {
      const normalized = renderCanonicalText(line);
      if (normalized) {
        lines.push(normalized);
      }
    }
  }

  return lines;
}

function htmlToLines(html) {
  const withBreaks = html
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/p>/giu, '\n')
    .replace(/<p\b[^>]*>/giu, '')
    .replace(/<svg[\s\S]*?<\/svg>/giu, '');

  const stripped = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/gu, ''));
  return stripped
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeComposedLines(composed, language) {
  const lines = [];
  const nocturnHeadingCount = composed.sections.filter(
    (section) => section.type === 'heading' && section.heading?.kind === 'nocturn'
  ).length;

  for (const section of composed.sections) {
    if (section.type === 'heading') {
      // Phase 3 §3g: metadata-only heading sections (Nocturnus / Lectio)
      // are now rendered to a canonical line so they can participate in
      // the Perl-vs-compositor line-stream comparison. Without this, the
      // legacy renderer's `Nocturnus I` lines had no counterpart in the
      // composed output and every Matins first-divergent-line would
      // surface as a spurious missing-heading row.
      const rendered = renderHeading(section.heading, { nocturnHeadingCount });
      const normalized = rendered ? renderCanonicalText(rendered) : '';
      if (normalized) {
        if (section.heading?.kind === 'lesson' && lines.at(-1) !== '_') {
          lines.push('_');
        }
        lines.push(normalized);
      }
      continue;
    }

    for (const line of section.lines) {
      const rendered = renderComposedLine(line, language);
      const normalized = renderCanonicalText(rendered);
      if (normalized) {
        lines.push(normalized);
      }
    }
  }

  return lines;
}

function renderHeading(heading, context = {}) {
  if (!heading) return '';
  switch (heading.kind) {
    case 'nocturn':
      // Perl emits `Ad Nocturnum` for one-nocturn Matins offices even though
      // the structured output only needs to say "this is the sole nocturn
      // heading". The compare harness can derive that canonical label from the
      // section stream without widening the composed-hour heading schema.
      if (context.nocturnHeadingCount === 1) {
        return 'Ad Nocturnum';
      }
      return `Nocturnus ${toRomanNumeral(heading.ordinal)}`;
    case 'lesson':
      // Perl's lesson heading is `Lectio N` (Arabic numeral); the
      // compositor mirrors that literally. If 3h adjudication shows
      // Perl uses a different form for certain Nocturn 3 lessons
      // (e.g. under homily-from-evangelium), widen here.
      return `Lectio ${heading.ordinal}`;
    default:
      return '';
  }
}

function toRomanNumeral(value) {
  const numerals = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ];
  let remaining = value;
  let out = '';
  for (const [amount, symbol] of numerals) {
    while (remaining >= amount) {
      out += symbol;
      remaining -= amount;
    }
  }
  return out;
}

function renderComposedLine(line, language) {
  const runs = line.texts[language] ?? [];
  const text = runs.map(renderRun).join('').trim();
  const marker = canonicalizeLineMarker(line.marker);
  if (marker) {
    return `${marker} ${text}`.trim();
  }
  return text;
}

function canonicalizeLineMarker(marker) {
  if (marker === 'v.' || marker === 'r.') {
    return undefined;
  }
  return marker;
}

function renderRun(run) {
  switch (run.type) {
    case 'text':
    case 'rubric':
      return applyPublicSourceDisplayProfile(run.value);
    case 'citation':
      return run.value;
    case 'unresolved-macro':
      return `&${run.name}`;
    case 'unresolved-formula':
      return `$${run.name}`;
    case 'unresolved-reference':
      return `@${run.ref.path}:${run.ref.section}`;
  }
}

function renderCanonicalText(text) {
  return canonicalizeAlleluiaOrthography(applyPublicSourceDisplayProfile(text))
    .replace(/\u00a0/gu, ' ')
    .replace(/\{:[^}]*:\}\s*/gu, '')
    .replace(/\+{2,}/gu, '+')
    .replace(/℣\./gu, 'V.')
    .replace(/℟\./gu, 'R.')
    .replace(/✠/gu, '+')
    .replace(/✙[\ufe0e\ufe0f]?/gu, '+')
    .replace(/\s+/gu, ' ')
    .trim();
}

function canonicalizeAlleluiaOrthography(text) {
  return text
    .replace(/Allelúia/gu, 'Allelúja')
    .replace(/allelúia/gu, 'allelúja');
}

function decodeHtmlEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|nbsp|amp|lt|gt|quot|apos);/giu, (match, entity) => {
    const key = String(entity).toLowerCase();
    switch (key) {
      case 'nbsp':
        return ' ';
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        if (key.startsWith('#x')) {
          return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
        }
        if (key.startsWith('#')) {
          return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
        }
        return match;
    }
  });
}

function compareLineArrays(expected, actual, options = {}) {
  if (expected.length === actual.length && expected.every((line, index) => line === actual[index])) {
    return null;
  }

  let index = 0;
  while (
    index < expected.length &&
    index < actual.length &&
    expected[index] === actual[index]
  ) {
    index += 1;
  }

  const window = Math.max(0, options.window ?? 0);
  const before = Math.max(2, window);
  const after = Math.max(3, window);

  return {
    firstMismatchIndex: index,
    expectedLine: expected[index] ?? null,
    actualLine: actual[index] ?? null,
    expectedContext: expected.slice(Math.max(0, index - before), index + after),
    actualContext: actual.slice(Math.max(0, index - before), index + after),
    contextStart: Math.max(0, index - before)
  };
}

function renderDivergenceDoc({
  handle,
  title,
  year,
  comparedHours,
  dates,
  mismatches,
  mismatchCountsByHour,
  hours,
  language,
  maxRows
}) {
  const exactMatches = comparedHours - mismatches.length;
  const divergentDates = new Set(mismatches.map((entry) => entry.date));
  const heading = `${title} ${year} Compositor Divergences`;
  const hourTotals = new Map(hours.map((entry) => [entry.label, dates.length]));
  const matchingPrefixes = mismatches.map((entry) => entry.firstMismatchIndex);
  const longestMatchingPrefix =
    matchingPrefixes.length > 0 ? Math.max(...matchingPrefixes) : comparedHours > 0 ? 0 : null;
  const averageMatchingPrefix =
    matchingPrefixes.length > 0
      ? (matchingPrefixes.reduce((sum, value) => sum + value, 0) / matchingPrefixes.length).toFixed(1)
      : null;

  const classTotals = new Map();
  for (const mismatch of mismatches) {
    const klass = mismatch.adjudication?.class ?? 'unadjudicated';
    classTotals.set(klass, (classTotals.get(klass) ?? 0) + 1);
  }

  const lines = [
    `# ${heading}`,
    '',
    `This file tracks the current **legacy Perl rendered Hour vs compositor** comparison state for \`${handle}\`.`,
    '',
    '## Current status',
    '',
    '- Comparison surface:',
    `  - live Perl helper: \`packages/compositor/test/fixtures/officium-content-snapshot.pl\``,
    `  - live harness: \`pnpm -C packages/compositor compare:phase-3-perl -- --version "${handle}" --year ${year}\``,
    `  - dates: \`${dates.length}\` dates in \`${year}\`${dates.length < 300 ? ' from the existing Roman Phase 2h matrix' : ''}`,
    `  - hours: \`${hours.map((entry) => entry.label).join(', ')}\``,
    `  - language: \`${language}\``,
    `- Compared hours: \`${comparedHours}\``,
    `- Exact-match hours: \`${exactMatches}\``,
    `- Divergent hours: \`${mismatches.length}\``,
    `- Divergent dates: \`${divergentDates.size}\``,
    ...(longestMatchingPrefix === null
      ? []
      : [`- Best matching prefix before divergence: \`${longestMatchingPrefix}\` lines`]),
    ...(averageMatchingPrefix === null
      ? []
      : [`- Average matching prefix before divergence: \`${averageMatchingPrefix}\` lines`]),
    '- Divergence breakdown by hour:'
  ];

  for (const hour of hours) {
    const mismatchesForHour = mismatchCountsByHour.get(hour.label) ?? 0;
    const totalForHour = hourTotals.get(hour.label) ?? 0;
    lines.push(`  - \`${hour.label}\`: \`${mismatchesForHour}/${totalForHour}\``);
  }

  lines.push('- Adjudication breakdown (see `adjudications.json` and ADR-011):');
  const classOrder = ['unadjudicated', 'engine-bug', 'perl-bug', 'ordo-ambiguous', 'rendering-difference'];
  for (const klass of classOrder) {
    const count = classTotals.get(klass) ?? 0;
    if (count === 0 && klass !== 'unadjudicated') continue;
    lines.push(`  - \`${klass}\`: \`${count}\``);
  }
  for (const [klass, count] of classTotals) {
    if (!classOrder.includes(klass)) {
      lines.push(`  - \`${klass}\`: \`${count}\` *(unknown class; check ADR-011)*`);
    }
  }

  lines.push('', '## Sample mismatches', '');

  if (mismatches.length === 0) {
    lines.push('None. The current live harness run reports exact line-stream parity.');
  } else {
    lines.push(
      '| Date | Hour | Expected lines | Actual lines | Matching prefix | First divergence line | First expected | First actual | Class | Citation |'
    );
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const mismatch of mismatches.slice(0, maxRows)) {
      const klass = mismatch.adjudication?.class ?? 'unadjudicated';
      const citation = mismatch.adjudication?.citation ?? '';
      lines.push(
        `| ${mismatch.date} | ${mismatch.hour} | ${mismatch.expectedCount} | ${mismatch.actualCount} | ${mismatch.firstMismatchIndex} | ${mismatch.firstMismatchIndex + 1} | ${markdownCell(mismatch.expectedLine ?? mismatch.error ?? '∅')} | ${markdownCell(mismatch.actualLine ?? mismatch.error ?? '∅')} | ${markdownCell(klass)} | ${markdownCell(citation)} |`
      );
    }
    if (mismatches.length > maxRows) {
      lines.push('', `Only the first \`${maxRows}\` divergent rows are listed here. Re-run the live harness for the full detail.`);
    }
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- This ledger is auto-generated by `compare-phase-3-perl.mjs` on every run. **Do not hand-edit** the table — edits are lost.',
    '- Adjudications live in `packages/compositor/test/divergence/adjudications.json` and are merged into the `Class` / `Citation` columns by the harness. See [ADR-011](../../../../docs/adr/011-phase-3-divergence-adjudication.md) for the key schema and classification protocol.',
    '- The four row classes are `engine-bug`, `perl-bug`, `ordo-ambiguous`, and `rendering-difference`. Rows without an adjudication entry surface as `unadjudicated`.',
    '- Per CLAUDE.md §19.4 and ADR-011: no divergence is ever resolved by "matching the Perl" alone. Every adjudication carries a citation.',
    ''
  );

  return lines.join('\n');
}

function markdownCell(value) {
  return String(value)
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, '<br/>');
}

function isoToMdy(date) {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) {
    throw new Error(`Invalid ISO date ${date}`);
  }
  return `${month}-${day}-${year}`;
}

function loadAdjudications() {
  if (!existsSync(ADJUDICATIONS_FILE)) {
    return {};
  }
  const raw = readFileSync(ADJUDICATIONS_FILE, 'utf8');
  if (raw.trim().length === 0) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse ${ADJUDICATIONS_FILE}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected ${ADJUDICATIONS_FILE} to be a JSON object keyed by row key.`);
  }
  return parsed;
}

// Stable pattern key used by the adjudications sidecar (ADR-011).
// Composed of the policy handle, ISO date, Hour label, and an 8-hex-char hash
// of the normalized first-expected/first-actual pair. The hash makes the key
// resilient to column reordering but sensitive to text changes — which is
// desired: a meaningfully different row gets a fresh key and surfaces as
// `unadjudicated` until re-reviewed.
function computeRowKey({ policy, date, hour, firstExpected, firstActual }) {
  const normExpected = normalizeKeyInput(firstExpected);
  const normActual = normalizeKeyInput(firstActual);
  const digest = createHash('sha256')
    .update(`${normExpected}\u0000${normActual}`)
    .digest('hex')
    .slice(0, 8);
  return `${policy}/${date}/${hour}/${digest}`;
}

function normalizeKeyInput(value) {
  if (value === null || value === undefined) {
    return '__null__';
  }
  return String(value).replace(/\s+/gu, ' ').trim();
}
