import { useMemo } from 'react';

import { useRouter } from '../../app/router';
import type {
  HourName,
  PublicLanguageTag,
  TextOrthographyProfile,
  VersionInfo
} from '../../api/types';
import { DatePicker } from '../../components/DatePicker';
import { DisplayModePicker } from '../../components/DisplayModePicker';
import { HourPicker } from '../../components/HourPicker';
import { LanguagePicker } from '../../components/LanguagePicker';
import { VersionPicker } from '../../components/VersionPicker';
import { buildOfficeRoute } from '../../routes/build-route';
import type { OfficeRoute } from '../../routes/paths';

export interface OfficeHeaderProps {
  readonly route: OfficeRoute;
  readonly versions: readonly VersionInfo[];
}

export function OfficeHeader({ route, versions }: OfficeHeaderProps): JSX.Element {
  const { navigate } = useRouter();

  const navigateWith = useMemo(
    () => (patch: Partial<{
      date: string;
      hour: HourName;
      version: string;
      languages: readonly PublicLanguageTag[];
      orthography: TextOrthographyProfile;
      displayMode: 'parallel' | 'sequential';
    }>) => {
      const next = buildOfficeRoute({
        date: patch.date ?? route.date,
        hour: patch.hour ?? route.hour,
        version: patch.version ?? route.version,
        languages: patch.languages ?? route.languages,
        ...(route.langfb ? { langfb: route.langfb } : {}),
        orthography: patch.orthography ?? route.orthography,
        displayMode: patch.displayMode ?? route.displayMode,
        fontSize: route.fontSize,
        strict: route.strict
      });
      navigate(next);
    },
    [navigate, route]
  );

  return (
    <div className="toolbar">
      <DatePicker value={route.date} onChange={(date) => navigateWith({ date })} />
      <HourPicker value={route.hour} onChange={(hour) => navigateWith({ hour })} />
      <VersionPicker
        value={route.version}
        versions={versions}
        onChange={(version) => navigateWith({ version })}
      />
      <LanguagePicker
        value={route.languages}
        onChange={(languages) => navigateWith({ languages })}
      />
      <DisplayModePicker
        value={route.displayMode}
        onChange={(displayMode) => navigateWith({ displayMode })}
      />
      <label>
        <span>Orthography</span>
        <select
          value={route.orthography}
          onChange={(e) =>
            navigateWith({ orthography: e.target.value as TextOrthographyProfile })
          }
        >
          <option value="version">Version</option>
          <option value="source">Source</option>
        </select>
      </label>
    </div>
  );
}
