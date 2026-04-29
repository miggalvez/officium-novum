import type { ReportPayload } from './report-payload';

export function formatReportAsJson(payload: ReportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function formatReportAsYaml(payload: ReportPayload): string {
  return toYaml(payload as unknown as JsonValue, 0);
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

function toYaml(value: JsonValue | undefined, indent: number): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return formatScalarString(value, indent);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return value
      .map((item) => {
        const rendered = toYaml(item, indent + 2);
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return `\n${pad(indent)}-${rendered.startsWith('\n') ? '' : ' '}${rendered.trimStart()}`;
        }
        return `\n${pad(indent)}- ${rendered}`;
      })
      .join('');
  }
  const entries = Object.entries(value).filter(
    ([, child]) => child !== undefined
  ) as Array<[string, JsonValue]>;
  if (entries.length === 0) {
    return '{}';
  }
  return entries
    .map(([key, child]) => {
      if (typeof child === 'object' && child !== null) {
        return `\n${pad(indent)}${key}:${toYaml(child, indent + 2)}`;
      }
      return `\n${pad(indent)}${key}: ${toYaml(child, indent)}`;
    })
    .join('');
}

function pad(indent: number): string {
  return ' '.repeat(indent);
}

const SAFE_SCALAR = /^[A-Za-z0-9_./:@\\-]+$/;

function formatScalarString(value: string, indent: number): string {
  if (value === '') {
    return '""';
  }
  if (value.includes('\n')) {
    const lines = value.split('\n');
    return `|\n${lines.map((line) => `${pad(indent + 2)}${line}`).join('\n')}`;
  }
  if (SAFE_SCALAR.test(value) && !looksLikeReservedWord(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function looksLikeReservedWord(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower === 'true' ||
    lower === 'false' ||
    lower === 'null' ||
    lower === 'yes' ||
    lower === 'no'
  );
}
