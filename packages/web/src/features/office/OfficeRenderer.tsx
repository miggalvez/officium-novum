import type {
  PublicComposedHourDto,
  PublicLanguageTag,
  TextOrthographyProfile
} from '../../api/types';
import { SectionRenderer } from './SectionRenderer';

export interface OfficeRendererProps {
  readonly office: PublicComposedHourDto;
  readonly languages: readonly PublicLanguageTag[];
  readonly displayMode: 'parallel' | 'sequential';
  readonly reviewerMode: boolean;
}

export function OfficeRenderer({
  office,
  languages,
  displayMode,
  reviewerMode
}: OfficeRendererProps): JSX.Element {
  const visibleLanguages = languages.filter((lang) =>
    office.languages.includes(lang)
  );
  const fallbackLanguages = visibleLanguages.length > 0 ? visibleLanguages : office.languages;

  return (
    <div className="office">
      {office.sections.map((section, index) => (
        <SectionRenderer
          key={`${section.slot}-${index}`}
          section={section}
          languages={fallbackLanguages}
          displayMode={displayMode}
          reviewerMode={reviewerMode}
        />
      ))}
      {reviewerMode ? <ReviewerMeta office={office} orthography={office.orthography} /> : null}
    </div>
  );
}

function ReviewerMeta({
  office,
  orthography
}: {
  office: PublicComposedHourDto;
  orthography: TextOrthographyProfile;
}): JSX.Element {
  return (
    <aside className="reviewer-meta" aria-label="Reviewer metadata">
      <dl>
        <dt>Date</dt>
        <dd>{office.date}</dd>
        <dt>Hour</dt>
        <dd>{office.hour}</dd>
        <dt>Celebration</dt>
        <dd>{office.celebration}</dd>
        <dt>Orthography</dt>
        <dd>{orthography}</dd>
        <dt>Languages</dt>
        <dd>{office.languages.join(', ')}</dd>
        <dt>Section count</dt>
        <dd>{office.sections.length}</dd>
      </dl>
    </aside>
  );
}
