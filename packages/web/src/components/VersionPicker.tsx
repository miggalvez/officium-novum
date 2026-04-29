import type { ChangeEvent } from 'react';

import type { VersionInfo } from '../api/types';

export interface VersionPickerProps {
  readonly value: string;
  readonly versions: readonly VersionInfo[];
  readonly onChange: (handle: string) => void;
}

export function VersionPicker({ value, versions, onChange }: VersionPickerProps): JSX.Element {
  const supported = versions.filter((info) => info.status === 'supported');
  const others = versions.filter((info) => info.status !== 'supported');
  const valueExists = versions.some((info) => info.handle === value);

  return (
    <label>
      <span>Version</span>
      <select
        value={valueExists ? value : ''}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
      >
        {!valueExists ? (
          <option value="" disabled>
            {value} (unknown)
          </option>
        ) : null}
        {supported.length > 0 ? (
          <optgroup label="Supported">
            {supported.map((info) => (
              <option key={info.handle} value={info.handle}>
                {info.handle}
              </option>
            ))}
          </optgroup>
        ) : null}
        {others.length > 0 ? (
          <optgroup label="Deferred / Missa-only">
            {others.map((info) => (
              <option key={info.handle} value={info.handle}>
                {info.handle} ({info.status})
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}
