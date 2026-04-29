import { useLink } from '../../app/router';
import { ALL_HOURS, type HourName } from '../../api/types';
import { buildOfficeRoute } from '../../routes/build-route';
import type { CommonState } from '../../routes/paths';

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

export interface HourNavProps {
  readonly date: string;
  readonly current: HourName;
  readonly state: CommonState;
}

export function HourNav({ date, current, state }: HourNavProps): JSX.Element {
  return (
    <nav className="toolbar" aria-label="Hours">
      {ALL_HOURS.map((hour) => (
        <HourLink key={hour} hour={hour} date={date} current={current} state={state} />
      ))}
    </nav>
  );
}

function HourLink({
  hour,
  date,
  current,
  state
}: {
  hour: HourName;
  date: string;
  current: HourName;
  state: CommonState;
}): JSX.Element {
  const href = buildOfficeRoute({
    date,
    hour,
    version: state.version,
    languages: state.languages,
    ...(state.langfb ? { langfb: state.langfb } : {}),
    orthography: state.orthography,
    displayMode: state.displayMode,
    fontSize: state.fontSize,
    strict: state.strict
  });
  const link = useLink(href);
  return (
    <a {...link} className="button" aria-current={hour === current ? 'page' : undefined}>
      {HOUR_LABELS[hour]}
    </a>
  );
}
