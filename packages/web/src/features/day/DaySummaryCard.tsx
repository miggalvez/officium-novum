import type { DaySummaryDto } from '../../api/types';

export interface DaySummaryCardProps {
  readonly summary: DaySummaryDto;
}

export function DaySummaryCard({ summary }: DaySummaryCardProps): JSX.Element {
  return (
    <section className="section-card">
      <h2>{summary.celebration.feast.title}</h2>
      <p className="muted">
        {summary.date} · {summary.temporal.dayName} · {summary.temporal.season}
      </p>
      <dl>
        <dt>Rank</dt>
        <dd>
          {summary.celebration.rank.name} ({summary.celebration.rank.classSymbol})
        </dd>
        <dt>Source</dt>
        <dd>{summary.celebration.source}</dd>
        {summary.celebration.transferredFrom ? (
          <>
            <dt>Transferred from</dt>
            <dd>{summary.celebration.transferredFrom}</dd>
          </>
        ) : null}
      </dl>
      {summary.commemorations.length > 0 ? (
        <>
          <h3>Commemorations</h3>
          <ul>
            {summary.commemorations.map((comm, index) => (
              <li key={`${comm.feast.id}-${index}`}>
                {comm.feast.title} — {comm.reason}
                {comm.color ? ` · ${comm.color}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
