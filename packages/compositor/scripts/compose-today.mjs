// Small one-shot script: compose a single Hour for a single date/policy and
// print it to stdout. Intended for manual inspection while developing.
//
// Usage:
//   node scripts/compose-today.mjs [--date YYYY-MM-DD] [--hour lauds]
//                                  [--version "Rubrics 1960 - 1960"]
//                                  [--language Latin]
//
// Defaults: today's date, lauds, Rubrics 1960 - 1960, Latin.
//
// Requires all three packages to be built first:
//   pnpm -C packages/parser build
//   pnpm -C packages/rubrical-engine build
//   pnpm -C packages/compositor build

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(THIS_DIR, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const UPSTREAM_ROOT = resolve(REPO_ROOT, 'upstream/web/www');

const PARSER_DIST = resolve(REPO_ROOT, 'packages/parser/dist/index.js');
const RUBRICAL_ENGINE_DIST = resolve(REPO_ROOT, 'packages/rubrical-engine/dist/index.js');
const COMPOSITOR_DIST = resolve(REPO_ROOT, 'packages/compositor/dist/index.js');

if (!existsSync(UPSTREAM_ROOT)) {
  console.error(
    `Upstream corpus not found at ${UPSTREAM_ROOT}. Initialize the submodule first:\n` +
      `  git submodule update --init --depth 1 upstream`
  );
  process.exit(1);
}
for (const dist of [PARSER_DIST, RUBRICAL_ENGINE_DIST, COMPOSITOR_DIST]) {
  if (!existsSync(dist)) {
    console.error(`Built package missing: ${dist}\nRun: pnpm -r build`);
    process.exit(1);
  }
}

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? todayISO();
const hour = args.hour ?? 'lauds';
const versionHandle = args.version ?? 'Rubrics 1960 - 1960';
const language = args.language ?? 'Latin';

const { loadCorpus, parseKalendarium, parseScriptureTransfer, parseTransfer, parseVersionRegistry } =
  await import(pathToFileURL(PARSER_DIST).href);
const {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine
} = await import(pathToFileURL(RUBRICAL_ENGINE_DIST).href);
const { composeHour } = await import(pathToFileURL(COMPOSITOR_DIST).href);

console.error(`Loading corpus from ${UPSTREAM_ROOT}...`);
const rawCorpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
const resolvedCorpus = await loadCorpus(UPSTREAM_ROOT);

const versionRegistry = buildVersionRegistry(
  parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
);
const kalendarium = buildKalendariumTable(loadTxtDir('Tabulae/Kalendaria', parseKalendarium, 'entries'));
const yearTransfers = buildYearTransferTable(
  loadTxtDir('Tabulae/Transfer', parseTransfer, 'yearKey')
);
const scriptureTransfers = buildScriptureTransferTable(
  loadTxtDir('Tabulae/Stransfer', parseScriptureTransfer, 'yearKey')
);

const engine = createRubricalEngine({
  corpus: rawCorpus.index,
  kalendarium,
  yearTransfers,
  scriptureTransfers,
  versionRegistry,
  version: asVersionHandle(versionHandle),
  policyMap: VERSION_POLICY
});

const summary = engine.resolveDayOfficeSummary(date);
const hourStructure = summary.hours[hour];
if (!hourStructure) {
  console.error(`No ${hour} structure available for ${date} under ${versionHandle}.`);
  process.exit(1);
}

const composed = composeHour({
  corpus: resolvedCorpus.index,
  summary,
  version: engine.version,
  hour,
  options: { languages: [language] }
});

console.log(`# ${composed.hour.toUpperCase()} — ${composed.date}`);
console.log(`# Version: ${versionHandle}`);
console.log(`# Celebration: ${composed.celebration}`);
console.log();

for (const section of composed.sections) {
  if (section.type === 'heading') {
    console.log(`## [heading] ${formatHeading(section.heading)}`);
    console.log();
    continue;
  }
  console.log(`## ${section.slot}`);
  for (const line of section.lines) {
    const marker = line.marker ? `${line.marker} ` : '';
    const text = renderText(line, language);
    if (!text && !line.marker) continue;
    console.log(`${marker}${text}`);
  }
  console.log();
}

if (composed.warnings.length > 0) {
  console.error(`\n# Warnings (${composed.warnings.length})`);
  for (const w of composed.warnings) {
    console.error(`- [${w.kind}] ${JSON.stringify(w)}`);
  }
}

function renderText(line, language) {
  const runs = line.texts?.[language] ?? [];
  return runs.map((run) => ('value' in run && run.value ? run.value : '')).join('');
}

function formatHeading(heading) {
  if (!heading) return '';
  if (typeof heading === 'string') return heading;
  if (heading.text) return heading.text;
  return JSON.stringify(heading);
}

function loadTxtDir(relDir, parse, field) {
  const dir = resolve(UPSTREAM_ROOT, relDir);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      [field === 'entries' ? 'name' : 'yearKey']: name.slice(0, -4),
      entries: parse(readFileSync(resolve(dir, name), 'utf8'))
    }));
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      out[key] = value;
      i += 1;
    }
  }
  return out;
}
