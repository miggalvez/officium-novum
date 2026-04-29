import type { ComposedRunDto } from '../../api/types';

export interface RunRendererProps {
  readonly run: ComposedRunDto;
}

export function RunRenderer({ run }: RunRendererProps): JSX.Element {
  switch (run.type) {
    case 'text':
      return <span>{run.value}</span>;
    case 'rubric':
      return <span className="run-rubric">{run.value}</span>;
    case 'citation':
      return <span className="run-citation">{run.value}</span>;
    case 'unresolved-macro':
      return <span className="run-unresolved" title="Unresolved macro">{`&${run.name}`}</span>;
    case 'unresolved-formula':
      return <span className="run-unresolved" title="Unresolved formula">{`$${run.name}`}</span>;
    case 'unresolved-reference':
      return <span className="run-unresolved" title="Unresolved reference">{'@?'}</span>;
    default: {
      const _exhaustive: never = run;
      void _exhaustive;
      return <span />;
    }
  }
}
