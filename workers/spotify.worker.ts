/// <reference lib="webworker" />

import { strFromU8, unzipSync } from "fflate";

import {
  SPOTIFY_DEEP_DIVE_SUMMARY_VERSION,
  spotifyDeviceLabel,
  type SpotifyDeepDiveSummary,
} from "@/lib/spotify-deep-dive";

const MAX_COMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024 * 1024;
const MAX_FILES = 100;
const MAX_EVENTS = 10_000_000;
const MAX_PROCESSING_MS = 120_000;

type InputFile = { name: string; buffer: ArrayBuffer };
type ProcessMessage = { type: "process"; files: InputFile[] };

type EventAggregate = { events: number; milliseconds: number };
type TrackAggregate = EventAggregate & {
  track: string;
  artist: string;
  skipped: number;
  completed: number;
  shuffleEvents: number;
  shuffleSkipped: number;
  directEvents: number;
  directSkipped: number;
  skippedMilliseconds: number;
  directChoiceEvents: number;
};

type AlbumAggregate = EventAggregate & {
  album: string;
  artist: string;
  completedEvents: number;
  tracks: Set<string>;
};

type SpotifyEvent = {
  ts?: unknown;
  platform?: unknown;
  ms_played?: unknown;
  master_metadata_track_name?: unknown;
  master_metadata_album_artist_name?: unknown;
  master_metadata_album_album_name?: unknown;
  episode_name?: unknown;
  episode_show_name?: unknown;
  reason_start?: unknown;
  reason_end?: unknown;
  shuffle?: unknown;
  skipped?: unknown;
  offline?: unknown;
  incognito_mode?: unknown;
  conn_country?: unknown;
};

type LocatedEvent = {
  playedAt: number;
  country: string;
  milliseconds: number;
  track: string;
  artist: string;
  skipped: boolean;
  completed: boolean;
  shuffled: boolean;
  directChoice: boolean;
};

const workerScope: DedicatedWorkerGlobalScope | null =
  typeof self === "undefined"
    ? null
    : (self as unknown as DedicatedWorkerGlobalScope);

function postProgress(message: string, completed: number, total: number) {
  workerScope?.postMessage({ type: "progress", message, completed, total });
}

function normalizedKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function incrementAggregate(
  map: Map<string, EventAggregate>,
  label: string,
  milliseconds: number,
) {
  const current = map.get(label) ?? { events: 0, milliseconds: 0 };
  current.events += 1;
  current.milliseconds += milliseconds;
  map.set(label, current);
}

function rankedAggregates(map: Map<string, EventAggregate>) {
  return [...map]
    .map(([label, value]) => ({ label, ...value }))
    .sort(
      (left, right) =>
        right.milliseconds - left.milliseconds || right.events - left.events,
    );
}

