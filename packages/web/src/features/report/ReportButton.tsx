import { useState } from 'react';

import { ReportDialog } from './ReportDialog';
import type { ReportContextInput } from './report-payload';

export interface ReportButtonProps {
  readonly context: ReportContextInput;
  readonly label?: string;
}

export function ReportButton({ context, label = 'Report this' }: ReportButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      <ReportDialog open={open} context={context} onClose={() => setOpen(false)} />
    </>
  );
}
