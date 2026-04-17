import type { TransferEntry } from '@officium-novum/parser';

import { canonicalContentDir } from '../internal/content.js';
import type { FeastReference } from '../types/model.js';
import type { RubricalWarning } from '../types/directorium.js';
import type { ResolvedVersion } from '../types/version.js';

const TEMPORA_PREFIX = /^Tempora(?:M|Cist|OP)?\//iu;
const SANCTI_PREFIX = /^Sancti(?:M|Cist|OP)?\//iu;

export function extractOfficeSubstitution(
  entries: readonly TransferEntry[],
  dateKey: string,
  version: ResolvedVersion
): {
  readonly officeSubstitution?: FeastReference;
  readonly warnings: readonly RubricalWarning[];
} {
  const warnings: RubricalWarning[] = [];
  const transfer = entries.find(
    (entry): entry is Extract<TransferEntry, { kind: 'transfer' }> =>
      entry.kind === 'transfer' && entry.dateKey === dateKey
  );
  if (!transfer) {
    return { warnings };
  }

  const canonicalPath = canonicalizeTarget(transfer.target, version);
  if (!canonicalPath) {
    warnings.push({
      code: 'overlay-unsupported-substitution-target',
      message: `Ignoring unsupported overlay substitution target '${transfer.target}'.`,
      severity: 'warn',
      context: {
        dateKey,
        target: transfer.target
      }
    });
    return { warnings };
  }

  if (transfer.alternates && transfer.alternates.length > 0) {
    warnings.push({
      code: 'overlay-alternates-deferred',
      message: 'Transfer alternates are deferred to Phase 2e transfer computation.',
      severity: 'info',
      context: {
        dateKey,
        primary: transfer.target,
        alternates: transfer.alternates.join('~')
      }
    });
  }

  return {
    officeSubstitution: feastReferenceForPath(canonicalPath),
    warnings
  };
}

function canonicalizeTarget(
  target: string,
  version: ResolvedVersion
): string | undefined {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) {
    return undefined;
  }

  const temporaDir = canonicalContentDir('Tempora', version);
  const sanctiDir = canonicalContentDir('Sancti', version);

  if (TEMPORA_PREFIX.test(normalizedTarget)) {
    const remainder = normalizedTarget.replace(TEMPORA_PREFIX, '');
    return remainder ? `${temporaDir}/${remainder}` : undefined;
  }

  if (SANCTI_PREFIX.test(normalizedTarget)) {
    const remainder = normalizedTarget.replace(SANCTI_PREFIX, '');
    return remainder ? `${sanctiDir}/${remainder}` : undefined;
  }

  if (normalizedTarget.includes('/')) {
    return undefined;
  }

  return `${sanctiDir}/${normalizedTarget}`;
}

function feastReferenceForPath(path: string): FeastReference {
  return {
    path,
    id: path,
    title: path.split('/').at(-1) ?? path
  };
}
