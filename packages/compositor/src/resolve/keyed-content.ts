import type { TextContent } from '@officium-novum/parser';

export const WEEKDAY_KEYS = [
  'Dominica',
  'Feria II',
  'Feria III',
  'Feria IV',
  'Feria V',
  'Feria VI',
  'Sabbato'
] as const;

export function selectKeyedTextContent(
  content: readonly TextContent[],
  wantedKey: string
): readonly TextContent[] | undefined {
  for (const node of content) {
    if (node.type === 'conditional') {
      const nested = selectKeyedTextContent(node.content, wantedKey);
      if (nested) {
        return wrapSelectedContent(node, nested);
      }
      continue;
    }
    if (node.type !== 'text') {
      continue;
    }
    const keyed = parseKeyedText(node.value);
    if (keyed && normalizeKey(keyed.key) === normalizeKey(wantedKey)) {
      return keyed.value.length > 0
        ? Object.freeze([{ type: 'text', value: keyed.value }])
        : Object.freeze([]);
    }
  }
  return undefined;
}

export function parseKeyedText(value: string): { readonly key: string; readonly value: string } | undefined {
  const match = value.match(/^([^=]+?)\s*=\s*(.*)$/u);
  if (!match) {
    return undefined;
  }

  const key = match[1]?.trim();
  const text = match[2]?.trim() ?? '';
  if (!key) {
    return undefined;
  }

  return { key, value: text };
}

export function nextTextValue(content: readonly TextContent[], startIndex: number): string | undefined {
  for (let index = startIndex; index < content.length; index += 1) {
    const node = content[index];
    if (node?.type === 'text') {
      return node.value.trim();
    }
    if (node?.type === 'conditional') {
      const nested = nextTextValue(node.content, 0);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

export function wrapSelectedContent(
  node: Extract<TextContent, { type: 'conditional' }>,
  content: readonly TextContent[]
): readonly TextContent[] {
  return Object.freeze([
    {
      type: 'conditional',
      condition: node.condition,
      content: [...content],
      scope: node.scope
    }
  ]);
}

export function normalizeKey(key: string): string {
  return key.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function isWeekdayKey(selector: string): boolean {
  return WEEKDAY_KEYS.some((key) => normalizeKey(key) === normalizeKey(selector));
}

export function isKeyedPsalterSection(sectionName: string): boolean {
  return (
    sectionName === 'Prima' ||
    sectionName === 'Tertia' ||
    sectionName === 'Sexta' ||
    sectionName === 'Nona' ||
    sectionName === 'Completorium'
  );
}

export function clampDayOfWeek(dayOfWeek: number): number {
  if (!Number.isFinite(dayOfWeek)) {
    return 0;
  }
  if (dayOfWeek < 0) {
    return 0;
  }
  if (dayOfWeek > 6) {
    return 6;
  }
  return Math.trunc(dayOfWeek);
}
