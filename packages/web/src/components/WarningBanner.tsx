import type { ApiWarning } from '../api/types';

export interface WarningBannerProps {
  readonly warnings: readonly ApiWarning[];
  readonly title?: string;
}

export function WarningBanner({
  warnings,
  title = 'Composition warnings'
}: WarningBannerProps): JSX.Element | null {
  if (warnings.length === 0) {
    return null;
  }
  const hasError = warnings.some((warning) => warning.severity === 'error');
  return (
    <div
      className={hasError ? 'warning-banner warning-banner--error' : 'warning-banner'}
      role={hasError ? 'alert' : 'status'}
    >
      <strong>{title}</strong>
      <ul>
        {warnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`}>
            <code>{warning.code}</code> — {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
