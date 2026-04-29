import type { ChangeEvent } from 'react';

import type { PublicLanguageTag } from '../api/types';

export interface LanguagePickerProps {
  readonly value: readonly PublicLanguageTag[];
  readonly onChange: (next: readonly PublicLanguageTag[]) => void;
}

const OPTIONS: ReadonlyArray<{
  readonly key: string;
  readonly value: readonly PublicLanguageTag[];
  readonly label: string;
}> = [
  { key: 'la', value: ['la'], label: 'Latin' },
  { key: 'en', value: ['en'], label: 'English' },
  { key: 'la,en', value: ['la', 'en'], label: 'Latin + English' }
];

function keyOf(value: readonly PublicLanguageTag[]): string {
  return value.join(',');
}

export function LanguagePicker({ value, onChange }: LanguagePickerProps): JSX.Element {
  return (
    <label>
      <span>Languages</span>
      <select
        value={keyOf(value)}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          const found = OPTIONS.find((option) => option.key === event.target.value);
          if (found) {
            onChange(found.value);
          }
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