function inferTrips(
  events: LocatedEvent[],
  countries: Map<string, EventAggregate>,
) {
  const usualCountry = [...countries]
    .filter(([country]) => country !== "Unknown country")
    .sort(
      ([, left], [, right]) =>
        right.events - left.events || right.milliseconds - left.milliseconds,
    )[0]?.[0];

  if (!usualCountry) return { usualCountry: null, trips: [] };

  const sortedEvents = [...events].sort(
    (left, right) => left.playedAt - right.playedAt,
  );
  const trips: SpotifyDeepDiveSummary["trips"] = [];
  const eventsByCountry = new Map<string, LocatedEvent[]>();
  let awayEvents: LocatedEvent[] = [];

  const finishTrip = () => {
    if (!awayEvents.length) return;

    const startedAt = awayEvents[0].playedAt;
    const endedAt = awayEvents.at(-1)?.playedAt ?? startedAt;
    const days = Math.floor((endedAt - startedAt) / (24 * 60 * 60 * 1_000)) + 1;

    const tripCountries = new Map<string, EventAggregate>();
    const tripTracks = new Map<
      string,
      EventAggregate & { track: string; artist: string }
    >();
    let milliseconds = 0;

    for (const event of awayEvents) {
      milliseconds += event.milliseconds;
      incrementAggregate(tripCountries, event.country, event.milliseconds);
      const key = `${normalizedKey(event.artist)}\u001f${normalizedKey(event.track)}`;
      const track = tripTracks.get(key) ?? {
        track: event.track,
        artist: event.artist,
        events: 0,
        milliseconds: 0,
      };
      track.events += 1;
      track.milliseconds += event.milliseconds;
      tripTracks.set(key, track);
    }

    const topTrack = [...tripTracks.values()].sort(
      (left, right) =>
        right.milliseconds - left.milliseconds || right.events - left.events,
    )[0];

    trips.push({
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      days,
      events: awayEvents.length,
      uniqueTracks: tripTracks.size,
      milliseconds,
      countries: rankedAggregates(tripCountries),
      topTrack: topTrack
        ? {
            track: topTrack.track,
            artist: topTrack.artist,
            events: topTrack.events,
            value: topTrack.milliseconds / 3_600_000,
          }
        : null,
    });
    awayEvents = [];
  };

  for (const event of sortedEvents) {
    if (event.country === usualCountry || event.country === "Unknown country")
      continue;
    const countryEvents = eventsByCountry.get(event.country) ?? [];
    countryEvents.push(event);
    eventsByCountry.set(event.country, countryEvents);
  }
  for (const countryEvents of eventsByCountry.values()) {
    awayEvents = countryEvents;
    finishTrip();
  }

  trips.sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  return { usualCountry, trips };
}

const SESSION_BINS = [
  { label: "Under 15m", maximum: 15 * 60_000 },
  { label: "15–30m", maximum: 30 * 60_000 },
  { label: "30–60m", maximum: 60 * 60_000 },
  { label: "1–2h", maximum: 2 * 3_600_000 },
  { label: "2–4h", maximum: 4 * 3_600_000 },
  { label: "4h+", maximum: Number.POSITIVE_INFINITY },
];

function buildSessionAnalytics(events: LocatedEvent[]) {
  const sortedEvents = [...events].sort(
    (left, right) => left.playedAt - right.playedAt,
  );
  const sessions: Array<{
    events: LocatedEvent[];
    milliseconds: number;
  }> = [];
  let current: (typeof sessions)[number] | null = null;
  let previousPlayedAt = Number.NEGATIVE_INFINITY;

  for (const event of sortedEvents) {
    if (!current || event.playedAt - previousPlayedAt > 30 * 60 * 1_000) {
      current = { events: [], milliseconds: 0 };
      sessions.push(current);
    }
    current.events.push(event);
    current.milliseconds += event.milliseconds;
    previousPlayedAt = event.playedAt;
  }

  const bins = SESSION_BINS.map((bin) => ({
    ...bin,
    sessions: 0,
    events: 0,
    milliseconds: 0,
    totalArtists: 0,
    totalTracks: 0,
  }));
  const phases = ["Opening third", "Middle third", "Closing third"].map(
    (label) => ({
      label,
      events: 0,
      skippedEvents: 0,
      completedEvents: 0,
    }),
  );

  for (const session of sessions) {
    const bin = bins.find(
      (candidate) => session.milliseconds < candidate.maximum,
    );
    if (!bin) continue;
    bin.sessions += 1;
    bin.events += session.events.length;
    bin.milliseconds += session.milliseconds;
    bin.totalArtists += new Set(
      session.events.map((event) => normalizedKey(event.artist)),
    ).size;
    bin.totalTracks += new Set(
      session.events.map(
        (event) =>
          `${normalizedKey(event.artist)}\u001f${normalizedKey(event.track)}`,
      ),
    ).size;

    if (session.events.length < 3) continue;
    session.events.forEach((event, index) => {
      const phase =
        phases[Math.min(2, Math.floor((index * 3) / session.events.length))];
      phase.events += 1;
      if (event.skipped) phase.skippedEvents += 1;
      if (event.completed) phase.completedEvents += 1;
    });
  }

  return {
    sessionLengths: bins.map((bin) => ({
      label: bin.label,
      sessions: bin.sessions,
      events: bin.events,
      milliseconds: bin.milliseconds,
    })),
    sessionAttention: phases,
    sessionVariety: bins.map((bin) => ({
      label: bin.label,
      sessions: bin.sessions,
      averageMinutes: bin.sessions
        ? bin.milliseconds / bin.sessions / 60_000
        : 0,
      averageArtists: bin.sessions ? bin.totalArtists / bin.sessions : 0,
      averageTracks: bin.sessions ? bin.totalTracks / bin.sessions : 0,
      averagePlays: bin.sessions ? bin.events / bin.sessions : 0,
    })),
  };
}

