import { describe, expect, it } from "vitest";

import {
  spotifyDeepDiveSummarySchema,
  spotifyDeviceLabel,
} from "@/lib/spotify-deep-dive";
import { processSpotifyFiles } from "@/workers/spotify.worker";

function event(index: number, overrides: Record<string, unknown> = {}) {
  return {
    ts: new Date(
      Date.UTC(2025, index < 15 ? 0 : 1, (index % 14) + 1),
    ).toISOString(),
    platform: index % 2 ? "Android" : "Web Player",
    ms_played: 180_000,
    master_metadata_track_name: index < 20 ? "Track A" : "Track B",
    master_metadata_album_artist_name: "Artist",
    master_metadata_album_album_name: "Album",
    reason_start: "trackdone",
    reason_end: index < 12 ? "fwdbtn" : "trackdone",
    shuffle: index % 2 === 0,
    skipped: index < 12,
    offline: index < 5,
    ...overrides,
  };
}

describe("Spotify Deep Dive worker analytics", () => {
  it("calculates chart-ready summaries without retaining raw events", () => {
    const events = Array.from({ length: 30 }, (_, index) => event(index));
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([
      { name: "Streaming_History_Audio_2025.json", buffer },
    ]);

    expect(spotifyDeepDiveSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.totalEvents).toBe(30);
    expect(summary.totalMilliseconds).toBe(5_400_000);
    expect(summary.offlinePercentage).toBeCloseTo(16.666, 2);
    expect(summary.mostSkipped[0]).toMatchObject({
      track: "Track A",
      value: 12,
    });
    expect(summary.mostSkipped).toHaveLength(1);
    expect(summary.topListeningTime).toHaveLength(2);
    expect(summary.topAlbumsByTime[0]).toMatchObject({
      label: "Album — Artist",
      events: 30,
    });
    expect(summary.shufflePercentage).toBe(50);
    expect(summary.skipPercentage).toBe(40);
    expect(summary.completionPercentage).toBe(60);
    expect(summary.platforms).toHaveLength(2);
    expect(summary.durationByMonth).toHaveLength(2);
    expect(summary.listeningByDayHour).toHaveLength(168);
    expect(
      summary.listeningByDayHour.reduce(
        (total, point) => total + point.events,
        0,
      ),
    ).toBe(30);
    expect(summary.sessionLengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Under 15m", sessions: 28 }),
      ]),
    );
    expect(summary.albumEngagement[0]).toMatchObject({
      album: "Album",
      events: 30,
      completedEvents: 18,
      uniqueTracks: 2,
    });
    expect(summary.listeningConcentration.map((point) => point.rank)).toEqual([
      10, 25, 50, 100,
    ]);
    expect(
      summary.skipTiming.reduce((total, bin) => total + bin.events, 0),
    ).toBe(12);
    expect(
      summary.listeningModes.reduce((total, mode) => total + mode.events, 0),
    ).toBe(30);
    expect(
      summary.replayDelays.reduce((total, bin) => total + bin.events, 0),
    ).toBe(28);
    expect(summary.sessionVariety).toHaveLength(6);
  });

  it("measures attention and variety across a multi-play session", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      event(index, {
        ts: new Date(Date.UTC(2025, 0, 1, 12, index * 5)).toISOString(),
        skipped: index < 2,
        reason_end: index >= 4 ? "trackdone" : "fwdbtn",
      }),
    );
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([{ name: "history.json", buffer }]);

    expect(summary.sessionAttention).toEqual([
      {
        label: "Opening third",
        events: 2,
        skippedEvents: 2,
        completedEvents: 0,
      },
      {
        label: "Middle third",
        events: 2,
        skippedEvents: 0,
        completedEvents: 0,
      },
      {
        label: "Closing third",
        events: 2,
        skippedEvents: 0,
        completedEvents: 2,
      },
    ]);
    expect(summary.sessionVariety).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "15–30m",
          sessions: 1,
          averageArtists: 1,
          averageTracks: 1,
          averagePlays: 6,
        }),
      ]),
    );
  });

  it("excludes podcast and malformed events", () => {
    const events = [
      event(0),
      event(1, { episode_name: "Podcast", master_metadata_track_name: null }),
      { ts: "not-a-date", ms_played: 100 },
    ];
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([{ name: "history.json", buffer }]);

    expect(summary.totalEvents).toBe(1);
  });

  it("rejects unexpected file types", () => {
    expect(() =>
      processSpotifyFiles([
        { name: "history.txt", buffer: new ArrayBuffer(1) },
      ]),
    ).toThrow("Only ZIP and JSON files are accepted");
  });

  it("accepts long-lived exports with more than 100 platform labels", () => {
    const events = Array.from({ length: 103 }, (_, index) =>
      event(index, { platform: `Platform ${index + 1}` }),
    );
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([{ name: "history.json", buffer }]);

    expect(summary.platforms).toHaveLength(103);
    expect(spotifyDeepDiveSummarySchema.safeParse(summary).success).toBe(true);
  });

  it("groups operating-system versions by the actual device", () => {
    expect(spotifyDeviceLabel("iOS 14.8.1 (iPhone12,3)")).toBe("iPhone 11 Pro");
    expect(spotifyDeviceLabel("iOS 15.6 (iPhone12,3)")).toBe("iPhone 11 Pro");
    expect(spotifyDeviceLabel("Windows 10 (10.0.19044; x64; AppX)")).toBe(
      "Windows PC",
    );
    expect(
      spotifyDeviceLabel(
        "Partner roku_tv roku;3810rw;4916bf2fd1c54ff2bace038314d21f39;;tpapi",
      ),
    ).toBe("Roku 3810RW");
    expect(spotifyDeviceLabel("Partner amazon_salmon Amazon;Echo_Dot;;")).toBe(
      "Amazon Echo Dot",
    );
    expect(spotifyDeviceLabel("ios")).toBe(
      "iPhone or iPad (model unavailable)",
    );
  });

  it("combines multiple OS versions into one device summary row", () => {
    const events = [
      event(0, { platform: "iOS 13.3.1 (iPhone12,3)" }),
      event(1, { platform: "iOS 15.6 (iPhone12,3)" }),
    ];
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([{ name: "history.json", buffer }]);

    expect(summary.platforms).toEqual([
      {
        label: "iPhone 11 Pro",
        events: 2,
        milliseconds: 360_000,
      },
    ]);
  });

  it("groups every play from a foreign country into one inferred trip", () => {
    const homeEvents = Array.from({ length: 12 }, (_, index) =>
      event(index, {
        ts: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
        conn_country: "US",
      }),
    );
    const canadaEvents = Array.from({ length: 6 }, (_, index) =>
      event(index, {
        ts: new Date(Date.UTC(2025, 1, 1 + index * 20)).toISOString(),
        conn_country: "CA",
        master_metadata_track_name: index < 4 ? "Travel Song" : "Other Song",
      }),
    );
    const singleMexicoPlay = event(0, {
      ts: new Date(Date.UTC(2025, 6, 1)).toISOString(),
      conn_country: "MX",
    });
    const returnCanadaPlay = event(0, {
      ts: new Date(Date.UTC(2025, 5, 10)).toISOString(),
      conn_country: "CA",
      master_metadata_track_name: "Other Song",
    });
    const unknownLocationRun = Array.from({ length: 8 }, (_, index) =>
      event(index, {
        ts: new Date(Date.UTC(2025, 3, index + 1)).toISOString(),
        conn_country: "ZZ",
      }),
    );
    const events = [
      ...homeEvents,
      ...canadaEvents,
      event(0, {
        ts: new Date(Date.UTC(2025, 5, 1)).toISOString(),
        conn_country: "US",
      }),
      returnCanadaPlay,
      singleMexicoPlay,
      ...unknownLocationRun,
      event(0, {
        ts: new Date(Date.UTC(2025, 8, 1)).toISOString(),
        conn_country: "--",
      }),
    ];
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([{ name: "history.json", buffer }]);

    expect(summary.usualCountry).toBe("US");
    expect(summary.trips).toHaveLength(2);
    expect(summary.trips[0]).toMatchObject({
      days: 130,
      events: 7,
      uniqueTracks: 2,
      countries: [{ label: "CA", events: 7 }],
      topTrack: { track: "Travel Song", events: 4 },
    });
    expect(summary.trips[1]).toMatchObject({
      days: 1,
      events: 1,
      countries: [{ label: "MX", events: 1 }],
    });
    expect(summary.countries).toContainEqual({
      label: "Unknown country",
      events: 9,
      milliseconds: 1_620_000,
    });
  });

  it("returns five entries for Spotify rankings that use the standard limit", () => {
    const events = Array.from({ length: 7 }, (_, index) =>
      event(index, {
        master_metadata_track_name: `Track ${index + 1}`,
        master_metadata_album_album_name: `Album ${index + 1}`,
        skipped: true,
        shuffle: true,
      }),
    );
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([{ name: "history.json", buffer }]);

    expect(summary.mostSkipped).toHaveLength(5);
    expect(summary.topListeningTime).toHaveLength(5);
    expect(summary.mostPlayedOnShuffle).toHaveLength(5);
    expect(summary.topAlbumsByTime).toHaveLength(5);
  });

  it("only includes perfect skip and completion rates, up to ten tracks", () => {
    const events = Array.from({ length: 22 }, (_, trackIndex) =>
      Array.from({ length: 10 }, (_, playIndex) =>
        event(playIndex, {
          master_metadata_track_name: `Track ${trackIndex + 1}`,
          skipped: trackIndex < 11 || (trackIndex === 21 && playIndex === 0),
          reason_end:
            trackIndex >= 11 && trackIndex < 21 ? "trackdone" : "fwdbtn",
        }),
      ),
    ).flat();
    const encoded = new TextEncoder().encode(JSON.stringify(events));
    const buffer = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const summary = processSpotifyFiles([{ name: "history.json", buffer }]);

    expect(summary.highestSkipRate).toHaveLength(10);
    expect(summary.highestSkipRate.every((track) => track.value === 100)).toBe(
      true,
    );
    expect(summary.mostReliableCompletion).toHaveLength(10);
    expect(
      summary.mostReliableCompletion.every((track) => track.value === 100),
    ).toBe(true);
  });
});
