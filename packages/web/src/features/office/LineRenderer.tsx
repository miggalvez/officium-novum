import type { ComposedRunDto, PublicComposedLineDto, PublicLanguageTag } from '../../api/types';
import { RunRenderer } from './RunRenderer';

export interface LineRendererProps {
  readonly line: PublicComposedLineDto;
  readonly languages: readonly PublicLanguageTag[];
  readonly displayMode: 'parallel' | 'sequential';
}

export function LineRenderer({ line, languages, displayMode }: LineRendererProps): JSX.Element {
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
        />
      ))}
    </div>
  );
}

function LangCell({
  lang,
  runs,
  marker,
  showLabel
}: {
  lang: PublicLanguageTag;
  runs: readonly ComposedRunDto[];
  marker?: string;
  showLabel: boolean;
}): JSX.Element {
  return (
    <div className="office__lang-cell" data-lang={lang} lang={lang}>
      {showLabel ? (
        <span className="office__lang-label">{lang === 'la' ? 'Latin' : 'English'}</span>
      ) : null}
      {marker ? <span className="office__marker">{marker}</span> : null}
      {runs.map((run, index) => (
        <RunRenderer key={index} run={run} />
      ))}
    </div>
  );
}
