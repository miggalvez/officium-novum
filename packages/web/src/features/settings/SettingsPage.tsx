import { useLanguagesMetadata, useVersions } from './use-versions';
import {
  resetSettings,
  updateSettings,
  useSettings,
  type DemoSettings
} from './settings-store';
import { LanguagePicker } from '../../components/LanguagePicker';
import { VersionPicker } from '../../components/VersionPicker';
import { DisplayModePicker } from '../../components/DisplayModePicker';
import type { TextOrthographyProfile } from '../../api/types';

export function SettingsPage(): JSX.Element {
  const settings = useSettings();
  const versions = useVersions();
  const languages = useLanguagesMetadata();

  const update = <K extends keyof DemoSettings>(key: K, value: DemoSettings[K]) => {
    updateSettings({ [key]: value } as Partial<DemoSettings>);
  };

  return (
    <article>
      <h1>Settings</h1>
      <p className="muted">
        Settings are saved in this browser only. They control the defaults applied when you open
        the demo and are not sent anywhere.
      </p>

      <section className="section-card">
        <h2>Defaults</h2>
        <div className="form-row">
          <VersionPicker
            value={settings.defaultVersion}
            versions={versions}
            onChange={(version) => update('defaultVersion', version)}
          />
        </div>
        <div className="form-row">
          <LanguagePicker
            value={settings.defaultLanguages}
            onChange={(value) => update('defaultLanguages', value)}
          />
        </div>
        <div className="form-row">
          <label>
            <span>Orthography</span>
            <select
              value={settings.orthography}
              onChange={(e) =>
                update('orthography', e.target.value as TextOrthographyProfile)
              }
            >
              <option value="version">Version</option>
              <option value="source">Source</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <DisplayModePicker
            value={settings.displayMode}
            onChange={(value) => update('displayMode', value)}
          />
        </div>
        <div className="form-row">
          <label>
            <span>Font size</span>
            <select
              value={settings.fontSize}
              onChange={(e) =>
                update('fontSize', e.target.value as DemoSettings['fontSize'])
              }
            >
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="larger">Larger</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              checked={settings.reviewerMode}
              onChange={(e) => update('reviewerMode', e.target.checked)}
            />
            <span>Reviewer mode (show validation details)</span>
          </label>
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              checked={settings.strict}
              onChange={(e) => update('strict', e.target.checked)}
            />
            <span>Strict composition mode</span>
          </label>
        </div>
      </section>

      <section className="section-card">
        <h2>Available languages</h2>
        {languages.length === 0 ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul>
            {languages.map((lang) => (
              <li key={lang.tag}>
                <code>{lang.tag}</code> — {lang.label} ({lang.corpusName})
                {lang.defaultFallback ? ` · fallback: ${lang.defaultFallback}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="button" onClick={() => resetSettings()}>
        Reset to defaults
      </button>
    </article>
  );
}
