import type { TextContent } from '../types/schema.js';

export interface SyntheticHeadingSection {
  readonly header: string;
  readonly content: readonly TextContent[];
}

interface SyntheticHeadingSegment extends SyntheticHeadingSection {
  readonly type: 'section';
}

type HeadingSegment =
  | { readonly type: 'content'; readonly content: readonly TextContent[] }
  | SyntheticHeadingSegment;

/**
 * Split a legacy `#Heading` stream into synthetic heading-backed sections,
 * preserving any conditional wrappers that surround the heading body.
 *
 * Ordinarium files frequently encode headings inside conditionals, e.g.
 * `(rubrica 1960) #De Officio Capituli` followed by the shared body lines in
 * the same conditional block. A flat scan of top-level `heading` nodes misses
 * those boundaries entirely; this helper walks nested conditionals and turns
 * inner headings into top-level synthetic sections while keeping the original
 * condition tree around the headed body content.
 */
export function extractSyntheticHeadingSections(
  content: readonly TextContent[]
): readonly SyntheticHeadingSection[] {
  return splitHeadingSegments(content)
    .filter((segment): segment is SyntheticHeadingSegment => segment.type === 'section')
    .map((segment) =>
      Object.freeze({
        header: segment.header,
        content: Object.freeze([...segment.content])
      })
    );
}

function splitHeadingSegments(content: readonly TextContent[]): readonly HeadingSegment[] {
  const leading: TextContent[] = [];
  const sections: SyntheticHeadingSegment[] = [];
  let currentHeader: string | undefined;
  let currentContent: TextContent[] = [];

  const flushCurrent = (): void => {
    if (!currentHeader) {
      return;
    }

    sections.push({
      type: 'section',
      header: currentHeader,
      content: currentContent
    });
    currentHeader = undefined;
    currentContent = [];
  };

  const appendToCurrent = (node: TextContent): void => {
    if (currentHeader) {
      currentContent.push(node);
      return;
    }
    leading.push(node);
  };

  const startSection = (header: string): void => {
    flushCurrent();
    currentHeader = header.trim();
    currentContent = [];
  };

  for (const node of content) {
    if (node.type === 'heading') {
      startSection(node.value);
      continue;
    }

    if (node.type === 'conditional') {
      const nestedSegments = splitHeadingSegments(node.content);
      const nestedHasHeading = nestedSegments.some((segment) => segment.type === 'section');
      if (!nestedHasHeading) {
        appendToCurrent(node);
        continue;
      }

      for (const segment of nestedSegments) {
        if (segment.type === 'content') {
          if (segment.content.length === 0) {
            continue;
          }
          const wrapped = wrapConditional(node, segment.content);
          appendToCurrent(wrapped);
          continue;
        }

        startSection(segment.header);
        if (segment.content.length === 0) {
          continue;
        }
        const wrapped = wrapConditional(node, segment.content);
        appendToCurrent(wrapped);
      }
      continue;
    }

    appendToCurrent(node);
  }

  flushCurrent();

  const out: HeadingSegment[] = [];
  if (leading.length > 0) {
    out.push({
      type: 'content',
      content: Object.freeze([...leading])
    });
  }
  for (const section of sections) {
    out.push({
      type: 'section',
      header: section.header,
      content: Object.freeze([...section.content])
    });
  }
  return Object.freeze(out);
}

function wrapConditional(
  node: Extract<TextContent, { type: 'conditional' }>,
  content: readonly TextContent[]
): Extract<TextContent, { type: 'conditional' }> {
  return {
    type: 'conditional',
    condition: node.condition,
    content: [...content],
    scope: node.scope
  };
}
