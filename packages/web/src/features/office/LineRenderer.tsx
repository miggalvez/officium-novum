import type { ComposedRunDto, PublicComposedLineDto, PublicLanguageTag } from '../../api/types';
import { RunRenderer } from './RunRenderer';

export interface LineRendererProps {
  readonly line: PublicComposedLineDto;
  readonly languages: readonly PublicLanguageTag[];
  readonly displayMode: 'parallel' | 'sequential';
  readonly reviewerMode: boolean;
}

export function LineRenderer({
  line,
  languages,
  displayMode,
  reviewerMode
}: LineRendererProps): JSX.Element {
  const visible = languages.filter((lang) => Boolean(line.texts[lang]?.length));
  const mode: 'parallel' | 'single' =
    displayMode === 'sequential' || visible.length <= 1 ? 'single' : 'parallel';

  if (visible.length === 0) {
    return <></>;
  }

  if (mode === 'single') {
    return (
      <div className="office__line" data-mode="single">
        {visible.map((lang) => (
          <LangCell
            key={lang}
            lang={lang}
            runs={line.texts[lang] ?? []}
            marker={line.marker}
            showLabel={visible.length > 1}
            reviewerMode={reviewerMode}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="office__line" data-mode="parallel">
      {visible.map((lang) => (
        <LangCell
          key={lang}
          lang={lang}
          runs={line.texts[lang] ?? []}
          marker={line.marker}
          showLabel={true}
          reviewerMode={reviewerMode}
        />
      ))}
    </div>
  );
}

function LangCell({
  lang,
  runs,
  marker,
  showLabel,
  reviewerMode
}: {
  lang: PublicLanguageTag;
  runs: readonly ComposedRunDto[];
  marker?: string;
  showLabel: boolean;
  reviewerMode: boolean;
}): JSX.Element {
  return (
    <div className="office__lang-cell" data-lang={lang} lang={lang}>
      {showLabel ? (
        <span className="office__lang-label">{lang === 'la' ? 'Latin' : 'English'}</span>
      ) : null}
      {marker ? (
        <span className="office__marker" aria-label={markerLabel(marker)}>
          {liturgicalMarker(marker)}
        </span>
      ) : null}
      {runs.map((run, index) => (
        <RunRenderer key={index} run={run} reviewerMode={reviewerMode} />
      ))}
    </div>
  );
}

/**
 * Render the printed-breviary glyphs for versicle (℣) and response (℟)
 * markers. Falls back to whatever the upstream emitted if it's already
 * something else (e.g. a numeral, an antiphon label).
 */
function liturgicalMarker(marker: string): string {
  const trimmed = marker.trim().replace(/[.\s]+$/, '');
  switch (trimmed) {
    case 'V':
    case 'v':
    case '℣':
      return '℣.';
    case 'R':
    case 'r':
    case '℟':
      return '℟.';
    default:
      return marker;
  }
}

function markerLabel(marker: string): string {
  const m = marker.trim().replace(/[.\s]+$/, '');
  if (m === 'V' || m === '℣') return 'Versicle';
  if (m === 'R' || m === '℟') return 'Response';
  return marker;
}
