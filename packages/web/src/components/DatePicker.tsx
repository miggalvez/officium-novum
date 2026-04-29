import type { ChangeEvent } from 'react';

export interface DatePickerProps {
  readonly value: string;
  readonly onChange: (date: string) => void;
  readonly label?: string;
}

export function DatePicker({ value, onChange, label = 'Date' }: DatePickerProps): JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </label>
  );
}
