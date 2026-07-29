import { describe, expect, it } from "vitest";

import { buildPublicDashboardData } from "@/lib/public-dashboard";

describe("public Last.fm dashboard", () => {
  it("builds dashboard data without database-backed records", () => {
    const history = {
      username: "listener",
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

  it("includes both endpoints of a custom date range", () => {
    const history = {
      username: "listener",
      cachedAt: "2026-07-14T12:00:00.000Z",
      plays: [
        {
          artist: "Before",
          album: null,
          track: "Before",
          playedAt: "2026-07-09T18:00:00.000Z",
        },
        {
          artist: "Starting Artist",
          album: null,
          track: "Start",
          playedAt: "2026-07-10T18:00:00.000Z",
        },
        {
          artist: "Ending Artist",
          album: null,
          track: "End",
          playedAt: "2026-07-12T18:00:00.000Z",
        },
        {
          artist: "After",
          album: null,
          track: "After",
          playedAt: "2026-07-13T18:00:00.000Z",
        },
      ],
    };

    const dashboard = buildPublicDashboardData(history, {
      startDate: "2026-07-10",
      endDate: "2026-07-12",
    });

    expect(dashboard.totals).toEqual({
      plays: 2,
      artists: 2,
      tracks: 2,
      sessions: 2,
    });
    expect(dashboard.timelineBucket).toBe("day");
    expect(dashboard.topArtists.map((artist) => artist.name).sort()).toEqual([
      "Ending Artist",
      "Starting Artist",
    ]);
  });
});
