import type { ChangeEvent } from 'react';

export type DisplayMode = 'parallel' | 'sequential';

export interface DisplayModePickerProps {
  readonly value: DisplayMode;
  readonly onChange: (mode: DisplayMode) => void;
}

export function DisplayModePicker({ value, onChange }: DisplayModePickerProps): JSX.Element {
  return (
    <label>
      <span>Display</span>
      <select
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value as DisplayMode)
        }
      >
        <option value="parallel">Parallel</option>
        <option value="sequential">Sequential</option>
      </select>
    </label>
  );
}
