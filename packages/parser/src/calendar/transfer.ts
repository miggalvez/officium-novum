import type { ScriptureTransferEntry, TransferEntry } from '../types/calendar.js';

const HYMN_DIRECTIVE_REGEX = /^Hy(.+)$/u;
const DIRGE_DIRECTIVE_REGEX = /^dirge([123])$/iu;
const SCRIPTURE_OPERATION_SET = new Set(['R', 'B', 'A']);

export function parseTransfer(content: string): TransferEntry[] {
  const entries: TransferEntry[] = [];

  for (const parsedLine of parseTransferLines(content)) {
    const directive = parsedLine.directive;

    const dirgeMatch = directive.dateKey.match(DIRGE_DIRECTIVE_REGEX);
    if (dirgeMatch) {
      const dirgeNumber = Number(dirgeMatch[1]) as 1 | 2 | 3;
      entries.push({
        kind: 'dirge',
        dirgeNumber,
        dates: directive.value.split(/\s+/u).filter(Boolean),
        versionFilter: parsedLine.versionFilter
      });
      continue;
    }

    const hymnMatch = directive.dateKey.match(HYMN_DIRECTIVE_REGEX);
    if (hymnMatch) {
      const dateKey = hymnMatch[1]?.trim();
      if (!dateKey) {
        continue;
      }

      entries.push({
        kind: 'hymn',
        dateKey,
        value: directive.value,
        versionFilter: parsedLine.versionFilter
      });
      continue;
    }

    const targets = directive.value.split('~').map((value) => value.trim()).filter(Boolean);
    const target = targets[0];
    if (!target) {
      continue;
    }

    entries.push({
      kind: 'transfer',
      dateKey: directive.dateKey,
      target,
      alternates: targets.length > 1 ? targets.slice(1) : undefined,
      versionFilter: parsedLine.versionFilter
    });
  }

  return entries;
}

export function parseScriptureTransfer(content: string): ScriptureTransferEntry[] {
  const entries: ScriptureTransferEntry[] = [];

  for (const parsedLine of parseTransferLines(content)) {
    const operationSplit = parsedLine.directive.value.split('~').map((value) => value.trim());
    const target = operationSplit[0];
    const operationCandidate = operationSplit[1];

    if (!target) {
      continue;
    }

    const operation =
      operationCandidate && SCRIPTURE_OPERATION_SET.has(operationCandidate)
        ? (operationCandidate as ScriptureTransferEntry['operation'])
        : undefined;

    entries.push({
      dateKey: parsedLine.directive.dateKey,
      target: operation ? target : parsedLine.directive.value,
      operation,
      versionFilter: parsedLine.versionFilter
    });
  }

  return entries;
}

function parseTransferLines(content: string): Array<{
  directive: { dateKey: string; value: string };
  versionFilter?: string;
}> {
  const parsedLines: Array<{
    directive: { dateKey: string; value: string };
    versionFilter?: string;
  }> = [];

  for (const rawLine of content.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const versionSeparatorIndex = line.indexOf(';;');
    const directivePart =
      versionSeparatorIndex >= 0 ? line.slice(0, versionSeparatorIndex).trim() : line;
    const versionFilter =
      versionSeparatorIndex >= 0 ? line.slice(versionSeparatorIndex + 2).trim() || undefined : undefined;

    const equalsIndex = directivePart.indexOf('=');
    if (equalsIndex < 0) {
      continue;
    }

    const dateKey = directivePart.slice(0, equalsIndex).trim();
    const value = directivePart.slice(equalsIndex + 1).trim();
    if (!dateKey || !value) {
      continue;
    }

    parsedLines.push({
      directive: {
        dateKey,
        value
      },
      versionFilter
    });
  }

  return parsedLines;
}
