"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarHeatmap } from "@/charts/CalendarHeatmap";
import { DayHourHeatmap } from "@/charts/DayHourHeatmap";
import { ListeningTimeline } from "@/charts/ListeningTimeline";
import { RankedList } from "@/charts/RankedList";
import { FeaturedInsight } from "@/components/FeaturedInsight";
import { LifetimeCarousel } from "@/components/LifetimeCarousel";
import { PlaybackCard } from "@/components/PlaybackCard";
import {
  LASTFM_MAX_PUBLIC_SCROBBLES,
  LASTFM_USERNAME_MAX_LENGTH,
} from "@/lib/config";
import { trackDashboardCreated } from "@/lib/dashboard-analytics";
import type { DashboardDateRange, DashboardRange } from "@/lib/dashboard-types";
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
  { key: "30-days", label: "1 month", shortLabel: "1m" },
  { key: "6-months", label: "6 months", shortLabel: "6m" },
  { key: "12-months", label: "12 months", shortLabel: "12m" },
  { key: "all-time", label: "All time", shortLabel: "All" },
  { key: "custom", label: "Custom", shortLabel: "Dates" },
] as const;

type ViewerRange = DashboardRange | "custom";

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

const listeningDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const rangeLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function listeningDateKey(playedAt: string) {
  const parts = Object.fromEntries(
    listeningDateFormatter
      .formatToParts(new Date(playedAt))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatCustomRange(range: DashboardDateRange) {
  const start = rangeLabelFormatter.format(
    new Date(`${range.startDate}T00:00:00Z`),
  );
  const end = rangeLabelFormatter.format(
    new Date(`${range.endDate}T00:00:00Z`),
  );
  return start === end ? start : `${start} – ${end}`;
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

function ViewerDashboard({
  history,
  nowPlaying,
}: {
  history: PublicLastFmHistory;
  nowPlaying: LastFmNowPlaying | null;
}) {
  const availableDateRange = useMemo<DashboardDateRange | null>(() => {
    if (!history.plays.length) return null;

    let earliest = history.plays[0].playedAt;
    let latest = earliest;
    for (const play of history.plays) {
      if (play.playedAt < earliest) earliest = play.playedAt;
      if (play.playedAt > latest) latest = play.playedAt;
    }
    return {
      startDate: listeningDateKey(earliest),
      endDate: listeningDateKey(latest),
    };
  }, [history]);
  const [range, setRange] = useState<ViewerRange>("all-time");
  const [customStartDate, setCustomStartDate] = useState(
    availableDateRange?.startDate ?? "",
  );
  const [customEndDate, setCustomEndDate] = useState(
    availableDateRange?.endDate ?? "",
  );
  const [appliedCustomRange, setAppliedCustomRange] =
    useState<DashboardDateRange | null>(availableDateRange);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const activeRange =
    range === "custom" ? (appliedCustomRange ?? "all-time") : range;
  const data = useMemo(
    () => buildPublicDashboardData(history, activeRange),
    [activeRange, history],
  );
  const scopeLabel =
    range === "custom" && appliedCustomRange
      ? formatCustomRange(appliedCustomRange)
      : (viewerRanges.find((option) => option.key === range)?.label ??
        "All time");

  function selectRange(nextRange: ViewerRange) {
    setRange(nextRange);
    setCustomRangeError(null);
  }

  function applyCustomRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customStartDate || !customEndDate) {
      setCustomRangeError("Choose both a start date and an end date.");
      return;
    }
    if (customStartDate > customEndDate) {
      setCustomRangeError("The start date must be on or before the end date.");
      return;
    }

    setAppliedCustomRange({
      startDate: customStartDate,
      endDate: customEndDate,
    });
    setCustomRangeError(null);
    setRange("custom");
  }

  return (
    <div className="public-dashboard">
      <PlaybackCard nowPlaying={nowPlaying} recentPlay={data.recentPlay} />

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
                onClick={() => selectRange(option.key)}
                aria-pressed={option.key === range}
              >
                <span className="range-full">{option.label}</span>
                <span className="range-short">{option.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {range === "custom" ? (
          <form className="custom-date-range" onSubmit={applyCustomRange}>
            <label>
              <span>From</span>
              <input
                type="date"
                value={customStartDate}
                min={availableDateRange?.startDate}
                max={availableDateRange?.endDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                required
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date"
                value={customEndDate}
                min={availableDateRange?.startDate}
                max={availableDateRange?.endDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                required
              />
            </label>
            <button type="submit">Apply dates</button>
            {customRangeError ? (
              <p className="custom-date-error" role="alert">
                {customRangeError}
              </p>
            ) : null}
          </form>
        ) : null}

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
  const [liveNowPlaying, setLiveNowPlaying] = useState<LastFmNowPlaying | null>(
    null,
  );
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

  const activeLiveUsername = history && !loading ? history.username : null;

  useEffect(() => {
    if (!activeLiveUsername) return;

    const polledUsername = activeLiveUsername;
    let cancelled = false;
    let refreshing = false;

    async function refreshNowPlaying() {
      if (cancelled || refreshing || document.visibilityState !== "visible") {
        return;
      }

      refreshing = true;
      try {
        const page = await fetchPage(polledUsername, 1);
        if (!cancelled) setLiveNowPlaying(page.nowPlaying);
      } catch {
        if (!cancelled) setLiveNowPlaying(null);
      } finally {
        refreshing = false;
      }
    }

    void refreshNowPlaying();
    const interval = window.setInterval(() => void refreshNowPlaying(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeLiveUsername]);

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
    setLiveNowPlaying(null);
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
        cachedAt: new Date().toISOString(),
        truncated: firstPage.truncated,
        totalAvailable: firstPage.total,
      };
      await cachePublicHistory(nextHistory);
      window.localStorage.setItem(LAST_USERNAME_KEY, requestedUsername);
      setHistory(nextHistory);
      trackDashboardCreated("lastfm");
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
    setLiveNowPlaying(null);
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
          <h1 id="lastfm-explorer-heading">Build a Dashboard from Last.fm</h1>
          <p>
            Enter any public username. The analyzed history is cached only in
            this browser. Imports are capped at the most recent{" "}
            {LASTFM_MAX_PUBLIC_SCROBBLES.toLocaleString()}
            {" scrobbles."}
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
              maxLength={LASTFM_USERNAME_MAX_LENGTH}
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
          <ViewerDashboard
            key={`${history.username}:${history.cachedAt}`}
            history={history}
            nowPlaying={liveNowPlaying}
          />
        </>
      ) : null}
      {!history && !loading ? (
        <div className="owner-snapshot-divider" aria-hidden="true" />
      ) : null}
    </section>
  );
}
