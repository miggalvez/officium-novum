import { type TextContent, type TextIndex } from '@officium-novum/parser';
import type {
  DayOfficeSummary,
  SlotName,
  TextReference
} from '@officium-novum/rubrical-engine';

import { resolveAuxiliarySection } from '../resolve/path.js';

interface OfficeNameSubstitutionContext {
  readonly corpus: TextIndex;
  readonly ref: TextReference;
  readonly summary: DayOfficeSummary;
  readonly slot: SlotName;
  readonly language: string;
  readonly langfb?: string;
  readonly isAntiphon: boolean;
}

interface OfficeNameBinding {
  readonly defaultName: string;
  readonly antiphonName?: string;
  readonly orationName?: string;
}

export function applyOfficeNameSubstitution(
  content: readonly TextContent[],
  context: OfficeNameSubstitutionContext
): readonly TextContent[] {
  const binding = resolveOfficeNameBinding(context);
  if (!binding) {
    return content;
  }

  return content.map((node) => substituteOfficeNameNode(node, binding, context));
}

function substituteOfficeNameNode(
  node: TextContent,
  binding: OfficeNameBinding,
  context: OfficeNameSubstitutionContext
): TextContent {
  if (node.type === 'conditional') {
    return {
      ...node,
      content: node.content.map((child) => substituteOfficeNameNode(child, binding, context))
    };
  }

  if (node.type === 'text') {
    return {
      ...node,
      value: substituteOfficeNameText(node.value, binding, context)
    };
  }

  if (node.type === 'rubric') {
    return {
      ...node,
      value: substituteOfficeNameText(node.value, binding, context)
    };
  }

  if (node.type === 'verseMarker') {
    return {
      ...node,
      text: substituteOfficeNameText(node.text, binding, context)
    };
  }

  return node;
}

function substituteOfficeNameText(
  value: string,
  binding: OfficeNameBinding,
  context: Pick<OfficeNameSubstitutionContext, 'slot' | 'isAntiphon'>
): string {
  if (!value.includes('N.')) {
    return value;
  }

  const replacement = officeNameForText(value, binding, context);
  return value
    .replace(/N\.\s+(?:et|&|and)\s+N\./gu, replacement)
    .replace(/N\./gu, replacement);
}

function officeNameForText(
  value: string,
  binding: OfficeNameBinding,
  context: Pick<OfficeNameSubstitutionContext, 'slot' | 'isAntiphon'>
): string {
  if (
    context.isAntiphon ||
    context.slot.startsWith('antiphon-') ||
    context.slot === 'commemoration-antiphons' ||
    /^[OÓ],?\s/u.test(value) ||
    /^O Doctor optime\b/iu.test(value)
  ) {
    return binding.antiphonName ?? binding.defaultName;
  }

  return binding.orationName ?? binding.defaultName;
}

function resolveOfficeNameBinding(
  context: OfficeNameSubstitutionContext
): OfficeNameBinding | undefined {
  const sourcePath = officeNameSourcePath(context);
  if (!sourcePath) {
    return undefined;
  }

  const section = resolveAuxiliarySection(
    context.corpus,
    context.language,
    context.langfb,
    sourcePath,
    'Name'
  );
  if (!section) {
    return undefined;
  }

  const lines = section.content.flatMap((node) =>
    node.type === 'text' ? node.value.split(/\r?\n/u).map((line) => line.trim()) : []
  );
  const defaultName = lines.find(
    (line) => line.length > 0 && !line.startsWith(';') && !line.includes('=')
  );
  const antiphonName = prefixedName(lines, 'Ant');
  const orationName = prefixedName(lines, 'Oratio');
  const fallback = orationName ?? defaultName ?? antiphonName;
  if (!fallback) {
    return undefined;
  }

  return {
    defaultName: fallback,
    ...(antiphonName ? { antiphonName } : {}),
    ...(orationName ? { orationName } : {})
  };
}

function prefixedName(lines: readonly string[], key: string): string | undefined {
  const prefix = `${key}=`;
  const line = lines.find((candidate) => candidate.replace(/\s+/gu, '').startsWith(prefix));
  return line?.replace(/^[^=]+=/u, '').trim();
}

function officeNameSourcePath(context: OfficeNameSubstitutionContext): string | undefined {
  if (!isOfficeNameEligibleReference(context.ref)) {
    return undefined;
  }

  if (context.ref.nameSourcePath) {
    return context.ref.nameSourcePath;
  }

  if (context.ref.path.includes('/Sancti/') || context.ref.path.includes('/Tempora/')) {
    return context.ref.path;
  }

  if (context.ref.path.includes('/Commune/')) {
    return `horas/Latin/${context.summary.celebration.feastRef.path}`;
  }

  return undefined;
}

function isOfficeNameEligibleReference(ref: TextReference): boolean {
  return (
    ref.path.startsWith('horas/Latin/Sancti/') ||
    ref.path.startsWith('horas/Latin/Tempora/') ||
    ref.path.startsWith('horas/Latin/Commune/')
  );
}
