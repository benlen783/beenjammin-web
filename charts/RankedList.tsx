import type { RankedArtist } from "@/lib/dashboard-types";

export function RankedList({ rows }: { rows: RankedArtist[] }) {
  const maximum = rows[0]?.plays ?? 1;

  return (
    <ol className="ranked-list">
      {rows.map((row, index) => (
        <li key={row.name} className="ranked-row">
          <span className="rank-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="rank-main">
            <div className="rank-labels">
              <strong>{row.name}</strong>
              <span>{row.plays.toLocaleString()} plays</span>
            </div>
            <div className="rank-track">
              <span
                style={{
                  width: `${Math.max(3, (row.plays / maximum) * 100)}%`,
                }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
