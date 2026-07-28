import type {
  BehaviorStats,
  DashboardData,
  DashboardRange,
  Daypart,
  LifetimeRecords,
  SeasonalStats,
  SeasonName,
} from "@/lib/dashboard-types";
import type { LastFmNowPlaying } from "@/lib/lastfm";

const DAY_MS = 86_400_000;
const SESSION_GAP_MS = 30 * 60_000;
const weekdayNumbers: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const localFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export type PublicLastFmPlay = {
  artist: string;
  album: string | null;
  track: string;
  playedAt: string;
};

export type PublicLastFmHistory = {
  username: string;
  plays: PublicLastFmPlay[];
  nowPlaying: LastFmNowPlaying | null;
  cachedAt: string;
  truncated?: boolean;
  totalAvailable?: number;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
  dateKey: string;
  monthKey: string;
  calendarDate: string;
  dayNumber: number;
};

type AnalyzedPlay = PublicLastFmPlay & {
  date: Date;
  local: LocalParts;
  artistKey: string;
  trackKey: string;
  albumKey: string | null;
};

type Counted<T> = T & { count: number };

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function localParts(date: Date): LocalParts {
  const parts = Object.fromEntries(
    localFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const weekday = weekdayNumbers[parts.weekday] ?? 1;
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");

  return {
    year,
    month,
    day,
    hour,
    weekday,
    dateKey: `${year}-${monthText}-${dayText}`,
    monthKey: `${year}-${monthText}-01`,
    calendarDate: `${monthText}-${dayText}`,
    dayNumber: Math.floor(Date.UTC(year, month - 1, day) / DAY_MS),
  };
}

function analyzePlays(plays: PublicLastFmPlay[]) {
  return plays
    .flatMap((play): AnalyzedPlay[] => {
      const date = new Date(play.playedAt);
      if (
        !play.artist.trim() ||
        !play.track.trim() ||
        Number.isNaN(date.getTime())
      )
        return [];
      const artistKey = normalize(play.artist);
      return [
        {
          ...play,
          date,
          local: localParts(date),
          artistKey,
          trackKey: `${artistKey}\u001f${normalize(play.track)}`,
          albumKey: play.album
            ? `${artistKey}\u001f${normalize(play.album)}`
            : null,
        },
      ];
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function addCount<T>(map: Map<string, Counted<T>>, key: string, value: T) {
  const current = map.get(key);
  if (current) current.count += 1;
  else map.set(key, { ...value, count: 1 });
}

function highest<T extends { count: number }>(values: Iterable<T>) {
  let winner: T | null = null;
  for (const value of values) {
    if (!winner || value.count > winner.count) winner = value;
  }
  return winner;
}

function buildSessions(plays: AnalyzedPlay[]) {
  const sessions: AnalyzedPlay[][] = [];
  for (const play of plays) {
    const current = sessions.at(-1);
    const previous = current?.at(-1);
    if (
      !previous ||
      play.date.getTime() - previous.date.getTime() > SESSION_GAP_MS
    )
      sessions.push([play]);
    else current?.push(play);
  }
  return sessions;
}

function rangeIncludes(play: AnalyzedPlay, range: DashboardRange, now: Date) {
  if (range === "all-time") return true;
  if (range === "this-year") return play.local.year === localParts(now).year;
  const days = range === "30-days" ? 30 : range === "90-days" ? 90 : null;
  if (days) return play.date.getTime() >= now.getTime() - days * DAY_MS;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - (range === "6-months" ? 6 : 12));
  return play.date >= cutoff;
}

function timelineBucket(range: DashboardRange) {
  if (range === "30-days" || range === "90-days") return "day" as const;
  if (range === "6-months") return "week" as const;
  return "month" as const;
}

function timelineKey(play: AnalyzedPlay, bucket: "day" | "week" | "month") {
  if (bucket === "day") return play.local.dateKey;
  if (bucket === "month") return play.local.monthKey;
  const monday = new Date(
    (play.local.dayNumber - play.local.weekday + 1) * DAY_MS,
  );
  return monday.toISOString().slice(0, 10);
}

function daypart(hour: number): Daypart | null {
  if (hour < 5) return null;
  if (hour < 9) return "Early morning";
  if (hour < 12) return "Late morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function season(month: number): SeasonName {
  if (month === 12 || month <= 2) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Fall";
}

function iso(value: AnalyzedPlay | undefined) {
  return value?.date.toISOString() ?? "";
}

function buildLifetime(plays: AnalyzedPlay[]): LifetimeRecords {
  const trackTotals = new Map<
    string,
    Counted<{ track: string; artist: string }>
  >();
  const dayTotals = new Map<string, Counted<{ day: string }>>();
  const dayTracks = new Map<
    string,
    Counted<{ day: string; track: string; artist: string }>
  >();
  const dayArtists = new Map<string, Set<string>>();
  const artistDayTotals = new Map<
    string,
    Counted<{ day: string; artist: string }>
  >();
  const albumDayTotals = new Map<
    string,
    Counted<{ day: string; album: string; artist: string; tracks: Set<string> }>
  >();
  const lateTracks = new Map<
    string,
    Counted<{ track: string; artist: string }>
  >();
  const weekendArtists = new Map<string, Counted<{ artist: string }>>();
  const artistMonths = new Map<
    string,
    { artist: string; months: Set<string>; plays: number }
  >();
  const trackGroups = new Map<string, AnalyzedPlay[]>();

  for (const play of plays) {
    addCount(trackTotals, play.trackKey, play);
    addCount(dayTotals, play.local.dateKey, { day: play.local.dateKey });
    addCount(dayTracks, `${play.local.dateKey}\u001f${play.trackKey}`, {
      day: play.local.dateKey,
      track: play.track,
      artist: play.artist,
    });
    const artists = dayArtists.get(play.local.dateKey) ?? new Set<string>();
    artists.add(play.artistKey);
    dayArtists.set(play.local.dateKey, artists);
    addCount(artistDayTotals, `${play.local.dateKey}\u001f${play.artistKey}`, {
      day: play.local.dateKey,
      artist: play.artist,
    });
    if (play.albumKey && play.album) {
      const key = `${play.local.dateKey}\u001f${play.albumKey}`;
      const current = albumDayTotals.get(key);
      if (current) {
        current.count += 1;
        current.tracks.add(play.trackKey);
      } else {
        albumDayTotals.set(key, {
          count: 1,
          day: play.local.dateKey,
          album: play.album,
          artist: play.artist,
          tracks: new Set([play.trackKey]),
        });
      }
    }
    if (play.local.hour < 5) addCount(lateTracks, play.trackKey, play);
    if (play.local.weekday >= 6)
      addCount(weekendArtists, play.artistKey, { artist: play.artist });
    const artist = artistMonths.get(play.artistKey) ?? {
      artist: play.artist,
      months: new Set<string>(),
      plays: 0,
    };
    artist.months.add(play.local.monthKey);
    artist.plays += 1;
    artistMonths.set(play.artistKey, artist);
    const group = trackGroups.get(play.trackKey) ?? [];
    group.push(play);
    trackGroups.set(play.trackKey, group);
  }

  const topTrack = highest(trackTotals.values());
  const busiestDay = highest(dayTotals.values());
  const repeated = highest(dayTracks.values());
  const takeover = highest(artistDayTotals.values());
  const late = highest(lateTracks.values());
  const weekend = highest(weekendArtists.values());
  let diverse: { day: string; artists: number; plays: number } | null = null;
  for (const [day, artists] of dayArtists) {
    const candidate = {
      day,
      artists: artists.size,
      plays: dayTotals.get(day)?.count ?? 0,
    };
    if (
      !diverse ||
      candidate.artists > diverse.artists ||
      (candidate.artists === diverse.artists && candidate.plays > diverse.plays)
    )
      diverse = candidate;
  }

  let rediscovery: LifetimeRecords["rediscovery"] = null;
  for (const group of trackGroups.values()) {
    for (let index = 1; index < group.length; index += 1) {
      const gapDays = Math.floor(
        (group[index].date.getTime() - group[index - 1].date.getTime()) /
          DAY_MS,
      );
      if (!rediscovery || gapDays > rediscovery.gapDays) {
        rediscovery = {
          track: group[index].track,
          artist: group[index].artist,
          previousPlay: iso(group[index - 1]),
          returnPlay: iso(group[index]),
          gapDays,
        };
      }
    }
  }

  const sessionStarters = new Map<
    string,
    Counted<{ track: string; artist: string }>
  >();
  for (const session of buildSessions(plays)) {
    const starter = session[0];
    if (starter) addCount(sessionStarters, starter.trackKey, starter);
  }
  const favoriteStarter = highest(sessionStarters.values());

  const days = [...dayTotals.keys()].sort();
  let streak: LifetimeRecords["longestStreak"] = null;
  let startIndex = 0;
  for (let index = 0; index <= days.length; index += 1) {
    const continues =
      index < days.length &&
      (index === startIndex ||
        Math.round(
          (new Date(`${days[index]}T12:00:00Z`).getTime() -
            new Date(`${days[index - 1]}T12:00:00Z`).getTime()) /
            DAY_MS,
        ) === 1);
    if (continues) continue;
    const length = index - startIndex;
    if (length && (!streak || length > streak.days))
      streak = {
        startedAt: days[startIndex],
        endedAt: days[index - 1],
        days: length,
      };
    startIndex = index;
  }

  let persistent: LifetimeRecords["persistentArtist"] = null;
  for (const value of artistMonths.values()) {
    if (
      !persistent ||
      value.months.size > persistent.months ||
      (value.months.size === persistent.months &&
        value.plays > persistent.plays)
    )
      persistent = {
        artist: value.artist,
        months: value.months.size,
        plays: value.plays,
      };
  }

  let bestAlbum: LifetimeRecords["albumDay"] = null;
  for (const value of albumDayTotals.values()) {
    if (
      !bestAlbum ||
      value.tracks.size > bestAlbum.tracks ||
      (value.tracks.size === bestAlbum.tracks && value.count > bestAlbum.plays)
    )
      bestAlbum = {
        album: value.album,
        artist: value.artist,
        day: value.day,
        tracks: value.tracks.size,
        plays: value.count,
      };
  }

  return {
    repeatedTrack: repeated ? { ...repeated, plays: repeated.count } : null,
    favoriteStarter: favoriteStarter
      ? { ...favoriteStarter, sessions: favoriteStarter.count }
      : null,
    rediscovery,
    mostPlayedTrack: topTrack ? { ...topTrack, plays: topTrack.count } : null,
    busiestDay: busiestDay
      ? { day: busiestDay.day, plays: busiestDay.count }
      : null,
    mostDiverseDay: diverse,
    longestStreak: streak,
    lateNightTrack: late ? { ...late, plays: late.count } : null,
    weekendArtist: weekend
      ? { artist: weekend.artist, plays: weekend.count }
      : null,
    persistentArtist: persistent,
    artistTakeover: takeover
      ? { artist: takeover.artist, day: takeover.day, plays: takeover.count }
      : null,
    albumDay: bestAlbum,
  };
}

function buildBehavior(plays: AnalyzedPlay[]): BehaviorStats {
  const hourTotals = new Map<string, Counted<{ hour: number }>>();
  const weekdayTotals = new Map<string, Counted<{ weekday: number }>>();
  const dayTotals = new Map<string, number>();
  const weekdayArtists = new Map<
    string,
    Counted<{ weekday: number; artist: string }>
  >();
  const daypartTracks = new Map<
    string,
    Counted<{ daypart: Daypart; track: string; artist: string }>
  >();
  const artistGroups = new Map<string, AnalyzedPlay[]>();
  const trackGroups = new Map<string, AnalyzedPlay[]>();
  const firstArtistsByMonth = new Map<string, Set<string>>();
  const seenArtists = new Set<string>();
  const catalogDays = new Map<
    string,
    { artist: string; day: string; tracks: Set<string>; plays: number }
  >();

  for (const play of plays) {
    addCount(hourTotals, String(play.local.hour), { hour: play.local.hour });
    addCount(weekdayTotals, String(play.local.weekday), {
      weekday: play.local.weekday,
    });
    dayTotals.set(
      play.local.dateKey,
      (dayTotals.get(play.local.dateKey) ?? 0) + 1,
    );
    addCount(weekdayArtists, `${play.local.weekday}\u001f${play.artistKey}`, {
      weekday: play.local.weekday,
      artist: play.artist,
    });
    const part = daypart(play.local.hour);
    if (part)
      addCount(daypartTracks, `${part}\u001f${play.trackKey}`, {
        daypart: part,
        track: play.track,
        artist: play.artist,
      });
    const artists = artistGroups.get(play.artistKey) ?? [];
    artists.push(play);
    artistGroups.set(play.artistKey, artists);
    const tracks = trackGroups.get(play.trackKey) ?? [];
    tracks.push(play);
    trackGroups.set(play.trackKey, tracks);
    if (!seenArtists.has(play.artistKey)) {
      seenArtists.add(play.artistKey);
      const discovered =
        firstArtistsByMonth.get(play.local.monthKey) ?? new Set();
      discovered.add(play.artistKey);
      firstArtistsByMonth.set(play.local.monthKey, discovered);
    }
    const catalogKey = `${play.local.dateKey}\u001f${play.artistKey}`;
    const catalog = catalogDays.get(catalogKey) ?? {
      artist: play.artist,
      day: play.local.dateKey,
      tracks: new Set<string>(),
      plays: 0,
    };
    catalog.tracks.add(play.trackKey);
    catalog.plays += 1;
    catalogDays.set(catalogKey, catalog);
  }

  const peakHour = highest(hourTotals.values());
  const peakWeekday = highest(weekdayTotals.values());
  const sessions = buildSessions(plays);
  const longestSession = [...sessions].sort(
    (left, right) =>
      right.length - left.length ||
      (right.at(-1)?.date.getTime() ?? 0) - (left.at(-1)?.date.getTime() ?? 0),
  )[0];
  const variedSession = [...sessions].sort((left, right) => {
    const leftArtists = new Set(left.map((play) => play.artistKey)).size;
    const rightArtists = new Set(right.map((play) => play.artistKey)).size;
    return rightArtists - leftArtists || right.length - left.length;
  })[0];

  let artistRun: BehaviorStats["longestArtistRun"] = null;
  let albumRun: BehaviorStats["longestAlbumRun"] = null;
  let runStart = 0;
  for (let index = 1; index <= plays.length; index += 1) {
    if (
      index < plays.length &&
      plays[index].artistKey === plays[runStart].artistKey
    )
      continue;
    const length = index - runStart;
    if (!artistRun || length > artistRun.plays)
      artistRun = { artist: plays[runStart].artist, plays: length };
    runStart = index;
  }
  runStart = 0;
  for (let index = 1; index <= plays.length; index += 1) {
    const key = plays[runStart]?.albumKey;
    if (index < plays.length && key && plays[index].albumKey === key) continue;
    if (key) {
      const length = index - runStart;
      if (!albumRun || length > albumRun.plays)
        albumRun = {
          album: plays[runStart].album ?? "Unknown album",
          artist: plays[runStart].artist,
          plays: length,
        };
    }
    runStart = index;
  }

  let obsession: BehaviorStats["fastestObsession"] = null;
  let artistComeback: BehaviorStats["artistComeback"] = null;
  let enduring: BehaviorStats["enduringTrack"] = null;
  for (const group of trackGroups.values()) {
    if (group.length >= 10) {
      const elapsedMinutes = Math.floor(
        (group[9].date.getTime() - group[0].date.getTime()) / 60_000,
      );
      if (!obsession || elapsedMinutes < obsession.elapsedMinutes)
        obsession = {
          track: group[0].track,
          artist: group[0].artist,
          elapsedMinutes,
        };
    }
    const years = new Set(group.map((play) => play.local.year));
    const candidate = {
      track: group[0].track,
      artist: group[0].artist,
      years: years.size,
      firstYear: Math.min(...years),
      lastYear: Math.max(...years),
      plays: group.length,
    };
    if (
      !enduring ||
      candidate.years > enduring.years ||
      (candidate.years === enduring.years && candidate.plays > enduring.plays)
    )
      enduring = candidate;
  }
  for (const group of artistGroups.values()) {
    for (let index = 1; index < group.length; index += 1) {
      const gapDays = Math.floor(
        (group[index].date.getTime() - group[index - 1].date.getTime()) /
          DAY_MS,
      );
      if (!artistComeback || gapDays > artistComeback.gapDays)
        artistComeback = {
          artist: group[index].artist,
          previousPlay: iso(group[index - 1]),
          returnPlay: iso(group[index]),
          gapDays,
        };
    }
  }

  let discovery: BehaviorStats["discoveryMonth"] = null;
  for (const [month, artists] of firstArtistsByMonth) {
    if (!discovery || artists.size > discovery.artists)
      discovery = { month, artists: artists.size };
  }
  let catalog: BehaviorStats["catalogDay"] = null;
  for (const value of catalogDays.values()) {
    if (
      !catalog ||
      value.tracks.size > catalog.tracks ||
      (value.tracks.size === catalog.tracks && value.plays > catalog.plays)
    )
      catalog = {
        artist: value.artist,
        day: value.day,
        tracks: value.tracks.size,
        plays: value.plays,
      };
  }

  const weekdayWinners = Array.from({ length: 7 }, (_, offset) => {
    const weekday = offset + 1;
    const winner = highest(
      [...weekdayArtists.values()].filter((value) => value.weekday === weekday),
    );
    return winner
      ? { weekday, artist: winner.artist, plays: winner.count }
      : null;
  }).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const parts: Daypart[] = [
    "Early morning",
    "Late morning",
    "Afternoon",
    "Evening",
  ];
  const partWinners = parts.flatMap((part) => {
    const winner = highest(
      [...daypartTracks.values()].filter((value) => value.daypart === part),
    );
    return winner
      ? [
          {
            daypart: part,
            track: winner.track,
            artist: winner.artist,
            plays: winner.count,
          },
        ]
      : [];
  });

  let longestGap: BehaviorStats["longestListeningGap"] = null;
  for (let index = 1; index < plays.length; index += 1) {
    const gapDays = Math.floor(
      (plays[index].date.getTime() - plays[index - 1].date.getTime()) / DAY_MS,
    );
    if (!longestGap || gapDays > longestGap.gapDays)
      longestGap = {
        previousTrack: plays[index - 1].track,
        returnTrack: plays[index].track,
        previousPlay: iso(plays[index - 1]),
        returnPlay: iso(plays[index]),
        gapDays,
      };
  }

  const activeDays = dayTotals.size;
  return {
    peakHour: peakHour ? { hour: peakHour.hour, plays: peakHour.count } : null,
    peakWeekday: peakWeekday
      ? { weekday: peakWeekday.weekday, plays: peakWeekday.count }
      : null,
    activeDayAverage: activeDays
      ? {
          average: Number((plays.length / activeDays).toFixed(1)),
          activeDays,
        }
      : null,
    longestSession: longestSession?.length
      ? {
          plays: longestSession.length,
          startedAt: iso(longestSession[0]),
          endedAt: iso(longestSession.at(-1)),
          elapsedMinutes: Math.floor(
            ((longestSession.at(-1)?.date.getTime() ?? 0) -
              longestSession[0].date.getTime()) /
              60_000,
          ),
        }
      : null,
    mostVariedSession: variedSession?.length
      ? {
          artists: new Set(variedSession.map((play) => play.artistKey)).size,
          plays: variedSession.length,
          startedAt: iso(variedSession[0]),
        }
      : null,
    longestArtistRun: artistRun,
    longestAlbumRun: albumRun,
    fastestObsession: obsession,
    discoveryMonth: discovery,
    artistComeback,
    enduringTrack: enduring,
    catalogDay: catalog,
    weekdayArtists: weekdayWinners,
    daypartTracks: partWinners,
    longestListeningGap: longestGap,
  };
}

function buildSeasonal(plays: AnalyzedPlay[], now: Date): SeasonalStats {
  const seasonTotals = new Map<string, Counted<{ season: SeasonName }>>();
  const seasonArtists = new Map<
    string,
    Counted<{ season: SeasonName; artist: string }>
  >();
  const monthNumbers = new Map<string, Counted<{ month: number }>>();
  const months = new Map<string, Counted<{ month: string }>>();
  const years = new Map<string, Counted<{ year: number }>>();
  const monthDays = new Map<string, Counted<{ day: number }>>();
  const dates = new Map<
    string,
    Counted<{ calendarDate: string; years: Set<number> }>
  >();
  const today = localParts(now).calendarDate;
  const todayTracks = new Map<
    string,
    Counted<{ track: string; artist: string }>
  >();

  for (const play of plays) {
    const seasonName = season(play.local.month);
    addCount(seasonTotals, seasonName, { season: seasonName });
    addCount(seasonArtists, `${seasonName}\u001f${play.artistKey}`, {
      season: seasonName,
      artist: play.artist,
    });
    addCount(monthNumbers, String(play.local.month), {
      month: play.local.month,
    });
    addCount(months, play.local.monthKey, { month: play.local.monthKey });
    addCount(years, String(play.local.year), { year: play.local.year });
    addCount(monthDays, String(play.local.day), { day: play.local.day });
    const date = dates.get(play.local.calendarDate);
    if (date) {
      date.count += 1;
      date.years.add(play.local.year);
    } else {
      dates.set(play.local.calendarDate, {
        calendarDate: play.local.calendarDate,
        count: 1,
        years: new Set([play.local.year]),
      });
    }
    if (play.local.calendarDate === today)
      addCount(todayTracks, play.trackKey, play);
  }

  const favoriteSeason = highest(seasonTotals.values());
  const seasonArtistWinners = (
    ["Winter", "Spring", "Summer", "Fall"] as const
  ).flatMap((seasonName) => {
    const winner = highest(
      [...seasonArtists.values()].filter(
        (value) => value.season === seasonName,
      ),
    );
    return winner
      ? [
          {
            season: seasonName,
            artist: winner.artist,
            plays: winner.count,
          },
        ]
      : [];
  });
  const favoriteMonth = highest(monthNumbers.values());
  const biggestMonth = highest(months.values());
  const biggestYear = highest(years.values());
  const favoriteDay = highest(monthDays.values());
  const replayed = [...dates.values()].sort(
    (left, right) =>
      right.count - left.count || right.years.size - left.years.size,
  )[0];
  const consistent = [...dates.values()].sort(
    (left, right) =>
      right.years.size - left.years.size || right.count - left.count,
  )[0];
  const todayTop = highest(todayTracks.values());
  const todayDate = dates.get(today);

  return {
    favoriteSeason: favoriteSeason
      ? { season: favoriteSeason.season, plays: favoriteSeason.count }
      : null,
    seasonArtists: seasonArtistWinners,
    favoriteCalendarMonth: favoriteMonth
      ? { month: favoriteMonth.month, plays: favoriteMonth.count }
      : null,
    biggestMonth: biggestMonth
      ? { month: biggestMonth.month, plays: biggestMonth.count }
      : null,
    biggestYear: biggestYear
      ? { year: biggestYear.year, plays: biggestYear.count }
      : null,
    favoriteDayOfMonth: favoriteDay
      ? { day: favoriteDay.day, plays: favoriteDay.count }
      : null,
    mostReplayedDate: replayed
      ? {
          calendarDate: replayed.calendarDate,
          plays: replayed.count,
          years: replayed.years.size,
        }
      : null,
    todayHistory: {
      calendarDate: today,
      plays: todayDate?.count ?? 0,
      years: todayDate?.years.size ?? 0,
      track: todayTop?.track ?? null,
      artist: todayTop?.artist ?? null,
    },
    mostConsistentDate: consistent
      ? {
          calendarDate: consistent.calendarDate,
          plays: consistent.count,
          years: consistent.years.size,
        }
      : null,
  };
}

export function buildPublicDashboardData(
  history: PublicLastFmHistory,
  range: DashboardRange,
): DashboardData {
  const now = new Date();
  const allPlays = analyzePlays(history.plays);
  const scoped = allPlays.filter((play) => rangeIncludes(play, range, now));
  const bucket = timelineBucket(range);
  const timeline = new Map<string, number>();
  const dayHour = new Map<string, number>();
  const calendar = new Map<string, number>();
  const artists = new Map<string, Counted<{ name: string }>>();

  for (const play of scoped) {
    const period = timelineKey(play, bucket);
    timeline.set(period, (timeline.get(period) ?? 0) + 1);
    const cell = `${play.local.weekday}\u001f${play.local.hour}`;
    dayHour.set(cell, (dayHour.get(cell) ?? 0) + 1);
    addCount(artists, play.artistKey, { name: play.artist });
  }

  const calendarCutoff = now.getTime() - 364 * DAY_MS;
  for (const play of allPlays) {
    if (play.date.getTime() < calendarCutoff) continue;
    calendar.set(
      play.local.dateKey,
      (calendar.get(play.local.dateKey) ?? 0) + 1,
    );
  }

  const calendarDays = [...calendar.keys()].sort();
  const recent = allPlays.at(-1);
  return {
    totals: {
      plays: scoped.length,
      artists: new Set(scoped.map((play) => play.artistKey)).size,
      tracks: new Set(scoped.map((play) => play.trackKey)).size,
      sessions: buildSessions(scoped).length,
    },
    timeline: [...timeline.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, plays]) => ({ period, plays })),
    timelineBucket: bucket,
    dayHour: [...dayHour.entries()].map(([key, plays]) => {
      const [day, hour] = key.split("\u001f").map(Number);
      return { day, hour, plays };
    }),
    calendar: [...calendar.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, plays]) => ({ day, plays })),
    calendarStartedAt: calendarDays[0] ?? null,
    calendarEndedAt: calendarDays.at(-1) ?? null,
    topArtists: [...artists.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 8)
      .map((artist) => ({ name: artist.name, plays: artist.count })),
    recentPlay: recent
      ? {
          artist: recent.artist,
          album: recent.album,
          track: recent.track,
          playedAt: recent.date.toISOString(),
          source: "lastfm",
        }
      : null,
    lifetime: buildLifetime(allPlays),
    behavior: buildBehavior(allPlays),
    seasonal: buildSeasonal(allPlays, now),
    historyStartedAt: allPlays[0]?.date.toISOString() ?? null,
    historyEndedAt: allPlays.at(-1)?.date.toISOString() ?? null,
  };
}
