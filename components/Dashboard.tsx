import { CalendarHeatmap } from "@/charts/CalendarHeatmap";
import { DayHourHeatmap } from "@/charts/DayHourHeatmap";
import { ListeningTimeline } from "@/charts/ListeningTimeline";
import { RankedList } from "@/charts/RankedList";
import { DateRangeToggle } from "@/components/DateRangeToggle";
import { FeaturedInsight } from "@/components/FeaturedInsight";
import { LifetimeCarousel } from "@/components/LifetimeCarousel";
import { PlaybackCard } from "@/components/PlaybackCard";
import {
  getDashboardRangeLabel,
  type DashboardData,
  type DashboardRange,
} from "@/lib/dashboard-types";

function formatHistoryDates(start: string | null, end: string | null) {
  if (!start || !end) return "Waiting for listening history";
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "America/Chicago",
  });
  return `${formatter.format(new Date(start))} — ${formatter.format(new Date(end))}`;
}

const numberFormatter = new Intl.NumberFormat("en-US");

export function Dashboard({
  data,
  range,
}: {
  data: DashboardData;
  range: DashboardRange;
}) {
  const scopeLabel = getDashboardRangeLabel(range);

  return (
    <div className="dashboard-page">
      <section className="dashboard-intro">
        <div>
          <p className="snapshot-disclosure">
            Example data · This is a published, read-only snapshot of the site
            owner&apos;s personal listening history, not live visitor data.
          </p>
        </div>
        <div className="history-status">
          <div>
            <strong>Example history coverage</strong>
            <span>
              {formatHistoryDates(data.historyStartedAt, data.historyEndedAt)}
            </span>
          </div>
        </div>
      </section>

      <PlaybackCard nowPlaying={null} recentPlay={data.recentPlay} />

      <section className="range-section" aria-labelledby="range-heading">
        <div className="section-heading range-heading">
          <div>
            <p className="eyebrow">Dashboard range</p>
            <h2 id="range-heading">{scopeLabel}</h2>
          </div>
          <DateRangeToggle selected={range} />
        </div>

        <div className="metric-grid">
          <article className="metric-card metric-primary">
            <span>Plays</span>
            <strong>{numberFormatter.format(data.totals.plays)}</strong>
            <small>Completed scrobbles</small>
          </article>
          <article className="metric-card">
            <span>Artists</span>
            <strong>{numberFormatter.format(data.totals.artists)}</strong>
            <small>Distinct voices</small>
          </article>
          <article className="metric-card">
            <span>Tracks</span>
            <strong>{numberFormatter.format(data.totals.tracks)}</strong>
            <small>Unique recordings</small>
          </article>
          <article className="metric-card">
            <span>Sessions</span>
            <strong>{numberFormatter.format(data.totals.sessions)}</strong>
            <small>30-minute gap rule</small>
          </article>
        </div>
      </section>

      <FeaturedInsight
        records={data.lifetime}
        behavior={data.behavior}
        seasonal={data.seasonal}
      />

      <section className="analytics-grid">
        <article className="panel timeline-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Listening rhythm</p>
              <h2>Activity over time</h2>
            </div>
            <span className="panel-meta">Grouped by {data.timelineBucket}</span>
          </div>
          <ListeningTimeline points={data.timeline} />
        </article>

        <article className="panel ranking-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Range leaders</p>
              <h2>Artists in rotation</h2>
            </div>
          </div>
          <RankedList rows={data.topArtists} />
        </article>

        <article className="panel heatmap-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Weekly fingerprint</p>
              <h2>When listening happens</h2>
            </div>
            <span className="panel-meta">America/Chicago</span>
          </div>
          <DayHourHeatmap points={data.dayHour} />
        </article>

        <article className="panel calendar-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent texture</p>
              <h2>Days with a soundtrack</h2>
            </div>
            <span className="panel-meta">Up to 365 days</span>
          </div>
          <CalendarHeatmap
            points={data.calendar}
            startedAt={data.calendarStartedAt}
            endedAt={data.calendarEndedAt}
          />
        </article>
      </section>

      <section className="lifetime-section" aria-labelledby="lifetime-heading">
        <div className="section-heading lifetime-heading">
          <div>
            <p className="eyebrow">All available history</p>
            <h2 id="lifetime-heading">Lifetime records</h2>
          </div>
          <p>These records do not change with the Dashboard range.</p>
        </div>

        <LifetimeCarousel
          records={data.lifetime}
          behavior={data.behavior}
          seasonal={data.seasonal}
        />
      </section>

      <footer className="dashboard-footer">
        <span>Owner&apos;s example snapshot · Published read-only</span>
        <span>
          Dashboard range: {scopeLabel} · Lifetime records: All history
        </span>
      </footer>
    </div>
  );
}