function buildSkipTiming(events: LocatedEvent[]) {
  const bins = [
    { label: "Under 5s", maximum: 5_000 },
    { label: "5–15s", maximum: 15_000 },
    { label: "15–30s", maximum: 30_000 },
    { label: "30–60s", maximum: 60_000 },
    { label: "1–2m", maximum: 2 * 60_000 },
    { label: "2m+", maximum: Number.POSITIVE_INFINITY },
  ].map((bin) => ({ ...bin, events: 0 }));

  for (const event of events) {
    if (!event.skipped) continue;
    const bin = bins.find(
      (candidate) => event.milliseconds < candidate.maximum,
    );
    if (bin) bin.events += 1;
  }
  const total = bins.reduce((sum, bin) => sum + bin.events, 0);
  return bins.map((bin) => ({
    label: bin.label,
    events: bin.events,
    percentage: total ? (bin.events / total) * 100 : 0,
  }));
}

function buildListeningModes(events: LocatedEvent[]) {
  const modes = ["Direct choice", "Shuffled", "Other starts"].map((label) => ({
    label,
    events: 0,
    skippedEvents: 0,
    completedEvents: 0,
    milliseconds: 0,
  }));

  for (const event of events) {
    const mode = event.directChoice
      ? modes[0]
      : event.shuffled
        ? modes[1]
        : modes[2];
    mode.events += 1;
    mode.milliseconds += event.milliseconds;
    if (event.skipped) mode.skippedEvents += 1;
    if (event.completed) mode.completedEvents += 1;
  }
  return modes;
}

function buildReplayDelays(events: LocatedEvent[]) {
  const bins = [
    { label: "Under 1h", maximum: 3_600_000 },
    { label: "1–24h", maximum: 24 * 3_600_000 },
    { label: "1–7d", maximum: 7 * 24 * 3_600_000 },
    { label: "1–4w", maximum: 28 * 24 * 3_600_000 },
    { label: "1–6mo", maximum: 183 * 24 * 3_600_000 },
    { label: "6mo+", maximum: Number.POSITIVE_INFINITY },
  ].map((bin) => ({ ...bin, events: 0 }));
  const lastPlay = new Map<string, number>();

  for (const event of [...events].sort(
    (left, right) => left.playedAt - right.playedAt,
  )) {
    const key = `${normalizedKey(event.artist)}\u001f${normalizedKey(event.track)}`;
    const previous = lastPlay.get(key);
    if (previous !== undefined) {
      const delay = event.playedAt - previous;
      const bin = bins.find((candidate) => delay < candidate.maximum);
      if (bin) bin.events += 1;
    }
    lastPlay.set(key, event.playedAt);
  }

  const total = bins.reduce((sum, bin) => sum + bin.events, 0);
  return bins.map((bin) => ({
    label: bin.label,
    events: bin.events,
    percentage: total ? (bin.events / total) * 100 : 0,
  }));
}

function buildAlbumEngagement(albums: Map<string, AlbumAggregate>) {
  return [...albums.values()]
    .sort(
      (left, right) =>
        right.milliseconds - left.milliseconds || right.events - left.events,
    )
    .slice(0, 15)
    .map((album) => ({
      album: album.album,
      artist: album.artist,
      events: album.events,
      milliseconds: album.milliseconds,
      completedEvents: album.completedEvents,
      uniqueTracks: album.tracks.size,
    }));
}

