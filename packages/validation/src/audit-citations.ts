import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADJUDICATION_CLASSIFICATIONS,
  type AdjudicationClassification
} from './schemas/adjudication.schema.js';
import { validateCitation } from './schemas/citation.schema.js';
import { isRecord } from './schemas/common.js';

const REQUIRED_CITATION_CLASSES: readonly AdjudicationClassification[] = [
  'parser-bug',
  'engine-bug',
  'compositor-bug',
  'api-bug',
  'corpus-bug',
  'perl-bug',
  'ordo-ambiguous',
  'source-ambiguous'
];

interface AuditSummary {
  readonly checked: number;
  readonly sidecarEntries: number;
  readonly ledgerRows: number;
  readonly legacyCitationStrings: number;
  readonly legacyMigrationExceptions: number;
  readonly structuredCitations: number;
  readonly errors: readonly string[];
}

export async function auditCitations(): Promise<AuditSummary> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const sidecar = await auditCompositorSidecar(repoRoot);
  const ledgers = await auditMarkdownLedgers(repoRoot);
  const errors = [...sidecar.errors, ...ledgers.errors];

  return {
    checked: sidecar.checked + ledgers.checked,
    sidecarEntries: sidecar.checked,
    ledgerRows: ledgers.checked,
    legacyCitationStrings: sidecar.legacyCitationStrings,
    legacyMigrationExceptions: sidecar.legacyMigrationExceptions,
    structuredCitations: sidecar.structuredCitations,
    errors
  };
}

interface SidecarAudit {
  readonly checked: number;
  readonly legacyCitationStrings: number;
  readonly legacyMigrationExceptions: number;
  readonly structuredCitations: number;
  readonly errors: readonly string[];
}

async function auditCompositorSidecar(repoRoot: string): Promise<SidecarAudit> {
  const sidecarPath = resolve(
    repoRoot,
    'packages/compositor/test/divergence/adjudications.json'
  );
  const raw = await readFile(sidecarPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    return {
      checked: 0,
      legacyCitationStrings: 0,
      legacyMigrationExceptions: 0,
      structuredCitations: 0,
      errors: ['compositor adjudications sidecar must be an object']
    };
  }

  const errors: string[] = [];
  let checked = 0;
  let legacyCitationStrings = 0;
  let legacyMigrationExceptions = 0;
  let structuredCitations = 0;

  for (const [key, value] of Object.entries(parsed)) {
    checked += 1;
    if (!isRecord(value)) {
      errors.push(`${key}: entry must be an object`);
      continue;
    }

    const classification = value.class;
    if (
      typeof classification !== 'string' ||
      !ADJUDICATION_CLASSIFICATIONS.includes(
        classification as AdjudicationClassification
      )
    ) {
      errors.push(`${key}: class must be a Phase 5 classification`);
      continue;
    }

    const requireCitation = REQUIRED_CITATION_CLASSES.includes(
      classification as AdjudicationClassification
    );

    if (typeof value.citation === 'string') {
      legacyCitationStrings += 1;
      if (
        requireCitation &&
        value.citation.trim() !== '' &&
        !hasRecognizedLocator(value.citation)
      ) {
        legacyMigrationExceptions += 1;
      }
      errors.push(
        ...validateLegacyCitationText(value.citation, {
          requireCitation,
          context: key,
          allowMigrationException: true
        })
      );
      continue;
    }

    structuredCitations += 1;
    const citation = validateCitation(value.citation, {
      requireSource: requireCitation
    });
    if (!citation.ok) {
      for (const error of citation.errors) {
        errors.push(`${key}: ${error}`);
      }
    }
  }

  return {
    checked,
    legacyCitationStrings,
    legacyMigrationExceptions,
    structuredCitations,
    errors
  };
}

interface LedgerAudit {
  readonly checked: number;
  readonly errors: readonly string[];
}

async function auditMarkdownLedgers(repoRoot: string): Promise<LedgerAudit> {
  const ledgerPaths = [
    'packages/compositor/test/divergence/divino-afflatu-2024.md',
    'packages/compositor/test/divergence/reduced-1955-2024.md',
    'packages/compositor/test/divergence/rubrics-1960-2024.md',
    'packages/rubrical-engine/test/divergence/divino-afflatu-2024.md',
    'packages/rubrical-engine/test/divergence/reduced-1955-2024.md',
    'packages/rubrical-engine/test/divergence/rubrics-1960-2024.md'
  ];
  const errors: string[] = [];
  let checked = 0;

  for (const relativePath of ledgerPaths) {
    const content = await readFile(resolve(repoRoot, relativePath), 'utf8');
    for (const row of extractMarkdownTableRows(content)) {
      checked += 1;
      const assessment = row.at(-1)?.trim() ?? '';
      errors.push(
        ...validateLegacyCitationText(assessment, {
          requireCitation: true,
          context: `${relativePath}: ${row[0] ?? 'unknown row'}`
        })
      );
    }
  }

  return {
    checked,
    errors
  };
}

function extractMarkdownTableRows(content: string): string[][] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('| 20') && line.endsWith('|'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim())
    );
}

export function validateLegacyCitationText(
  citation: string,
  options: {
    readonly requireCitation: boolean;
    readonly context: string;
    readonly allowMigrationException?: boolean;
  }
): readonly string[] {
  const trimmed = citation.trim();
  if (!trimmed) {
    return options.requireCitation
      ? [`${options.context}: required legacy citation string is empty`]
      : [];
  }

  if (!options.requireCitation) {
    return [];
  }

  if (mentionsCorpus(trimmed) && !hasCorpusLineLocator(trimmed)) {
    return [`${options.context}: corpus citation requires path and line locator`];
  }

  if (!hasRecognizedLocator(trimmed)) {
    if (options.allowMigrationException) {
      return [];
    }
    return [`${options.context}: citation lacks a recognized source locator`];
  }

  return [];
}

function hasRecognizedLocator(citation: string): boolean {
  return (
    hasCorpusLineLocator(citation) ||
    /\b(?:docs|packages)\/[^\s`|)]+/u.test(citation) ||
    /\bADR-0\d+\b/u.test(citation) ||
    /\b(?:General Rubrics|Codex Rubricarum|Breviary 1960|Rubricae Generales|Cum Nostra|Rubricarum Instructum)\s*§\s*\d+/iu.test(citation) ||
    /\b(?:ordo|Ordo)\b.+\b(?:p\.|page)\s*\d+/u.test(citation)
  );
}

function mentionsCorpus(citation: string): boolean {
  return /\bupstream\/web\/www\//u.test(citation);
}

function hasCorpusLineLocator(citation: string): boolean {
  return /\bupstream\/web\/www\/[^:`|)]+:\d+(?:-\d+)?\b/u.test(citation);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await auditCitations();
  if (summary.errors.length > 0) {
    console.error(summary.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      `citation audit passed: ${summary.checked} artifacts checked (${summary.sidecarEntries} sidecar entries, ${summary.ledgerRows} ledger rows; ${summary.legacyCitationStrings} legacy citation strings pending structured migration, ${summary.legacyMigrationExceptions} explicit migration exceptions)`
    );
  }
}
