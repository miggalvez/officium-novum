import type { CalendarDayDto } from '../../api/types';
import { CalendarDayCell } from './CalendarDayCell';

export interface CalendarGridProps {
  readonly year: number;
  readonly month: number;
  readonly days: readonly CalendarDayDto[];
  readonly version: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarGrid({ year, month, days, version }: CalendarGridProps): JSX.Element {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  const cells: Array<{ kind: 'empty'; key: string } | { kind: 'day'; day: CalendarDayDto }> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ kind: 'empty', key: `pad-${i}` });
  }
  for (const day of days) {
    cells.push({ kind: 'day', day });
  }

  return (
    <div className="calendar" role="grid" aria-label={`Calendar for ${year}-${month}`}>
      {DAY_NAMES.map((name) => (
        <div key={name} className="calendar__day-name" role="columnheader">
          {name}
        </div>
      ))}
      {cells.map((cell) =>
        cell.kind === 'empty' ? (
          <div key={cell.key} className="calendar__cell calendar__cell--empty" aria-hidden="true" />
        ) : (
          <CalendarDayCell key={cell.day.date} day={cell.day} version={version} />
        )
      )}
    </div>
  );
}
