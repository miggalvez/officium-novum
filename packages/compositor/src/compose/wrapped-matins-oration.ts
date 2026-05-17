import type { TextContent } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  HourName,
  SlotName,
  TextReference
} from '@officium-novum/rubrical-engine';

interface WrappedMatinsOrationArgs {
  readonly slot: SlotName;
  readonly hour: HourName;
  readonly context: ConditionEvalContext;
}

const DOMINUS_VOBISCUM_MACRO = 'Dominus_vobiscum';
const OREMUS_FORMULA_RX = /^oremus$/iu;
const OREMUS_TEXT_RX = /^or[ée]mus\.?$/iu;

export function stripWrappedMatinsOrationOpening(
  args: WrappedMatinsOrationArgs,
  ref: TextReference,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (!isRubrics1960MatinsOratioMatutinum(args, ref)) {
    return content;
  }

  const firstContentIndex = content.findIndex((node) => node.type !== 'separator');
  const first = firstContentIndex >= 0 ? content[firstContentIndex] : undefined;
  if (first?.type !== 'macroRef' || first.name !== DOMINUS_VOBISCUM_MACRO) {
    return content;
  }

  return content.filter((_, index) => index !== firstContentIndex);
}

export function stripWrappedMatinsOrationDuplicateOremus(
  args: WrappedMatinsOrationArgs,
  ref: TextReference,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (!isRubrics1960MatinsOratioMatutinum(args, ref)) {
    return content;
  }

  const firstContentIndex = content.findIndex((node) => node.type !== 'separator');
  const first = firstContentIndex >= 0 ? content[firstContentIndex] : undefined;
  if (!first || !isOremusNode(first)) {
    return content;
  }

  return content.filter((_, index) => index !== firstContentIndex);
}

function isRubrics1960MatinsOratioMatutinum(
  args: WrappedMatinsOrationArgs,
  ref: TextReference
): boolean {
  return (
    args.slot === 'oration' &&
    args.hour === 'matins' &&
    args.context.version.handle.includes('1960') &&
    ref.section === 'Oratio Matutinum'
  );
}

function isOremusNode(node: TextContent): boolean {
  if (node.type === 'formulaRef') {
    return OREMUS_FORMULA_RX.test(node.name.trim());
  }
  if (node.type === 'text') {
    return OREMUS_TEXT_RX.test(node.value.trim());
  }
  if (node.type === 'verseMarker') {
    return OREMUS_TEXT_RX.test(node.text.trim());
  }
  return false;
}
