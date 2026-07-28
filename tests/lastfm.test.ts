import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LASTFM_MAX_PUBLIC_PAGES,
  LASTFM_MAX_PUBLIC_SCROBBLES,
  LASTFM_PAGE_SIZE,
} from "@/lib/config";
import {
  buildLastFmUserAgent,
  fetchLastFmPublicHistoryPage,
} from "@/lib/lastfm";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public Last.fm client", () => {
  it("identifies deployed requests with the production host", () => {
    expect(buildLastFmUserAgent("beenjammin.example")).toBe(
      "BeenJammin-Web/0.1 (+https://beenjammin.example)",
    );
    expect(buildLastFmUserAgent("https://beenjammin.example")).toBe(
      "BeenJammin-Web/0.1 (+https://beenjammin.example)",
    );
  });

  it("caps large histories and sends the identifying user agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          recenttracks: {
            track: [
              {
                name: "Current Song",
                artist: { "#text": "Current Artist" },
                album: { "#text": "Current Album" },
                "@attr": { nowplaying: "true" },
              },
              {
                name: "Finished Song",
                artist: { "#text": "Finished Artist" },
                album: { "#text": "Finished Album" },
                date: { uts: "1785106800" },
              },
            ],
            "@attr": {
              page: "1",
              total: "140000",
              totalPages: "700",
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLastFmPublicHistoryPage({
      apiKey: "server-secret",
      username: "listener",
      page: 1,
      userAgent: "BeenJammin-Web/0.1 (+https://beenjammin.example)",
    });

    expect(result).toMatchObject({
      page: 1,
      totalPages: LASTFM_MAX_PUBLIC_PAGES,
      total: 140000,
      truncated: true,
      nowPlaying: {
        artist: "Current Artist",
        album: "Current Album",
        track: "Current Song",
      },
    });
    expect(result.plays).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Accept: "application/json",
        "User-Agent": "BeenJammin-Web/0.1 (+https://beenjammin.example)",
      },
    });
    expect(LASTFM_MAX_PUBLIC_SCROBBLES).toBe(
      LASTFM_PAGE_SIZE * LASTFM_MAX_PUBLIC_PAGES,
    );
  });

  it("does not retry a missing user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 6, message: "User not found" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLastFmPublicHistoryPage({
        apiKey: "server-secret",
        username: "missing",
        page: 1,
        userAgent: "BeenJammin-Web/0.1 (local development)",
      }),
    ).rejects.toThrow("Last.fm error 6: User not found");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
