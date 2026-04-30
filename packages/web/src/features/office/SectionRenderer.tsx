import type { PublicLanguageTag, PublicSectionDto } from '../../api/types';
import { LineRenderer } from './LineRenderer';

export interface SectionRendererProps {
  readonly section: PublicSectionDto;
  readonly languages: readonly PublicLanguageTag[];
  readonly displayMode: 'parallel' | 'sequential';
  readonly reviewerMode: boolean;
}

export function SectionRenderer({
  section,
  languages,
  displayMode,
  reviewerMode
}: SectionRendererProps): JSX.Element {
  const heading = sectionTitle(section);
  const headingStyle = sectionHeadingStyle(section);

  return (
    <section className="office__section" aria-label={sectionLabel(section)}>
      {heading ? (
        <h3 className="office__section-heading" data-style={headingStyle}>
          <span>{heading}</span>
        </h3>
      ) : null}
      {reviewerMode ? (
        <p className="muted">
          <code>{section.type}</code>
          {section.reference ? <> · ref <code>{section.reference}</code></> : null}
          {' '} · slot <code>{section.slot}</code>
        </p>
      ) : null}
      {section.lines.map((line, index) => (
        <LineRenderer
          key={index}
          line={line}
          languages={languages}
          displayMode={displayMode}
          reviewerMode={reviewerMode}
        />
      ))}
    </section>
  );
}

function sectionTitle(section: PublicSectionDto): string | null {
  if (section.heading?.kind === 'nocturn') {
    return `Nocturn ${ordinal(section.heading.ordinal)}`;
  }
  if (section.heading?.kind === 'lesson') {
    return `Lesson ${section.heading.ordinal}`;
  }
  return prettifySlot(section.slot);
}

function sectionHeadingStyle(section: PublicSectionDto): 'caps' | 'italic' {
  if (section.heading?.kind === 'lesson' || section.heading?.kind === 'nocturn') {
    return 'caps';
  }
  return 'caps';
}

function sectionLabel(section: PublicSectionDto): string {
  return section.heading
    ? `${section.heading.kind} ${section.heading.ordinal}`
    : section.slot;
}

function prettifySlot(slot: string): string {
  return slot
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ordinal(value: number): string {
  switch (value) {
    case 1:
      return 'I';
    case 2:
      return 'II';
    case 3:
      return 'III';
    default:
      return String(value);
  }
}
