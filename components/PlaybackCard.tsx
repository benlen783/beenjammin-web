import type { RecentPlay } from "@/lib/dashboard-types";
import type { LastFmNowPlaying } from "@/lib/lastfm";

function relativePlayTime(value: string) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );

  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function sourceLabel(source: string) {
  if (source === "lastfm") return "Last.fm";
  return source;
}

export function PlaybackCard({
  nowPlaying,
  recentPlay,
}: {
  nowPlaying: LastFmNowPlaying | null;
  recentPlay: RecentPlay | null;
}) {
  const playback = nowPlaying ?? recentPlay;
  if (!playback) return null;

  const isLive = nowPlaying !== null;

  return (
    <section
      className={`playback-card${isLive ? " playback-live" : ""}`}
      aria-label={isLive ? "Currently playing" : "Last played"}
      aria-live="polite"
    >
      <div className="playback-visual" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="playback-copy">
        <p className="eyebrow">{isLive ? "Now playing" : "Last played"}</p>
        <h2>{playback.track}</h2>
        <p>
          <strong>{playback.artist}</strong>
          {playback.album ? <span> · {playback.album}</span> : null}
        </p>
      </div>

      <div className="playback-status">
        <span className="playback-status-dot" />
        {isLive
          ? "Live on Last.fm"
          : `${relativePlayTime(recentPlay?.playedAt ?? "")} · ${sourceLabel(recentPlay?.source ?? "")}`}
      </div>
    </section>
  );
}
