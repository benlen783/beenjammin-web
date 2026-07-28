"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarHeatmap } from "@/charts/CalendarHeatmap";
import { DayHourHeatmap } from "@/charts/DayHourHeatmap";
import { ListeningTimeline } from "@/charts/ListeningTimeline";
import { RankedList } from "@/charts/RankedList";
import { FeaturedInsight } from "@/components/FeaturedInsight";
import { LifetimeCarousel } from "@/components/LifetimeCarousel";
import { PlaybackCard } from "@/components/PlaybackCard";
import { LASTFM_MAX_PUBLIC_SCROBBLES } from "@/lib/config";
import type { DashboardRange } from "@/lib/dashboard-types";
import {
  buildPublicDashboardData,
  type PublicLastFmHistory,
  type PublicLastFmPlay,
} from "@/lib/public-dashboard";
import {
  cachePublicHistory,
  deleteCachedPublicHistory,
  getCachedPublicHistory,
} from "@/lib/public-history-cache";
import type { LastFmNowPlaying } from "@/lib/lastfm";

const LAST_USERNAME_KEY = "beenjammin:dashboard:lastfm-username";
const PAGE_REQUEST_DELAY_MS = 500;
const PAGE_REQUEST_CONCURRENCY = 3;
const PAGE_REQUEST_ATTEMPTS = 4;
const numberFormatter = new Intl.NumberFormat("en-US");
const viewerRanges = [
  { key: "30-days", label: "30 days", shortLabel: "30d" },
  { key: "90-days", label: "90 days", shortLabel: "90d" },
  { key: "6-months", label: "6 months", shortLabel: "6m" },
  { key: "12-months", label: "12 months", shortLabel: "12m" },
  { key: "this-year", label: "This year", shortLabel: "Year" },
  { key: "all-time", label: "All time", shortLabel: "All" },
] as const;

type PublicPage = {
  plays: PublicLastFmPlay[];
  nowPlaying: LastFmNowPlaying | null;
  page: number;
  totalPages: number;
  total: number;
  truncated: boolean;
  error?: string;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatEstimatedTime(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) {
    return `About ${minutes} ${minutes === 1 ? "minute" : "minutes"} remaining`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? `About ${hours}h ${remainingMinutes}m remaining`
    : `About ${hours} ${hours === 1 ? "hour" : "hours"} remaining`;
}

async function fetchPage(username: string, page: number) {
  for (let attempt = 0; attempt < PAGE_REQUEST_ATTEMPTS; attempt += 1) {
    const params = new URLSearchParams({ username, page: String(page) });
    let response: Response;
    try {
      response = await fetch(`/api/lastfm/public-history?${params}`);
    } catch (error) {
      if (attempt === PAGE_REQUEST_ATTEMPTS - 1) throw error;
      await wait(1_000 * 2 ** attempt);
      continue;
    }
    const body = (await response
      .json()
      .catch(() => ({}))) as Partial<PublicPage>;
    const retryable =
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;

    if (retryable && attempt < PAGE_REQUEST_ATTEMPTS - 1) {
      const retryAfter =
        response.status === 429
          ? Math.min(
              120,
              Math.max(1, Number(response.headers.get("retry-after") ?? 1)),
            ) * 1_000
          : 1_000 * 2 ** attempt;
      await wait(retryAfter);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        body.error ?? "That Last.fm history could not be loaded.",
      );
    }
    return body as PublicPage;
  }

  throw new Error("That Last.fm history could not be loaded.");
}