function buildListeningConcentration(
  tracks: Map<string, TrackAggregate>,
  totalMilliseconds: number,
) {
  const rankedTracks = [...tracks.values()].sort(
    (left, right) =>
      right.milliseconds - left.milliseconds || right.events - left.events,
  );

  return [10, 25, 50, 100].map((rank) => {
    const milliseconds = rankedTracks
      .slice(0, rank)
      .reduce((total, track) => total + track.milliseconds, 0);
    return {
      rank,
      milliseconds,
      percentage:
        totalMilliseconds > 0 ? (milliseconds / totalMilliseconds) * 100 : 0,
    };
  });
}

function trackInsight(track: TrackAggregate, value: number) {
  return {
    track: track.track,
    artist: track.artist,
    events: track.events,
    value,
  };
}

function topTracks(
  tracks: TrackAggregate[],
  compare: (left: TrackAggregate, right: TrackAggregate) => number,
  value: (track: TrackAggregate) => number,
  limit = 5,
) {
  return [...tracks]
    .sort(compare)
    .slice(0, limit)
    .map((track) => trackInsight(track, value(track)));
}

function selectTrackInsights(tracks: Map<string, TrackAggregate>) {
  const values = [...tracks.values()];
  const skipEligible = values.filter((track) => track.events >= 10);
  const completionEligible = values.filter((track) => track.events >= 10);
  const loveHateEligible = values.filter(
    (track) => track.events >= 20 && track.skipped > 0 && track.completed > 0,
  );
  const shuffleEligible = values.filter(
    (track) => track.shuffleEvents >= 5 && track.directEvents >= 5,
  );

  const loveHateScore = (track: TrackAggregate) =>
    (Math.min(track.skipped, track.completed) / track.events) *
    Math.log2(track.events + 1);
  const shuffleLift = (track: TrackAggregate) =>
    track.shuffleSkipped / track.shuffleEvents -
    track.directSkipped / track.directEvents;

  return {
    mostSkipped: topTracks(
      values.filter((track) => track.skipped > 0),
      (left, right) =>
        right.skipped - left.skipped || right.events - left.events,
      (track) => track.skipped,
    ),
    highestSkipRate: topTracks(
      skipEligible.filter((track) => track.skipped === track.events),
      (left, right) =>
        right.events - left.events || right.milliseconds - left.milliseconds,
      (track) => (track.skipped / track.events) * 100,
      10,
    ),
    mostReliableCompletion: topTracks(
      completionEligible.filter((track) => track.completed === track.events),
      (left, right) =>
        right.events - left.events || right.milliseconds - left.milliseconds,
      (track) => (track.completed / track.events) * 100,
      10,
    ),
    loveHateTrack: topTracks(
      loveHateEligible,
      (left, right) => loveHateScore(right) - loveHateScore(left),
      (track) =>
        (Math.min(track.skipped, track.completed) / track.events) * 100,
    ),
    shuffleCasualty: topTracks(
      shuffleEligible.filter((track) => shuffleLift(track) > 0),
      (left, right) => shuffleLift(right) - shuffleLift(left),
      (track) => shuffleLift(track) * 100,
    ),
    topListeningTime: topTracks(
      values,
      (left, right) =>
        right.milliseconds - left.milliseconds || right.events - left.events,
      (track) => track.milliseconds / 3_600_000,
    ),
    mostPlayedOnShuffle: topTracks(
      values.filter((track) => track.shuffleEvents > 0),
      (left, right) =>
        right.shuffleEvents - left.shuffleEvents || right.events - left.events,
      (track) => track.shuffleEvents,
    ),
    quickestSkips: topTracks(
      values.filter((track) => track.skipped >= 5),
      (left, right) =>
        left.skippedMilliseconds / left.skipped -
          right.skippedMilliseconds / right.skipped ||
        right.skipped - left.skipped,
      (track) => track.skippedMilliseconds / track.skipped / 1_000,
    ),
    directChoiceFavorites: topTracks(
      values.filter((track) => track.directChoiceEvents > 0),
      (left, right) =>
        right.directChoiceEvents - left.directChoiceEvents ||
        right.events - left.events,
      (track) => track.directChoiceEvents,
    ),
  };
}

