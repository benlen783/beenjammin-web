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

const numberFormatter = new Intl.NumberFormat("en-US");

export function CommandCenter({
  data,
  range,
}: {
  data: DashboardData;
  range: DashboardRange;
}) {
  const scopeLabel = getDashboardRangeLabel(range);
  const metrics = [
    { label: "Plays", value: data.totals.plays, tone: "primary" },
    { label: "Artists", value: data.totals.artists },
    { label: "Tracks", value: data.totals.tracks },
    { label: "Sessions", value: data.totals.sessions },
  ];

  return (
    <div className="command-center-page">
      <section className="command-toolbar" aria-label="Dashboard controls">
        <div className="command-range">
          <div>
            <span>Range</span>
            <strong>{scopeLabel}</strong>
          </div>
          <DateRangeToggle selected={range} basePath="/command-center" />
        </div>
        <div className="command-sync">
          <div>
            <span>Owner example snapshot</span>
            <strong>Read-only</strong>
          </div>
        </div>
      </section>

      <section className="command-summary" aria-label="Listening summary">
        <PlaybackCard nowPlaying={null} recentPlay={data.recentPlay} />
        <div className="command-metrics">
          {metrics.map((metric) => (
            <article
              className={
                metric.tone
                  ? "command-metric command-metric-primary"
                  : "command-metric"
              }
              key={metric.label}
            >
              <span>{metric.label}</span>
              <strong>{numberFormatter.format(metric.value)}</strong>
            </article>
          ))}
        </div>
      </section>

      <div className="command-workspace">
        <article className="panel command-panel command-timeline">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Listening rhythm</p>
              <h2>Activity over time</h2>
            </div>
            <span className="panel-meta">{data.timelineBucket}</span>
          </div>
          <ListeningTimeline points={data.timeline} />
        </article>

        <div className="command-featured">
          <FeaturedInsight
            records={data.lifetime}
            behavior={data.behavior}
            seasonal={data.seasonal}
          />
        </div>

        <article className="panel command-panel command-artists">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Range leaders</p>
              <h2>Artists in rotation</h2>
            </div>
          </div>
          <RankedList rows={data.topArtists} />
        </article>

        <article className="panel command-panel command-heatmap">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Weekly fingerprint</p>
              <h2>When listening happens</h2>
            </div>
            <span className="panel-meta">Chicago</span>
          </div>
          <DayHourHeatmap points={data.dayHour} />
        </article>

        <article className="panel command-panel command-calendar">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent texture</p>
              <h2>Days with a soundtrack</h2>
            </div>
            <span className="panel-meta">365 days</span>
          </div>
          <CalendarHeatmap
            points={data.calendar}
            startedAt={data.calendarStartedAt}
            endedAt={data.calendarEndedAt}
          />
        </article>

        <section
          className="command-lifetime"
          aria-labelledby="command-lifetime-heading"
        >
          <div className="command-lifetime-heading">
            <div>
              <p className="eyebrow">All available history</p>
              <h2 id="command-lifetime-heading">Lifetime records</h2>
            </div>
          </div>
          <LifetimeCarousel
            records={data.lifetime}
            behavior={data.behavior}
            seasonal={data.seasonal}
          />
        </section>
      </div>
    </div>
  );
}
