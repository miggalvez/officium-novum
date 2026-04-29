export function LoadingState({ label = 'Loading…' }: { label?: string }): JSX.Element {
  return (
    <div className="loading" role="status" aria-live="polite">
      {label}
    </div>
  );
}
