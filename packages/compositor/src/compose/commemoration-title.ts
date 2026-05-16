import type { TextContent, TextIndex } from '@officium-novum/parser';
import type { TextReference } from '@officium-novum/rubrical-engine';

export function prependCommemorationAntiphonHeading(
  corpus: TextIndex,
  ref: TextReference,
  content: readonly TextContent[]
): readonly TextContent[] {
  const title = commemorationTitle(corpus, ref.nameSourcePath ?? ref.path);
  return title
    ? [{ type: 'text', value: `Commemoratio ${title}` }, { type: 'separator' }, ...content]
    : content;
}

function commemorationTitle(corpus: TextIndex, path: string): string | undefined {
  const file = corpus.getFile(path) ?? corpus.getFile(`${path}.txt`);
  const officium = file?.sections.find((section) => section.header === 'Officium');
  for (const node of officium?.content ?? []) {
    if (node.type === 'text') {
      const title = node.value
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && line !== '_');
      if (title) {
        return title;
      }
    }
    if (node.type === 'verseMarker') {
      const verseTitle = node.text.trim();
      if (verseTitle && verseTitle !== '_') {
        return `${node.marker} ${verseTitle}`;
      }
    }
  }

  return undefined;
}
