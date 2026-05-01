import type {
  ParsedSection,
  TextContent,
  TextIndex,
  TextSource
} from '@officium-novum/parser';
import type { TextReference } from '@officium-novum/rubrical-engine';
import { ensureTxtSuffix } from '@officium-novum/parser';

import { swapLanguageSegment } from './path.js';
import type { ResolvedSection, ResolveOptions } from './reference-resolver.js';

type SectionResolver = (
  index: TextIndex,
  path: string,
  sectionName: string
) => ParsedSection | undefined;

type LanguageResolver = (
  index: TextIndex,
  reference: TextReference,
  language: string,
  options: Pick<
    ResolveOptions,
    'langfb' | 'dayOfWeek' | 'date' | 'season' | 'version' | 'modernStyleMonthday' | 'onWarning'
  >,
  sourceFallbackDepth: number
) => ResolvedSection | undefined;

export function resolveLocalizedSourceFallback(
  index: TextIndex,
  fallback: ResolvedSection,
  requestedLanguage: string,
  fallbackLanguage: string,
  options: Pick<
    ResolveOptions,
    'langfb' | 'dayOfWeek' | 'date' | 'season' | 'version' | 'modernStyleMonthday' | 'onWarning'
  >,
  sourceFallbackDepth: number,
  resolvers: {
    readonly resolveForLanguage: LanguageResolver;
    readonly resolveSectionByName: SectionResolver;
  }
): ResolvedSection | undefined {
  if (sourceFallbackDepth >= 4) {
    return undefined;
  }

  const sources = collectContentSources(fallback.content);
  if (sources.length === 0) {
    return undefined;
  }

  const content: TextContent[] = [];
  let localizedPath: string | undefined;
  let localizedSection: ParsedSection | undefined;
  for (const source of sources) {
    if (sameSource(source, { path: fallback.path, section: fallback.section.header })) {
      return undefined;
    }

    const localized = resolvers.resolveForLanguage(
      index,
      { path: source.path, section: source.section },
      requestedLanguage,
      options,
      sourceFallbackDepth + 1
    );
    if (!localized || localized.language === fallbackLanguage) {
      return undefined;
    }

    localizedPath ??= localized.path;
    localizedSection ??= localized.section;
    content.push(
      ...(
        projectLocalizedSourceContent({
          index,
          source,
          fallbackContent: fallback.content,
          fallbackLanguage,
          localizedContent: localized.content,
          resolveSectionByName: resolvers.resolveSectionByName
        }) ?? localized.content
      )
    );
  }

  if (!localizedPath || !localizedSection || content.length === 0) {
    return undefined;
  }

  return Object.freeze({
    language: requestedLanguage,
    path: localizedPath,
    section: localizedSection,
    content: Object.freeze(content),
    selectorUnhandled: false,
    selectorMissing: false
  });
}

function projectLocalizedSourceContent(args: {
  readonly index: TextIndex;
  readonly source: TextSource;
  readonly fallbackContent: readonly TextContent[];
  readonly fallbackLanguage: string;
  readonly localizedContent: readonly TextContent[];
  readonly resolveSectionByName: SectionResolver;
}): readonly TextContent[] | undefined {
  const fallbackSourcePath = swapLanguageSegment(args.source.path, args.fallbackLanguage);
  const fallbackSourceSection = args.resolveSectionByName(
    args.index,
    fallbackSourcePath,
    args.source.section
  );
  if (!fallbackSourceSection) {
    return undefined;
  }

  const projectedFallback = args.fallbackContent.filter((node) =>
    nodeBelongsToSource(node, args.source)
  );
  if (projectedFallback.length === 0) {
    return undefined;
  }

  const range = findContiguousContentRange(fallbackSourceSection.content, projectedFallback);
  if (!range || args.localizedContent.length < range.end) {
    return undefined;
  }

  return Object.freeze(args.localizedContent.slice(range.start, range.end));
}

function nodeBelongsToSource(node: TextContent, source: TextSource): boolean {
  if (node.source && sameSource(node.source, source)) {
    return true;
  }
  if (node.type !== 'conditional') {
    return false;
  }
  return node.content.some((child) => nodeBelongsToSource(child, source));
}

function findContiguousContentRange(
  sourceContent: readonly TextContent[],
  projectedContent: readonly TextContent[]
): { readonly start: number; readonly end: number } | undefined {
  if (projectedContent.length > sourceContent.length) {
    return undefined;
  }

  for (let start = 0; start <= sourceContent.length - projectedContent.length; start += 1) {
    const end = start + projectedContent.length;
    const matches = projectedContent.every((node, offset) =>
      contentNodesEquivalent(sourceContent[start + offset]!, node)
    );
    if (matches) {
      return { start, end };
    }
  }

  return undefined;
}

function contentNodesEquivalent(left: TextContent, right: TextContent): boolean {
  const leftComparable = contentNodeComparable(left);
  const rightComparable = contentNodeComparable(right);
  return JSON.stringify(leftComparable) === JSON.stringify(rightComparable);
}

function contentNodeComparable(node: TextContent): unknown {
  if (node.type === 'conditional') {
    return {
      type: node.type,
      condition: node.condition,
      content: node.content.map((child) => contentNodeComparable(child))
    };
  }

  const { source: _source, ...comparable } = node;
  return comparable;
}

function collectContentSources(content: readonly TextContent[]): readonly TextSource[] {
  const sources: TextSource[] = [];
  const seen = new Set<string>();
  for (const node of content) {
    collectNodeSources(node, sources, seen);
  }
  return sources;
}

function collectNodeSources(
  node: TextContent,
  sources: TextSource[],
  seen: Set<string>
): void {
  const source = node.source;
  if (source) {
    const key = sourceKey(source);
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(source);
    }
  }

  if (node.type === 'conditional') {
    for (const child of node.content) {
      collectNodeSources(child, sources, seen);
    }
  }
}

function sameSource(left: TextSource, right: TextSource): boolean {
  return sourceKey(left) === sourceKey(right);
}

function sourceKey(source: TextSource): string {
  return `${ensureTxtSuffix(source.path)}#${source.section}`.toLowerCase();
}