function ViewerDashboard({ history }: { history: PublicLastFmHistory }) {
  const [range, setRange] = useState<DashboardRange>("12-months");
  const data = useMemo(
    () => buildPublicDashboardData(history, range),
    [history, range],
  );
  const scopeLabel =
    viewerRanges.find((option) => option.key === range)?.label ?? "12 months";

  return (
    <div className="public-dashboard">
      <PlaybackCard
        nowPlaying={history.nowPlaying}
        recentPlay={data.recentPlay}
      />

      <section className="range-section" aria-labelledby="viewer-range-heading">
        <div className="section-heading range-heading">
          <div>
            <p className="eyebrow">Dashboard range</p>
            <h2 id="viewer-range-heading">{scopeLabel}</h2>
          </div>
          <div
            className="range-toggle"
            role="group"
            aria-label="Public dashboard date range"
          >
            {viewerRanges.map((option) => (
              <button
                type="button"
                className={
                  option.key === range ? "range-option active" : "range-option"
                }
                key={option.key}
                onClick={() => setRange(option.key)}
                aria-pressed={option.key === range}
              >
                <span className="range-full">{option.label}</span>
                <span className="range-short">{option.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="metric-grid">
          {[
            ["Plays", data.totals.plays, "Completed scrobbles"],
            ["Artists", data.totals.artists, "Distinct voices"],
            ["Tracks", data.totals.tracks, "Unique recordings"],
            ["Sessions", data.totals.sessions, "30-minute gap rule"],
          ].map(([label, value, detail], index) => (
            <article
              className={
                index === 0 ? "metric-card metric-primary" : "metric-card"
              }
              key={String(label)}
            >
              <span>{label}</span>
              <strong>{numberFormatter.format(Number(value))}</strong>
              <small>{detail}</small>
            </article>
          ))}
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

      <section
        className="lifetime-section"
        aria-labelledby="viewer-lifetime-heading"
      >
        <div className="section-heading lifetime-heading">
          <div>
            <p className="eyebrow">
              {history.truncated
                ? "Most recent public scrobbles"
                : "All public scrobbles"}
            </p>
            <h2 id="viewer-lifetime-heading">Lifetime records</h2>
          </div>
          <p>
            {history.truncated
              ? `Calculated locally from the most recent ${history.plays.length.toLocaleString()} of ${history.totalAvailable?.toLocaleString() ?? "all available"} public scrobbles.`
              : `Calculated locally from @${history.username}'s browser cache.`}
          </p>
        </div>
        <LifetimeCarousel
          records={data.lifetime}
          behavior={data.behavior}
          seasonal={data.seasonal}
        />
      </section>
    </div>
  );
}

export function LastFmDashboardExplorer() {
  const [username, setUsername] = useState("");
  const [history, setHistory] = useState<PublicLastFmHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const importStartedAt = useRef<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<
    string | null
  >(null);
  const [progress, setProgress] = useState({
    page: 0,
    totalPages: 0,
    plays: 0,
    truncated: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const lastUsername = window.localStorage.getItem(LAST_USERNAME_KEY);
      if (!lastUsername) return;
      setUsername(lastUsername);
      try {
        setHistory(await getCachedPublicHistory(lastUsername));
      } catch {
        setError("The browser cache could not be opened.");
      }
    });
  }, []);

  function reportProgress(next: typeof progress) {
    setProgress(next);
    const startedAt = importStartedAt.current;
    const remainingPages = Math.max(0, next.totalPages - next.page);
    if (startedAt === null || next.page === 0 || remainingPages === 0) {
      setEstimatedTimeRemaining(null);
      return;
    }

    const averagePageTime = Math.max(
      PAGE_REQUEST_DELAY_MS,
      (Date.now() - startedAt) / next.page,
    );
    setEstimatedTimeRemaining(
      formatEstimatedTime(remainingPages * averagePageTime),
    );
  }

  async function loadHistory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedUsername = username.trim();
    if (!requestedUsername || loading) return;
    setLoading(true);
    importStartedAt.current = Date.now();
    setEstimatedTimeRemaining(null);
    setError(null);
    setProgress({ page: 0, totalPages: 0, plays: 0, truncated: false });

    try {
      const firstPage = await fetchPage(requestedUsername, 1);
      const pageResults = Array.from(
        { length: firstPage.totalPages + 1 },
        () => [] as PublicLastFmPlay[],
      );
      pageResults[1] = firstPage.plays;
      reportProgress({
        page: 1,
        totalPages: firstPage.totalPages,
        plays: firstPage.plays.length,
        truncated: firstPage.truncated,
      });

      let nextPage = 2;
      let nextRequestAt = Date.now() + PAGE_REQUEST_DELAY_MS;
      let completedPages = 1;
      let completedPlays = firstPage.plays.length;
      let stopped = false;

      async function loadNextPages() {
        while (!stopped) {
          const page = nextPage;
          nextPage += 1;
          if (page > firstPage.totalPages) return;

          const requestAt = Math.max(Date.now(), nextRequestAt);
          nextRequestAt = requestAt + PAGE_REQUEST_DELAY_MS;
          await wait(Math.max(0, requestAt - Date.now()));
          if (stopped) return;

          try {
            const result = await fetchPage(requestedUsername, page);
            pageResults[page] = result.plays;
            completedPages += 1;
            completedPlays += result.plays.length;
            reportProgress({
              page: completedPages,
              totalPages: firstPage.totalPages,
              plays: completedPlays,
              truncated: firstPage.truncated,
            });
          } catch (pageError) {
            stopped = true;
            throw pageError;
          }
        }
      }

      const workerCount = Math.min(
        PAGE_REQUEST_CONCURRENCY,
        Math.max(0, firstPage.totalPages - 1),
      );
      const workerResults = await Promise.allSettled(
        Array.from({ length: workerCount }, () => loadNextPages()),
      );
      const failedWorker = workerResults.find(
        (result) => result.status === "rejected",
      );
      if (failedWorker?.status === "rejected") throw failedWorker.reason;

      const plays = pageResults.flat();
      const unique = new Map(
        plays.map((play) => [
          `${play.playedAt}\u001f${play.artist.toLocaleLowerCase()}\u001f${play.track.toLocaleLowerCase()}`,
          play,
        ]),
      );
      const nextHistory: PublicLastFmHistory = {
        username: requestedUsername,
        plays: [...unique.values()],
        nowPlaying: firstPage.nowPlaying,
        cachedAt: new Date().toISOString(),
        truncated: firstPage.truncated,
        totalAvailable: firstPage.total,
      };
      await cachePublicHistory(nextHistory);
      window.localStorage.setItem(LAST_USERNAME_KEY, requestedUsername);
      setHistory(nextHistory);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "That Last.fm history could not be loaded.",
      );
    } finally {
      setLoading(false);
      importStartedAt.current = null;
      setEstimatedTimeRemaining(null);
    }
  }

  async function clearHistory() {
    if (history) await deleteCachedPublicHistory(history.username);
    window.localStorage.removeItem(LAST_USERNAME_KEY);
    setHistory(null);
    setProgress({ page: 0, totalPages: 0, plays: 0, truncated: false });
  }

  return (
    <section
      className={`lastfm-dashboard-explorer${history || loading ? " has-visitor-history" : ""}`}
      aria-labelledby="lastfm-explorer-heading"
    >
      <div className="viewer-intro">
        <div>
          <p className="eyebrow">Try your own listening history</p>
          <h2 id="lastfm-explorer-heading">Build a Dashboard from Last.fm</h2>
          <p>
            Enter any public username. The analyzed history is cached only in
            this browser. Imports are capped at the most recent{" "}
            {LASTFM_MAX_PUBLIC_SCROBBLES.toLocaleString()}
            {" scrobbles"}; the owner&apos;s example snapshot remains below.
          </p>
        </div>
        <form className="viewer-search" onSubmit={loadHistory}>
          <label htmlFor="dashboard-lastfm-username">Last.fm username</label>
          <div>
            <span aria-hidden="true">@</span>
            <input
              id="dashboard-lastfm-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={loading || !username.trim()}>
              {loading ? "Loading…" : history ? "Load user" : "Build dashboard"}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <section className="viewer-progress" aria-live="polite">
          <div>
            <strong>
              Downloading @{username.trim()}&apos;s public history
            </strong>
            <span>
              Page {progress.page.toLocaleString()} of{" "}
              {progress.totalPages.toLocaleString()} ·{" "}
              {progress.plays.toLocaleString()} scrobbles
            </span>
            {progress.truncated ? (
              <small>
                This account is larger than the safety cap; only its most recent{" "}
                {LASTFM_MAX_PUBLIC_SCROBBLES.toLocaleString()}
                {" scrobbles"} will be analyzed.
              </small>
            ) : null}
          </div>
          <progress
            value={progress.page}
            max={Math.max(1, progress.totalPages)}
          />
          <small>
            {estimatedTimeRemaining
              ? `Estimated: ${estimatedTimeRemaining}. `
              : "Estimating time remaining… "}
            Keep this tab open—closing or reloading it will stop the import.
          </small>
        </section>
      ) : null}

      {error ? <p className="viewer-error">{error}</p> : null}

      {history && !loading ? (
        <>
          <div className="viewer-cache-status">
            <span>
              Viewing <strong>@{history.username}</strong> ·{" "}
              {history.plays.length.toLocaleString()} scrobbles cached in this
              browser
              {history.truncated && history.totalAvailable
                ? ` · most recent of ${history.totalAvailable.toLocaleString()} available`
                : ""}
            </span>
            <button type="button" onClick={clearHistory}>
              Clear cached user
            </button>
          </div>
          <ViewerDashboard history={history} />
        </>
      ) : null}
      {!history && !loading ? (
        <div className="owner-snapshot-divider" aria-hidden="true" />
      ) : null}
    </section>
  );
}
