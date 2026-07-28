import { z } from "zod";

import { LASTFM_MAX_PUBLIC_PAGES, LASTFM_PAGE_SIZE } from "@/lib/config";

const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_ATTEMPTS = 4;

const textValueSchema = z
  .union([z.string(), z.object({ "#text": z.string() }).passthrough()])
  .transform((value) => (typeof value === "string" ? value : value["#text"]));

const recentTrackSchema = z
  .object({
    name: z.string(),
    artist: textValueSchema,
    album: textValueSchema.optional(),
    date: z
      .object({ uts: z.string().regex(/^\d+$/) })
      .passthrough()
      .optional(),
    "@attr": z
      .object({ nowplaying: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const recentTracksResponseSchema = z
  .object({
    recenttracks: z
      .object({
        track: z.array(recentTrackSchema).default([]),
        "@attr": z
          .object({
            page: z.string(),
            total: z.string(),
            totalPages: z.string(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const lastFmErrorSchema = z
  .object({ error: z.number(), message: z.string() })
  .passthrough();

export type LastFmNowPlaying = {
  artist: string;
  album: string | null;
  track: string;
};

export type LastFmPublicHistoryPage = {
  plays: Array<{
    artist: string;
    album: string | null;
    track: string;
    playedAt: string;
  }>;
  nowPlaying: LastFmNowPlaying | null;
  page: number;
  totalPages: number;
  total: number;
  truncated: boolean;
};

class LastFmRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LastFmRequestError";
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Last.fm returned an invalid ${label}.`);
  }
  return parsed;
}

function isRetryableError(code: number) {
  return code === 11 || code === 16 || code === 29;
}

export function buildLastFmUserAgent(deploymentHost?: string) {
  const host = deploymentHost?.trim().replace(/^https?:\/\//, "");
  return host
    ? `BeenJammin-Web/0.1 (+https://${host})`
    : "BeenJammin-Web/0.1 (local development)";
}

async function fetchRecentTracksPage(
  options: { apiKey: string; username: string; userAgent: string },
  page: number,
) {
  const params = new URLSearchParams({
    method: "user.getrecenttracks",
    user: options.username,
    api_key: options.apiKey,
    format: "json",
    limit: String(LASTFM_PAGE_SIZE),
    page: String(page),
  });
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${LASTFM_ENDPOINT}?${params}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": options.userAgent,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body: unknown = await response.json();
      const apiError = lastFmErrorSchema.safeParse(body);

      if (apiError.success) {
        const error = new LastFmRequestError(
          `Last.fm error ${apiError.data.error}: ${apiError.data.message}`,
          isRetryableError(apiError.data.error),
        );
        if (!error.retryable) throw error;
        lastError = error;
      } else if (!response.ok) {
        const error = new LastFmRequestError(
          `Last.fm HTTP error ${response.status}.`,
          response.status === 429 || response.status >= 500,
        );
        if (!error.retryable) throw error;
        lastError = error;
      } else {
        return recentTracksResponseSchema.parse(body);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error("Last.fm returned an unexpected response shape.", {
          cause: error,
        });
      }
      if (error instanceof LastFmRequestError && !error.retryable) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < MAX_REQUEST_ATTEMPTS) {
      await sleep(1_000 * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error("Last.fm request failed.");
}

export async function fetchLastFmPublicHistoryPage(options: {
  apiKey: string;
  username: string;
  page: number;
  userAgent: string;
}): Promise<LastFmPublicHistoryPage> {
  const response = await fetchRecentTracksPage(options, options.page);
  const attributes = response.recenttracks["@attr"];
  const nowPlayingInput = response.recenttracks.track.find(
    (track) => track["@attr"]?.nowplaying === "true",
  );
  const nowPlaying = nowPlayingInput
    ? {
        artist: nowPlayingInput.artist.trim(),
        album: nowPlayingInput.album?.trim() || null,
        track: nowPlayingInput.name.trim(),
      }
    : null;

  const upstreamTotalPages = parsePositiveInteger(
    attributes.totalPages,
    "page count",
  );

  return {
    plays: response.recenttracks.track.flatMap((input) => {
      if (input["@attr"]?.nowplaying === "true" || !input.date) return [];
      const artist = input.artist.trim();
      const track = input.name.trim();
      const playedAt = new Date(
        parsePositiveInteger(input.date.uts, "scrobble timestamp") * 1_000,
      );
      if (!artist || !track || Number.isNaN(playedAt.getTime())) return [];
      return [
        {
          artist,
          album: input.album?.trim() || null,
          track,
          playedAt: playedAt.toISOString(),
        },
      ];
    }),
    nowPlaying: nowPlaying?.artist && nowPlaying.track ? nowPlaying : null,
    page: parsePositiveInteger(attributes.page, "page number"),
    totalPages: Math.min(upstreamTotalPages, LASTFM_MAX_PUBLIC_PAGES),
    total: parsePositiveInteger(attributes.total, "scrobble count"),
    truncated: upstreamTotalPages > LASTFM_MAX_PUBLIC_PAGES,
  };
}