function jsonEntriesFromFile(
  file: InputFile,
  limits: { files: number; expandedBytes: number },
) {
  const lowerName = file.name.toLocaleLowerCase("en-US");

  if (lowerName.endsWith(".json")) {
    limits.files += 1;
    limits.expandedBytes += file.buffer.byteLength;
    if (limits.files > MAX_FILES) {
      throw new Error("The export contains too many JSON files.");
    }
    if (file.buffer.byteLength > MAX_JSON_BYTES) {
      throw new Error(`${file.name} exceeds the JSON file-size limit.`);
    }
    if (limits.expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error("The expanded export exceeds the safety limit.");
    }
    return [[file.name, new Uint8Array(file.buffer)]] as Array<
      [string, Uint8Array]
    >;
  }

  if (!lowerName.endsWith(".zip")) {
    throw new Error("Only ZIP and JSON files are accepted.");
  }

  const archive = unzipSync(new Uint8Array(file.buffer), {
    filter: (entry) => {
      const name = entry.name.toLocaleLowerCase("en-US");
      const segments = entry.name.split(/[\\/]/).filter(Boolean);
      if (
        entry.name.startsWith("/") ||
        segments.includes("..") ||
        segments.length > 4 ||
        /\.(zip|rar|7z|tar|gz)$/i.test(name)
      ) {
        throw new Error("The archive contains an unexpected nested structure.");
      }
      if (name.endsWith("/")) return false;
      if (!name.endsWith(".json")) return false;

      limits.files += 1;
      limits.expandedBytes += entry.originalSize;
      if (limits.files > MAX_FILES) {
        throw new Error("The export contains too many JSON files.");
      }
      if (entry.originalSize > MAX_JSON_BYTES) {
        throw new Error(`${entry.name} exceeds the JSON file-size limit.`);
      }
      if (limits.expandedBytes > MAX_EXPANDED_BYTES) {
        throw new Error("The expanded export exceeds the safety limit.");
      }
      return true;
    },
  });

  return Object.entries(archive);
}

