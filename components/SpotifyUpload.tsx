"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { SpotifyDurationChart } from "@/charts/SpotifyDurationChart";
import {
  SpotifyAlbumEngagementChart,
  SpotifyConcentrationChart,
  SpotifyListeningModeChart,
  SpotifyReplayDelayChart,
  SpotifySessionAttentionChart,
  SpotifySessionLengthChart,
  SpotifySessionVarietyChart,
  SpotifySkipTimingChart,
  SpotifyWeekHeatmap,
} from "@/charts/SpotifyInsightCharts";
import type { SpotifyDeepDiveSummary } from "@/lib/spotify-deep-dive";
import {
  SPOTIFY_MAX_COMPRESSED_BYTES,
  SPOTIFY_MAX_COMPRESSED_MEGABYTES,
  SPOTIFY_MAX_JSON_FILES,
  SPOTIFY_MAX_PROCESSING_MS,
} from "@/lib/spotify-upload-limits";

type WorkerMessage =
  | { type: "progress"; message: string; completed: number; total: number }
  | { type: "complete"; summary: SpotifyDeepDiveSummary }
  | { type: "error"; error: string };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCoverage(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

type TrackInsight = SpotifyDeepDiveSummary["mostSkipped"][number];
type InsightUnit =
  "skips" | "percent" | "hours" | "shuffle-plays" | "seconds" | "choices";

function insightValue(insight: TrackInsight, unit: InsightUnit) {
  if (unit === "percent") return `${insight.value.toFixed(1)}%`;
  if (unit === "hours") return `${insight.value.toFixed(1)}h`;
  if (unit === "seconds") return `${insight.value.toFixed(1)}s`;
  if (unit === "shuffle-plays")
    return `${insight.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} plays`;
  if (unit === "choices")
    return `${insight.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} starts`;
  return `${insight.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} skips`;
}

function SpotifyTrackRanking({
  title,
  description,
  insights,
  unit,
}: {
  title: string;
  description: string;
  insights: TrackInsight[];
  unit: InsightUnit;
}) {
  return (
    <article className="spotify-ranking-card">
      <span className="spotify-ranking-label">{title}</span>
      <p className="spotify-ranking-description">{description}</p>
      {insights.length ? (
        <ol className="spotify-ranking-list">
          {insights.map((insight, index) => (
            <li key={`${insight.artist}-${insight.track}`}>
              <b>{index + 1}</b>
              <div>
                <strong title={insight.track}>{insight.track}</strong>
                <small title={insight.artist}>{insight.artist}</small>
              </div>
              <em>{insightValue(insight, unit)}</em>
            </li>
          ))}
        </ol>
      ) : (
        <p className="spotify-ranking-empty">Not enough data</p>
      )}
    </article>
  );
}

function SpotifyBehaviorStat({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  tone: "green" | "violet" | "blue" | "amber" | "muted";
}) {
  return (
    <article className={`spotify-behavior-card ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value.toFixed(1)}%</strong>
      </div>
      <div
        className="spotify-behavior-meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <p>{description}</p>
    </article>
  );
}

const playbackReasonLabels: Record<string, string> = {
  appload: "Opened Spotify",
  backbtn: "Pressed Back",
  clickrow: "Selected from a list",
  endplay: "Playback session ended",
  fwdbtn: "Pressed Next",
  logout: "Logged out",
  playbtn: "Pressed Play",
  popup: "Selected from a pop-up",
  remote: "Controlled from another device",
  trackdone: "Track finished",
  trackerror: "Playback error",
  unknown: "Reason not recorded",
};

function playbackReasonLabel(reason: string) {
  return (
    playbackReasonLabels[reason.toLocaleLowerCase("en-US")] ??
    reason.replaceAll("_", " ")
  );
}

const countryNames = new Intl.DisplayNames(["en-US"], { type: "region" });

function countryLabel(country: string) {
  if (country === "Unknown country") return country;
  try {
    return countryNames.of(country) ?? country;
  } catch {
    return country;
  }
}

type TripInsight = SpotifyDeepDiveSummary["trips"][number];

function tripLocationLabel(trip: TripInsight) {
  const labels = trip.countries.map((country) => countryLabel(country.label));
  if (labels.length <= 2) return labels.join(" + ");
  return `${labels.slice(0, 2).join(" + ")} +${labels.length - 2}`;
}

function tripDateRange(trip: TripInsight) {
  return `${formatCoverage(trip.startedAt)} — ${formatCoverage(trip.endedAt)}`;
}

function formatListeningDuration(milliseconds: number) {
  const totalMinutes = Math.round(milliseconds / 60_000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${Math.round(milliseconds / 1_000)}s`;
}

export function SpotifyUpload({
  children,
  initialSummary,
}: {
  children: ReactNode;
  initialSummary: SpotifyDeepDiveSummary;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerWatchdogRef = useRef<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{
    message: string;
    completed: number;
    total: number;
  } | null>(null);
  const [summary, setSummary] =
    useState<SpotifyDeepDiveSummary>(initialSummary);
  const [showingPublicSnapshot, setShowingPublicSnapshot] = useState(true);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (workerWatchdogRef.current !== null) {
        window.clearTimeout(workerWatchdogRef.current);
      }
    },
    [],
  );

  function clearWorkerWatchdog() {
    if (workerWatchdogRef.current === null) return;
    window.clearTimeout(workerWatchdogRef.current);
    workerWatchdogRef.current = null;
  }

  function selectFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...selected];

    if (!next.length || next.length > SPOTIFY_MAX_JSON_FILES) {
      setError("Choose between 1 and 100 Spotify export files.");
      return;
    }
    if (next.some((file) => !/\.(zip|json)$/i.test(file.name))) {
      setError("Only Spotify ZIP and JSON files are accepted.");
      return;
    }
    if (
      next.reduce((total, file) => total + file.size, 0) >
      SPOTIFY_MAX_COMPRESSED_BYTES
    ) {
      setError(
        `The selected files exceed the ${SPOTIFY_MAX_COMPRESSED_MEGABYTES} MB local-processing limit.`,
      );
      return;
    }

    setError(null);
    setFiles(next);
  }

  async function processFiles() {
    if (!files.length) return;
    setProcessing(true);
    setError(null);
    setProgress({
      message: "Reading selected files…",
      completed: 0,
      total: files.length,
    });
    workerRef.current?.terminate();
    clearWorkerWatchdog();

    try {
      const payload = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          buffer: await file.arrayBuffer(),
        })),
      );
      const worker = new Worker(
        new URL("../workers/spotify.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      workerWatchdogRef.current = window.setTimeout(() => {
        if (workerRef.current !== worker) return;
        worker.terminate();
        workerRef.current = null;
        workerWatchdogRef.current = null;
        setError("Processing exceeded the two-minute safety limit.");
        setProcessing(false);
        setProgress(null);
      }, SPOTIFY_MAX_PROCESSING_MS);

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          setProgress(message);
          return;
        }
        if (message.type === "complete") {
          setSummary(message.summary);
          setShowingPublicSnapshot(false);
          setProcessing(false);
          setProgress(null);
          clearWorkerWatchdog();
          worker.terminate();
          workerRef.current = null;
          return;
        }

        setError(message.error);
        setProcessing(false);
        setProgress(null);
        clearWorkerWatchdog();
        worker.terminate();
        workerRef.current = null;
      };

      worker.onerror = () => {
        setError("Spotify processing stopped unexpectedly.");
        setProcessing(false);
        setProgress(null);
        clearWorkerWatchdog();
        worker.terminate();
        workerRef.current = null;
      };

      worker.postMessage(
        { type: "process", files: payload },
        payload.map((file) => file.buffer),
      );
    } catch (processingError) {
      workerRef.current?.terminate();
      workerRef.current = null;
      clearWorkerWatchdog();
      setError(
        processingError instanceof Error
          ? processingError.message
          : "Spotify processing failed.",
      );
      setProcessing(false);
      setProgress(null);
    }
  }

  function restorePublicSnapshot() {
    workerRef.current?.terminate();
    workerRef.current = null;
    clearWorkerWatchdog();
    setFiles([]);
    setSummary(initialSummary);
    setShowingPublicSnapshot(true);
    setProgress(null);
    setProcessing(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const averageMinutesPerPlay = summary.totalEvents
    ? summary.totalMilliseconds / summary.totalEvents / 60_000
    : 0;
  const activeMonths = summary.durationByMonth.filter(
    (month) => month.events > 0,
  ).length;
  const trips = summary.trips;
  const displayedTrips = [...trips]
    .sort(
      (left, right) =>
        right.days - left.days ||
        right.milliseconds - left.milliseconds ||
        right.events - left.events,
    )
    .slice(0, 5);

  return (
    <div className="spotify-workspace">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".zip,.json,application/zip,application/json"
        multiple
        onChange={(event) => selectFiles(event.target.files)}
      />

      {files.length || processing ? (
        <section className="upload-card upload-card-compact">
          <div className="upload-icon" aria-hidden="true">
            <span>↑</span>
          </div>
          <p className="eyebrow">Browser-local processing</p>
          <h2>
            {files.length
              ? `${files.length} file${files.length === 1 ? "" : "s"} ready`
              : "Analyze another export"}
          </h2>
          <p>
            Choose the Extended Streaming History ZIP or its JSON files. Raw
            events stay in this browser and are never uploaded or stored.
          </p>
          {files.length ? (
            <div className="selected-files">
              {files.slice(0, 3).map((file) => (
                <div key={`${file.name}-${file.size}`}>
                  <span>{file.name}</span>
                  <small>{formatBytes(file.size)}</small>
                </div>
              ))}
              {files.length > 3 ? (
                <small>+ {files.length - 3} more files</small>
              ) : null}
            </div>
          ) : null}
          {progress ? (
            <div className="processing-progress" role="status">
              <div>
                <span
                  style={{
                    width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>{progress.message}</small>
            </div>
          ) : null}
          {error ? <p className="upload-error">{error}</p> : null}
          <div className="upload-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={processing}
              onClick={() => inputRef.current?.click()}
            >
              {files.length
                ? "Choose different files"
                : "Choose Spotify export"}
            </button>
            {files.length ? (
              <button
                className="primary-button"
                type="button"
                disabled={processing}
                onClick={processFiles}
              >
                {processing ? "Processing…" : "Process locally"}
              </button>
            ) : null}
          </div>
          <span className="upload-note">
            ZIP or JSON · Up to {SPOTIFY_MAX_COMPRESSED_MEGABYTES} MB compressed
          </span>
        </section>
      ) : showingPublicSnapshot ? (
        <section className="upload-card spotify-upload-starter">
          <div className="upload-icon" aria-hidden="true">
            <span>↑</span>
          </div>
          <p className="eyebrow">Analyze your own history</p>
          <h2>Choose your Spotify export</h2>
          <p>
            Your ZIP or JSON files are processed entirely in this browser. Raw
            events are never uploaded or stored.
          </p>
          <div className="upload-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              Choose Spotify export
            </button>
          </div>
          <span className="upload-note">
            ZIP or JSON · Up to {SPOTIFY_MAX_COMPRESSED_MEGABYTES} MB compressed
          </span>
        </section>
      ) : null}

      {children}

      {!showingPublicSnapshot || (!files.length && !processing) ? (
        <details
          className="example-data-panel spotify-results-panel"
          open={!showingPublicSnapshot}
        >
          <summary>
            <span>
              {showingPublicSnapshot
                ? "Explore the example Spotify analysis"
                : "Your Spotify analysis"}
            </span>
            <small>
              {showingPublicSnapshot
                ? "Published, read-only example data"
                : "Processed locally in this browser"}
            </small>
          </summary>
          <section
            className="spotify-results example-data-content"
            aria-labelledby="spotify-results-heading"
          >
            {showingPublicSnapshot ? (
              <p className="snapshot-disclosure">
                Example data · The initial results are a published snapshot of
                the site owner&apos;s Spotify history. A visitor&apos;s upload
                replaces them only in that browser tab.
              </p>
            ) : null}

            <div className="spotify-results-heading">
              <div>
                <p className="eyebrow">History analyzed</p>
                <h2 id="spotify-results-heading">
                  {formatCoverage(summary.coverageStartedAt)} —{" "}
                  {formatCoverage(summary.coverageEndedAt)}
                </h2>
              </div>
              <div className="snapshot-actions">
                {!showingPublicSnapshot ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                  >
                    Analyze another export
                  </button>
                ) : null}
                {showingPublicSnapshot ? (
                  <span className="snapshot-date">Public example snapshot</span>
                ) : (
                  <button type="button" onClick={restorePublicSnapshot}>
                    Restore public snapshot
                  </button>
                )}
              </div>
            </div>

            {error ? (
              <p className="upload-error spotify-results-error">{error}</p>
            ) : null}

            <div className="spotify-summary-grid">
              <article>
                <span>Total listening time</span>
                <strong>
                  {(summary.totalMilliseconds / 3_600_000).toFixed(0)}h
                </strong>
                <small>Based on Spotify&apos;s exact playback duration</small>
              </article>
              <article>
                <span>Spotify plays analyzed</span>
                <strong>{summary.totalEvents.toLocaleString()}</strong>
                <small>Music events across the entire export</small>
              </article>
              <article>
                <span>Average time per play</span>
                <strong>{averageMinutesPerPlay.toFixed(1)}m</strong>
                <small>Exact listening time divided by every play event</small>
              </article>
              <article>
                <span>Active months</span>
                <strong>{activeMonths.toLocaleString()}</strong>
                <small>Months containing at least one music event</small>
              </article>
            </div>

            <article className="spotify-chart-panel spotify-history-panel">
              <div className="spotify-section-heading">
                <div>
                  <p className="eyebrow">Listening history</p>
                  <h3>Listening time by month</h3>
                </div>
                <p>
                  Exact listening time from Spotify, grouped by month and
                  rounded to hundredths of an hour.
                </p>
              </div>
              <SpotifyDurationChart points={summary.durationByMonth} />
            </article>

            <section className="spotify-analysis-section">
              <div className="spotify-section-heading">
                <div>
                  <p className="eyebrow">Listening patterns</p>
                  <h3>How and when you listened</h3>
                </div>
                <p>
                  These views use Spotify&apos;s exact playback duration and
                  playback context rather than scrobble counts alone.
                </p>
              </div>
              <div className="spotify-analysis-grid">
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>Your listening week</h4>
                    <p>Listening hours by weekday and hour, using UTC.</p>
                  </div>
                  <SpotifyWeekHeatmap points={summary.listeningByDayHour} />
                </article>
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>Listening sessions by length</h4>
                    <p>
                      Sessions use exact music time and end after a 30-minute
                      gap.
                    </p>
                  </div>
                  <SpotifySessionLengthChart bins={summary.sessionLengths} />
                </article>
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>Album engagement</h4>
                    <p>
                      More time moves right, more completed plays move up, and
                      larger circles contain more unique tracks.
                    </p>
                  </div>
                  <SpotifyAlbumEngagementChart
                    albums={summary.albumEngagement}
                  />
                </article>
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>Listening-time concentration</h4>
                    <p>
                      The share of all listening time claimed by your
                      most-played tracks.
                    </p>
                  </div>
                  <SpotifyConcentrationChart
                    points={summary.listeningConcentration}
                  />
                </article>
              </div>
            </section>

            <section className="spotify-analysis-section">
              <div className="spotify-section-heading">
                <div>
                  <p className="eyebrow">Attention and repetition</p>
                  <h3>What changed within and between listening sessions</h3>
                </div>
                <p>
                  Skip timing, repeat intervals, and session position reveal
                  behavior that play totals cannot show.
                </p>
              </div>
              <div className="spotify-analysis-grid">
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>When you skipped</h4>
                    <p>
                      Skipped plays grouped by how much audio you heard first.
                    </p>
                  </div>
                  <SpotifySkipTimingChart bins={summary.skipTiming} />
                </article>
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>Attention through a session</h4>
                    <p>
                      Completion and skip rates across sessions containing at
                      least three plays.
                    </p>
                  </div>
                  <SpotifySessionAttentionChart
                    phases={summary.sessionAttention}
                  />
                </article>
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>Choice, shuffle, and other starts</h4>
                    <p>
                      Direct selections take priority; remaining plays are split
                      by whether shuffle was active.
                    </p>
                  </div>
                  <SpotifyListeningModeChart modes={summary.listeningModes} />
                </article>
                <article className="spotify-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>How quickly songs returned</h4>
                    <p>Time between consecutive plays of the same song.</p>
                  </div>
                  <SpotifyReplayDelayChart bins={summary.replayDelays} />
                </article>
                <article className="spotify-chart-panel spotify-wide-chart-panel">
                  <div className="spotify-chart-copy">
                    <h4>Session length versus variety</h4>
                    <p>
                      Average session minutes and unique artists; circle size
                      represents how many sessions belong to each group.
                    </p>
                  </div>
                  <SpotifySessionVarietyChart points={summary.sessionVariety} />
                </article>
              </div>
            </section>

            <section className="spotify-behavior-section">
              <div className="spotify-section-heading">
                <div>
                  <p className="eyebrow">Playback behavior</p>
                  <h3>What happened after a track started</h3>
                </div>
                <p>
                  Each measure has its own denominator and is shown separately
                  rather than combined into an artificial score.
                </p>
              </div>
              <div className="spotify-behavior-grid">
                <SpotifyBehaviorStat
                  label="Finished"
                  value={summary.completionPercentage}
                  description="Play events that ended because the track completed"
                  tone="green"
                />
                <SpotifyBehaviorStat
                  label="Skipped"
                  value={summary.skipPercentage}
                  description="Play events Spotify explicitly marked as skipped"
                  tone="violet"
                />
                <SpotifyBehaviorStat
                  label="On shuffle"
                  value={summary.shufflePercentage}
                  description="Play events started while shuffle was enabled"
                  tone="blue"
                />
                <SpotifyBehaviorStat
                  label="Offline"
                  value={summary.offlinePercentage}
                  description="Share of total listening time recorded offline"
                  tone="amber"
                />
                <SpotifyBehaviorStat
                  label="Private session"
                  value={summary.incognitoPercentage}
                  description="Play events recorded with Private Session enabled"
                  tone="muted"
                />
              </div>
            </section>

            {displayedTrips.length && summary.usualCountry ? (
              <section className="spotify-trip-section">
                <div className="spotify-section-heading">
                  <div>
                    <p className="eyebrow">Travel patterns</p>
                    <h3>Trips inferred from where you listened</h3>
                  </div>
                  <p>
                    Each country outside your most common country counts as one
                    inferred trip, combining all plays from that country. Time
                    gaps and play count do not affect the grouping. Spotify
                    records connection country, not precise location.
                    {trips.length > 5
                      ? " The five longest trips are shown."
                      : ""}
                  </p>
                </div>
                <div className="spotify-trip-detail-grid">
                  {displayedTrips.map((trip) => (
                    <article
                      key={`${trip.countries[0]?.label}-${trip.startedAt}`}
                    >
                      <header>
                        <div>
                          <span>Trip location</span>
                          <h4>{tripLocationLabel(trip)}</h4>
                        </div>
                        <small>{tripDateRange(trip)}</small>
                      </header>
                      <dl>
                        <div>
                          <dt>Music listened</dt>
                          <dd>{formatListeningDuration(trip.milliseconds)}</dd>
                        </div>
                        <div className="spotify-trip-song">
                          <dt>Most-listened song</dt>
                          <dd>
                            {trip.topTrack ? (
                              <>
                                <strong>{trip.topTrack.track}</strong>
                                <small>{trip.topTrack.artist}</small>
                              </>
                            ) : (
                              "Not available"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Music variety</dt>
                          <dd>
                            {trip.uniqueTracks.toLocaleString()} unique track
                            {trip.uniqueTracks === 1 ? "" : "s"}
                            <small>
                              {trip.events.toLocaleString()} total play
                              {trip.events === 1 ? "" : "s"}
                            </small>
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="spotify-insight-section">
              <div className="spotify-section-heading">
                <div>
                  <p className="eyebrow">What held your attention</p>
                  <h3>Deliberate choices and durable favorites</h3>
                </div>
              </div>
              <div className="spotify-insight-grid">
                <SpotifyTrackRanking
                  title="Most listening time"
                  description="Total exact playback time, not just the number of plays"
                  insights={summary.topListeningTime}
                  unit="hours"
                />
                <SpotifyTrackRanking
                  title="Chosen most deliberately"
                  description="Most starts from selecting a row or pressing Play"
                  insights={summary.directChoiceFavorites}
                  unit="choices"
                />
                <SpotifyTrackRanking
                  title="Always finished"
                  description="Completed on every play, with at least 10 plays"
                  insights={summary.mostReliableCompletion}
                  unit="percent"
                />
                <article className="spotify-ranking-card">
                  <span className="spotify-ranking-label">
                    Albums with the most listening time
                  </span>
                  <p className="spotify-ranking-description">
                    Ranked by exact playback duration across every track
                  </p>
                  <ol className="spotify-ranking-list spotify-aggregate-ranking">
                    {summary.topAlbumsByTime.map((album, index) => (
                      <li key={album.label}>
                        <b>{index + 1}</b>
                        <div>
                          <strong title={album.label}>{album.label}</strong>
                          <small>{album.events.toLocaleString()} plays</small>
                        </div>
                        <em>{(album.milliseconds / 3_600_000).toFixed(1)}h</em>
                      </li>
                    ))}
                  </ol>
                </article>
              </div>
            </section>

            <section className="spotify-insight-section">
              <div className="spotify-section-heading">
                <div>
                  <p className="eyebrow">Where attention broke</p>
                  <h3>Skipping, friction, and mixed signals</h3>
                </div>
              </div>
              <div className="spotify-insight-grid">
                <SpotifyTrackRanking
                  title="Skipped most often"
                  description="Total number of skips recorded for each track"
                  insights={summary.mostSkipped}
                  unit="skips"
                />
                <SpotifyTrackRanking
                  title="Fastest skips"
                  description="Lowest average time before a skip, with at least five skips"
                  insights={summary.quickestSkips}
                  unit="seconds"
                />
                <SpotifyTrackRanking
                  title="Always skipped"
                  description="Skipped on every play, with at least 10 plays"
                  insights={summary.highestSkipRate}
                  unit="percent"
                />
                <SpotifyTrackRanking
                  title="Hurt most by shuffle"
                  description="How much more often each track was skipped on shuffle"
                  insights={summary.shuffleCasualty}
                  unit="percent"
                />
                <SpotifyTrackRanking
                  title="Most mixed signals"
                  description="Strongest balance between skips and completed plays"
                  insights={summary.loveHateTrack}
                  unit="percent"
                />
                <SpotifyTrackRanking
                  title="Played most on shuffle"
                  description="Tracks that appeared most often while shuffle was enabled"
                  insights={summary.mostPlayedOnShuffle}
                  unit="shuffle-plays"
                />
              </div>
            </section>

            <div className="spotify-breakdowns">
              <article className="spotify-device-breakdown">
                <h3>Listening time by device</h3>
                {summary.platforms.map((platform) => (
                  <div key={platform.label}>
                    <span>{platform.label}</span>
                    <strong>
                      {(platform.milliseconds / 3_600_000).toFixed(1)}h
                    </strong>
                  </div>
                ))}
              </article>
              <article>
                <h3>Listening time by country</h3>
                {summary.countries.slice(0, 6).map((country) => (
                  <div key={country.label}>
                    <span>{countryLabel(country.label)}</span>
                    <strong>
                      {(country.milliseconds / 3_600_000).toFixed(1)}h
                    </strong>
                  </div>
                ))}
              </article>
              <article>
                <h3>How songs started</h3>
                {summary.reasonStarts.slice(0, 6).map((reason) => (
                  <div key={reason.label}>
                    <span>{playbackReasonLabel(reason.label)}</span>
                    <strong>{reason.events.toLocaleString()}</strong>
                  </div>
                ))}
              </article>
              <article>
                <h3>How songs ended</h3>
                {summary.reasonEnds.slice(0, 6).map((reason) => (
                  <div key={reason.label}>
                    <span>{playbackReasonLabel(reason.label)}</span>
                    <strong>{reason.events.toLocaleString()}</strong>
                  </div>
                ))}
              </article>
            </div>
          </section>
        </details>
      ) : null}
    </div>
  );
}
