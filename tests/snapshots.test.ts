import { describe, expect, it } from "vitest";

import dashboardJson from "@/content/analytics/dashboard.json";
import spotifyJson from "@/content/analytics/spotify.json";
import {
  dashboardSnapshotSchema,
  getDashboardSnapshot,
} from "@/lib/dashboard-snapshot";
import { DASHBOARD_RANGES } from "@/lib/dashboard-types";
import { publicSpotifySnapshotSchema } from "@/lib/spotify-snapshot";

function allKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, keys);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      allKeys(item, keys);
    }
  }
  return keys;
}

describe("public analytics snapshots", () => {
  it("validates every required Dashboard range", () => {
    expect(() => dashboardSnapshotSchema.parse(dashboardJson)).not.toThrow();
    expect(Object.keys(dashboardJson.ranges)).toEqual(
      DASHBOARD_RANGES.map(({ key }) => key),
    );

    for (const { key } of DASHBOARD_RANGES) {
      expect(getDashboardSnapshot(key).totals.plays).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects incomplete Dashboard snapshots", () => {
    const invalid = structuredClone(dashboardJson);
    delete (invalid.ranges as Partial<typeof invalid.ranges>)["all-time"];
    expect(dashboardSnapshotSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates and rejects incomplete Spotify snapshots", () => {
    expect(() => publicSpotifySnapshotSchema.parse(spotifyJson)).not.toThrow();
    expect(
      publicSpotifySnapshotSchema.safeParse({
        ...spotifyJson,
        summary: { totalEvents: spotifyJson.summary.totalEvents },
      }).success,
    ).toBe(false);
  });

  it("contains no raw event, database, or credential fields", () => {
    const keys = new Set([...allKeys(dashboardJson), ...allKeys(spotifyJson)]);
    const forbidden = [
      "DATABASE_URL",
      "apiKey",
      "id",
      "ip_addr",
      "sourceFingerprint",
      "spotify_track_uri",
      "topPhysicalAlbums",
      "ts",
    ];

    for (const key of forbidden) expect(keys.has(key)).toBe(false);
  });
});
