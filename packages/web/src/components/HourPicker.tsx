import type { ChangeEvent } from 'react';

import { ALL_HOURS, type HourName } from '../api/types';

const HOUR_LABELS: Record<HourName, string> = {
  matins: 'Matins',
  lauds: 'Lauds',
  prime: 'Prime',
  terce: 'Terce',
  sext: 'Sext',
  none: 'None',
  vespers: 'Vespers',
  compline: 'Compline'
};

export interface HourPickerProps {
  readonly value: HourName;
  readonly onChange: (hour: HourName) => void;
}

export function HourPicker({ value, onChange }: HourPickerProps): JSX.Element {
  return (
    <label>
      <span>Hour</span>
      <select
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value as HourName)
        }
      >
        {ALL_HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {HOUR_LABELS[hour]}
          </option>
        ))}
      </select>
    </label>
  );
}
