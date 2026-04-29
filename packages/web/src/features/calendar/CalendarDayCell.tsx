import { useLink } from '../../app/router';
import type { CalendarDayDto } from '../../api/types';
import { buildOfficeRoute } from '../../routes/build-route';
import { DEFAULT_HOUR } from '../../routes/paths';

export interface CalendarDayCellProps {
  readonly day: CalendarDayDto;
  readonly version: string;
}

export function CalendarDayCell({ day, version }: CalendarDayCellProps): JSX.Element {
  const date = day.date;
  const dayNumber = date.split('-')[2];
  const href = buildOfficeRoute({
    date,
    hour: DEFAULT_HOUR,
    version
  });
  const link = useLink(href);
  return (
    <a {...link} className="calendar__cell">
      <span className="calendar__date">{Number(dayNumber)}</span>
      <span className="calendar__title" title={day.celebration.feast.title}>
        {day.celebration.feast.title}
      </span>
      <span className="calendar__rank">
        {day.celebration.rank.classSymbol} · {day.season}
      </span>
      {day.commemorations.length > 0 ? (
        <span className="calendar__commemorations">
          + {day.commemorations.length} commemoration
          {day.commemorations.length === 1 ? '' : 's'}
        </span>
      ) : null}
      {day.warnings.length > 0 ? (
        <span className="calendar__warn" title="Warnings present">
          ⚠ {day.warnings.length}
        </span>
      ) : null}
    </a>
  );
}
