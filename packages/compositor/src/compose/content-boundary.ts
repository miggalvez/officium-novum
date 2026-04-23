import type { TextContent } from '@officium-novum/parser';

export function appendContentWithBoundary(
  target: TextContent[],
  next: readonly TextContent[]
): void {
  if (next.length === 0) {
    return;
  }

  const last = target.at(-1);
  const first = next[0];
  if (last && first && isInlineBoundaryNode(last) && isInlineBoundaryNode(first)) {
    target.push({ type: 'separator' });
  }

  target.push(...next);
}

function isInlineBoundaryNode(node: TextContent): boolean {
  switch (node.type) {
    case 'text':
    case 'citation':
    case 'psalmRef':
    case 'macroRef':
    case 'formulaRef':
    case 'psalmInclude':
    case 'reference':
      return true;
    case 'verseMarker':
    case 'rubric':
    case 'separator':
    case 'heading':
    case 'conditional':
    case 'gabcNotation':
      return false;
  }
}
