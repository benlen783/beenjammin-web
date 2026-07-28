import { describe, expect, it } from "vitest";

import { buildPublicDashboardData } from "@/lib/public-dashboard";

describe("public Last.fm dashboard", () => {
  it("builds dashboard data without database-backed records", () => {
    const history = {
      username: "listener",
      nowPlaying: null,
      cachedAt: "2026-07-14T12:00:00.000Z",
      plays: [
        {
          artist: "Artist A",
          album: "Album A",
          track: "Favorite",
          playedAt: "2026-07-12T12:00:00.000Z",
        },
        {
          artist: "Artist A",
          album: "Album A",
          track: "Favorite",
          playedAt: "2026-07-12T12:04:00.000Z",
        },
        {
          artist: "Artist B",
          album: "Album B",
          track: "Another Song",
          playedAt: "2026-07-13T12:00:00.000Z",
        },
      ],
    };

    const dashboard = buildPublicDashboardData(history, "all-time");

    expect(dashboard.totals).toEqual({
      plays: 3,
      artists: 2,
      tracks: 2,
      sessions: 2,
    });
    expect(dashboard.lifetime.mostPlayedTrack).toMatchObject({
      track: "Favorite",
      artist: "Artist A",
      plays: 2,
    });
    expect(dashboard.topArtists[0]).toEqual({ name: "Artist A", plays: 2 });
    expect(dashboard.recentPlay?.source).toBe("lastfm");
  });
});