export function processSpotifyFiles(
  files: InputFile[],
): SpotifyDeepDiveSummary {
  const startedAt = performance.now();
  const compressedBytes = files.reduce(
    (total, file) => total + file.buffer.byteLength,
    0,
  );

  if (!files.length || files.length > MAX_FILES) {
    throw new Error("Choose between 1 and 100 Spotify export files.");
  }
  if (compressedBytes > MAX_COMPRESSED_BYTES) {
    throw new Error("The selected files exceed the compressed-size limit.");
  }

  const limits = { files: 0, expandedBytes: 0 };
  const entries = files.flatMap((file) => jsonEntriesFromFile(file, limits));
  if (!entries.length)
    throw new Error("No Spotify JSON history files were found.");

  const tracks = new Map<string, TrackAggregate>();
  const platforms = new Map<string, EventAggregate>();
  const countries = new Map<string, EventAggregate>();
  const albums = new Map<string, AlbumAggregate>();
  const reasonStarts = new Map<string, EventAggregate>();
  const reasonEnds = new Map<string, EventAggregate>();
  const months = new Map<string, EventAggregate>();
  const dayHours = new Map<string, EventAggregate>();
  const locatedEvents: LocatedEvent[] = [];
  let totalEvents = 0;
  let totalMilliseconds = 0;
  let offlineMilliseconds = 0;
  let shuffleEvents = 0;
  let skippedEvents = 0;
  let completedEvents = 0;
  let incognitoEvents = 0;
  let rawEventCount = 0;
  let coverageStartedAt = Number.POSITIVE_INFINITY;
  let coverageEndedAt = Number.NEGATIVE_INFINITY;

  entries.forEach(([name, bytes], fileIndex) => {
    if (performance.now() - startedAt > MAX_PROCESSING_MS) {
      throw new Error("Processing exceeded the two-minute safety limit.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(strFromU8(bytes)) as unknown;
    } catch {
      throw new Error(`${name} is not valid JSON.`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${name} does not contain a Spotify event array.`);
    }

    for (const raw of parsed) {
      rawEventCount += 1;
      if (rawEventCount > MAX_EVENTS) {
        throw new Error("The export exceeds the event-count safety limit.");
      }
      if (
        rawEventCount % 10_000 === 0 &&
        performance.now() - startedAt > MAX_PROCESSING_MS
      ) {
        throw new Error("Processing exceeded the two-minute safety limit.");
      }
      if (!raw || typeof raw !== "object") continue;
      const event = raw as SpotifyEvent;
      if (
        typeof event.master_metadata_track_name !== "string" ||
        typeof event.master_metadata_album_artist_name !== "string" ||
        event.episode_name != null ||
        event.episode_show_name != null ||
        typeof event.ts !== "string" ||
        typeof event.ms_played !== "number" ||
        !Number.isFinite(event.ms_played) ||
        event.ms_played < 0
      ) {
        continue;
      }

      const playedAt = new Date(event.ts).getTime();
      if (!Number.isFinite(playedAt)) continue;
      const track = event.master_metadata_track_name.trim();
      const artist = event.master_metadata_album_artist_name.trim();
      if (!track || !artist) continue;

      totalEvents += 1;
      totalMilliseconds += event.ms_played;
      coverageStartedAt = Math.min(coverageStartedAt, playedAt);
      coverageEndedAt = Math.max(coverageEndedAt, playedAt);
      if (event.offline === true) offlineMilliseconds += event.ms_played;

      const platform = spotifyDeviceLabel(
        typeof event.platform === "string" && event.platform.trim()
          ? event.platform.trim()
          : "Unknown device",
      );
      const reasonStart =
        typeof event.reason_start === "string" && event.reason_start.trim()
          ? event.reason_start.trim()
          : "unknown";
      const reasonEnd =
        typeof event.reason_end === "string" && event.reason_end.trim()
          ? event.reason_end.trim()
          : "unknown";
      const rawCountry =
        typeof event.conn_country === "string" && event.conn_country.trim()
          ? event.conn_country.trim().toUpperCase()
          : "Unknown country";
      const country =
        /^[A-Z]{2}$/.test(rawCountry) && rawCountry !== "ZZ"
          ? rawCountry
          : "Unknown country";
      const playedDate = new Date(playedAt);
      const month = playedDate.toISOString().slice(0, 7);
      const skipped = event.skipped === true;
      const shuffled = event.shuffle === true;
      const completed = reasonEnd === "trackdone";
      const incognito = event.incognito_mode === true;
      incrementAggregate(platforms, platform, event.ms_played);
      incrementAggregate(countries, country, event.ms_played);
      incrementAggregate(reasonStarts, reasonStart, event.ms_played);
      incrementAggregate(reasonEnds, reasonEnd, event.ms_played);
      incrementAggregate(months, month, event.ms_played);
      incrementAggregate(
        dayHours,
        `${playedDate.getUTCDay()}-${playedDate.getUTCHours()}`,
        event.ms_played,
      );
      locatedEvents.push({
        playedAt,
        country,
        milliseconds: event.ms_played,
        track,
        artist,
        skipped,
        completed,
        shuffled,
        directChoice: reasonStart === "clickrow" || reasonStart === "playbtn",
      });
      if (
        typeof event.master_metadata_album_album_name === "string" &&
        event.master_metadata_album_album_name.trim()
      ) {
        const album = event.master_metadata_album_album_name.trim();
        const albumKey = `${normalizedKey(artist)}\u001f${normalizedKey(album)}`;
        const albumAggregate = albums.get(albumKey) ?? {
          album,
          artist,
          events: 0,
          milliseconds: 0,
          completedEvents: 0,
          tracks: new Set<string>(),
        };
        albumAggregate.events += 1;
        albumAggregate.milliseconds += event.ms_played;
        if (completed) albumAggregate.completedEvents += 1;
        albumAggregate.tracks.add(normalizedKey(track));
        albums.set(albumKey, albumAggregate);
      }

      const key = `${normalizedKey(artist)}\u001f${normalizedKey(track)}`;
      const aggregate = tracks.get(key) ?? {
        track,
        artist,
        events: 0,
        milliseconds: 0,
        skipped: 0,
        completed: 0,
        shuffleEvents: 0,
        shuffleSkipped: 0,
        directEvents: 0,
        directSkipped: 0,
        skippedMilliseconds: 0,
        directChoiceEvents: 0,
      };
      aggregate.events += 1;
      aggregate.milliseconds += event.ms_played;
      if (skipped) {
        aggregate.skipped += 1;
        aggregate.skippedMilliseconds += event.ms_played;
        skippedEvents += 1;
      }
      if (completed) {
        aggregate.completed += 1;
        completedEvents += 1;
      }
      if (reasonStart === "clickrow" || reasonStart === "playbtn")
        aggregate.directChoiceEvents += 1;
      if (shuffled) {
        shuffleEvents += 1;
        aggregate.shuffleEvents += 1;
        if (skipped) aggregate.shuffleSkipped += 1;
      } else {
        aggregate.directEvents += 1;
        if (skipped) aggregate.directSkipped += 1;
      }
      if (incognito) incognitoEvents += 1;
      tracks.set(key, aggregate);
    }

    parsed = null;
    postProgress(`Processed ${name}`, fileIndex + 1, entries.length);
  });

  if (!totalEvents || !Number.isFinite(coverageStartedAt)) {
    throw new Error("No usable Spotify music events were found.");
  }

  const tripAnalytics = inferTrips(locatedEvents, countries);
  const albumEngagement = buildAlbumEngagement(albums);
  const sessionAnalytics = buildSessionAnalytics(locatedEvents);

  return {
    version: SPOTIFY_DEEP_DIVE_SUMMARY_VERSION,
    coverageStartedAt: new Date(coverageStartedAt).toISOString(),
    coverageEndedAt: new Date(coverageEndedAt).toISOString(),
    totalEvents,
    totalMilliseconds,
    offlinePercentage:
      totalMilliseconds > 0
        ? (offlineMilliseconds / totalMilliseconds) * 100
        : 0,
    shufflePercentage: (shuffleEvents / totalEvents) * 100,
    skipPercentage: (skippedEvents / totalEvents) * 100,
    completionPercentage: (completedEvents / totalEvents) * 100,
    incognitoPercentage: (incognitoEvents / totalEvents) * 100,
    ...selectTrackInsights(tracks),
    topAlbumsByTime: albumEngagement.slice(0, 5).map((album) => ({
      label: `${album.album} — ${album.artist}`,
      events: album.events,
      milliseconds: album.milliseconds,
    })),
    platforms: rankedAggregates(platforms),
    countries: rankedAggregates(countries),
    ...tripAnalytics,
    reasonStarts: rankedAggregates(reasonStarts),
    reasonEnds: rankedAggregates(reasonEnds),
    listeningByDayHour: Array.from({ length: 7 * 24 }, (_, index) => {
      const day = Math.floor(index / 24);
      const hour = index % 24;
      return {
        day,
        hour,
        ...(dayHours.get(`${day}-${hour}`) ?? {
          events: 0,
          milliseconds: 0,
        }),
      };
    }),
    sessionLengths: sessionAnalytics.sessionLengths,
    albumEngagement,
    listeningConcentration: buildListeningConcentration(
      tracks,
      totalMilliseconds,
    ),
    skipTiming: buildSkipTiming(locatedEvents),
    sessionAttention: sessionAnalytics.sessionAttention,
    listeningModes: buildListeningModes(locatedEvents),
    replayDelays: buildReplayDelays(locatedEvents),
    sessionVariety: sessionAnalytics.sessionVariety,
    durationByMonth: [...months]
      .map(([month, value]) => ({ month, ...value }))
      .sort((left, right) => left.month.localeCompare(right.month)),
  };
}

if (workerScope) {
  workerScope.onmessage = (event: MessageEvent<ProcessMessage>) => {
    if (event.data.type !== "process") return;

    try {
      const summary = processSpotifyFiles(event.data.files);
      workerScope.postMessage({ type: "complete", summary });
    } catch (error) {
      workerScope.postMessage({
        type: "error",
        error:
          error instanceof Error ? error.message : "Spotify processing failed.",
      });
    }
  };
}

export {};
