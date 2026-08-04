import type { Metadata } from "next";

import { SpotifyUpload } from "@/components/SpotifyUpload";
import { getPublicSpotifySnapshot } from "@/lib/spotify-snapshot";

export const metadata: Metadata = {
  title: "Spotify Listening History Analyzer",
  description:
    "Analyze your complete Spotify streaming history for skips, listening time, shuffle behavior, playback patterns, top artists, albums, and tracks. Files stay in your browser.",
  alternates: {
    canonical: "/spotify-deep-dive",
  },
};

export default function SpotifyDeepDivePage() {
  const snapshot = getPublicSpotifySnapshot();

  return (
    <main className="app-shell deep-dive-page">
      <section className="deep-dive-intro">
        <p className="eyebrow">Spotify Deep Dive</p>
        <h1>The details scrobbles leave behind.</h1>
        <p>
          Spotify&apos;s export is more detailed than scrobble history alone,
          revealing skips, shuffle, completion, exact playback duration,
          platforms, and playback reasons across your complete Extended
          Streaming History.
        </p>
        <div className="privacy-pill">
          <span>⌁</span> Files remain on this device
        </div>
      </section>

      <div className="deep-dive-grid">
        <SpotifyUpload initialSummary={snapshot.summary}>
          <section
            className="spotify-export-guide"
            aria-labelledby="spotify-export-guide-heading"
          >
            <div className="spotify-export-guide-copy">
              <p className="eyebrow">Get your Spotify files</p>
              <h2 id="spotify-export-guide-heading">
                Request your Extended Streaming History
              </h2>
              <p>
                This is the lifetime-history package—not the standard
                account-data download, which includes only recent streaming
                history.
              </p>
              <a
                href="https://www.spotify.com/account/privacy/"
                target="_blank"
                rel="noreferrer"
              >
                Open Spotify Account Privacy <span aria-hidden="true">↗</span>
              </a>
            </div>
            <ol>
              <li>
                Sign in to Spotify and find <strong>Download your data</strong>.
              </li>
              <li>
                Select <strong>Extended Streaming History</strong> and submit
                the request.
              </li>
              <li>
                When Spotify emails that it is ready, download the provided ZIP
                file.
              </li>
              <li>
                Return here and choose that ZIP. You do not need to extract it
                first.
              </li>
            </ol>
            <p className="spotify-export-guide-note">
              Spotify describes the package and its JSON fields in{" "}
              <a
                href="https://support.spotify.com/article/understanding-your-data/"
                target="_blank"
                rel="noreferrer"
              >
                Understanding your data
              </a>
              .
            </p>
          </section>
        </SpotifyUpload>
      </div>
    </main>
  );
}
