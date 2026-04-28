import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReviewerReport } from './schemas/reviewer-report.schema.js';

const REPORT_DIRS = [
  'packages/validation/test/reviewer-reports/accepted',
  'packages/validation/test/reviewer-reports/rejected',
  'packages/validation/test/reviewer-reports/fixtures'
] as const;

interface ReviewerReportAuditSummary {
  readonly checkedReports: number;
  readonly errors: readonly string[];
}

export async function auditReviewerReports(): Promise<ReviewerReportAuditSummary> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const errors: string[] = [];
  let checkedReports = 0;

  for (const dir of REPORT_DIRS) {
    const files = await listJsonFiles(resolve(repoRoot, dir));
    for (const file of files) {
      checkedReports += 1;
      const raw = await readFile(file, 'utf8');
      errors.push(...validateReviewerReportJson(raw, file));
    }
  }

  return {
    checkedReports,
    errors
  };
}

export function validateReviewerReportJson(raw: string, file: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return [`${file}: invalid JSON: ${message}`];
  }

  const result = validateReviewerReport(parsed);
  return result.errors.map((error) => `${file}: ${error}`);
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(path));
    } else if (extname(entry.name) === '.json') {
      files.push(path);
    }
  }
  return files;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await auditReviewerReports();
  if (summary.errors.length > 0) {
    console.error(summary.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`reviewer report audit passed: ${summary.checkedReports} public report fixtures checked`);
  }
}
