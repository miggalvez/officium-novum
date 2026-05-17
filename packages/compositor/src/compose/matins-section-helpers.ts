import type { HeadingDescriptor, Section } from '../types/composed-hour.js';

export function prependTeDeumHeading(
  section: Section | undefined,
  languages: readonly string[]
): Section | undefined {
  if (!section) {
    return undefined;
  }
  return Object.freeze({
    ...section,
    lines: Object.freeze([
      Object.freeze({
        texts: Object.freeze(Object.fromEntries(
          languages.map((language) => [
            language,
            Object.freeze([{ type: 'text' as const, value: '_' }])
          ])
        ))
      }),
      Object.freeze({
        texts: Object.freeze(Object.fromEntries(
          languages.map((language) => [
            language,
            Object.freeze([{ type: 'text' as const, value: 'Te Deum' }])
          ])
        ))
      }),
      ...section.lines
    ])
  });
}

export function prependSeparatorLine(
  section: Section | undefined,
  languages: readonly string[]
): Section | undefined {
  if (!section) {
    return undefined;
  }
  return Object.freeze({
    ...section,
    lines: Object.freeze([
      Object.freeze({
        texts: Object.freeze(Object.fromEntries(
          languages.map((language) => [
            language,
            Object.freeze([{ type: 'text' as const, value: '_' }])
          ])
        ))
      }),
      ...section.lines
    ])
  });
}

export function headingSection(
  heading: HeadingDescriptor,
  options: { readonly leadingSeparator?: boolean } = {}
): Section {
  const text =
    heading.kind === 'nocturn'
      ? { Latin: 'Ad Nocturnum', English: 'At the Nocturn' }
      : { Latin: `Lectio ${heading.ordinal}`, English: `Reading ${heading.ordinal}` };
  const lines =
    heading.kind === 'lesson' && options.leadingSeparator !== false
      ? [
          Object.freeze({
            texts: Object.freeze({
              Latin: Object.freeze([{ type: 'text' as const, value: '_' }]),
              English: Object.freeze([{ type: 'text' as const, value: '_' }])
            })
          })
        ]
      : [];
  return Object.freeze({
    type: 'heading' as const,
    slot: 'heading',
    reference: undefined,
    lines: Object.freeze([
      ...lines,
      Object.freeze({
        texts: Object.freeze({
          Latin: Object.freeze([{ type: 'text' as const, value: text.Latin }]),
          English: Object.freeze([{ type: 'text' as const, value: text.English }])
        })
      })
    ]),
    languages: Object.freeze(['Latin', 'English']),
    heading: Object.freeze(heading)
  });
}

export function markSectionFirstLine(
  section: Section | undefined,
  marker: string,
  languages: readonly string[]
): Section | undefined {
  const first = section?.lines[0];
  if (!section || !first) {
    return section;
  }
  const markers = Object.fromEntries(
    languages.map((language) => [
      language,
      language === 'English' && /^Benedictio\.?$/iu.test(marker) ? 'Benediction.' : marker
    ])
  );
  return Object.freeze({
    ...section,
    lines: Object.freeze([
      Object.freeze({
        ...first,
        marker,
        markers: Object.freeze(markers)
      }),
      ...section.lines.slice(1)
    ])
  });
}
