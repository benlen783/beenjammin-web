import { z } from "zod";

import dashboardJson from "@/content/analytics/dashboard.json";
import type {
  BehaviorStats,
  DashboardData,
  DashboardRange,
  LifetimeRecords,
  SeasonalStats,
} from "@/lib/dashboard-types";

const count = z.number().int().nonnegative();
const text = z.string();
const nullableText = text.nullable();

const lifetimeSchema: z.ZodType<LifetimeRecords> = z.object({
  repeatedTrack: z
    .object({ track: text, artist: text, day: text, plays: count })
    .nullable(),
  favoriteStarter: z
    .object({ track: text, artist: text, sessions: count })
    .nullable(),
  rediscovery: z
    .object({
      track: text,
      artist: text,
      previousPlay: text,
      returnPlay: text,
      gapDays: count,
    })
    .nullable(),
  mostPlayedTrack: z
    .object({ track: text, artist: text, plays: count })
    .nullable(),
  busiestDay: z.object({ day: text, plays: count }).nullable(),
  mostDiverseDay: z
    .object({ day: text, artists: count, plays: count })
    .nullable(),
  longestStreak: z
    .object({ startedAt: text, endedAt: text, days: count })
    .nullable(),
  lateNightTrack: z
    .object({ track: text, artist: text, plays: count })
    .nullable(),
  weekendArtist: z.object({ artist: text, plays: count }).nullable(),
  persistentArtist: z
    .object({ artist: text, months: count, plays: count })
    .nullable(),
  artistTakeover: z
    .object({ artist: text, day: text, plays: count })
    .nullable(),
  albumDay: z
    .object({
      album: text,
      artist: text,
      day: text,
      tracks: count,
      plays: count,
    })
    .nullable(),
});

const behaviorSchema: z.ZodType<BehaviorStats> = z.object({
  peakHour: z.object({ hour: count, plays: count }).nullable(),
  peakWeekday: z.object({ weekday: count, plays: count }).nullable(),
  activeDayAverage: z
    .object({ average: z.number().nonnegative(), activeDays: count })
    .nullable(),
  longestSession: z
    .object({
      plays: count,
      startedAt: text,
      endedAt: text,
      elapsedMinutes: z.number().nonnegative(),
    })
    .nullable(),
  mostVariedSession: z
    .object({ artists: count, plays: count, startedAt: text })
    .nullable(),
  longestArtistRun: z.object({ artist: text, plays: count }).nullable(),
  longestAlbumRun: z
    .object({ album: text, artist: text, plays: count })
    .nullable(),
  fastestObsession: z
    .object({
      track: text,
      artist: text,
      elapsedMinutes: z.number().nonnegative(),
    })
    .nullable(),
  discoveryMonth: z.object({ month: text, artists: count }).nullable(),
  artistComeback: z
    .object({
      artist: text,
      previousPlay: text,
      returnPlay: text,
      gapDays: count,
    })
    .nullable(),
  enduringTrack: z
    .object({
      track: text,
      artist: text,
      years: count,
      firstYear: count,
      lastYear: count,
      plays: count,
    })
    .nullable(),
  catalogDay: z
    .object({ artist: text, day: text, tracks: count, plays: count })
    .nullable(),
  weekdayArtists: z.array(
    z.object({ weekday: count, artist: text, plays: count }),
  ),
  daypartTracks: z.array(
    z.object({
      daypart: z.enum([
        "Early morning",
        "Late morning",
        "Afternoon",
        "Evening",
      ]),
      track: text,
      artist: text,
      plays: count,
    }),
  ),
  longestListeningGap: z
    .object({
      previousTrack: text,
      returnTrack: text,
      previousPlay: text,
      returnPlay: text,
      gapDays: count,
    })
    .nullable(),
});

const season = z.enum(["Winter", "Spring", "Summer", "Fall"]);
const seasonalSchema: z.ZodType<SeasonalStats> = z.object({
  favoriteSeason: z.object({ season, plays: count }).nullable(),
  seasonArtists: z.array(z.object({ season, artist: text, plays: count })),
  favoriteCalendarMonth: z.object({ month: count, plays: count }).nullable(),
  biggestMonth: z.object({ month: text, plays: count }).nullable(),
  biggestYear: z.object({ year: count, plays: count }).nullable(),
  favoriteDayOfMonth: z.object({ day: count, plays: count }).nullable(),
  mostReplayedDate: z
    .object({ calendarDate: text, plays: count, years: count })
    .nullable(),
  todayHistory: z.object({
    calendarDate: text,
    plays: count,
    years: count,
    track: nullableText,
    artist: nullableText,
  }),
  mostConsistentDate: z
    .object({ calendarDate: text, plays: count, years: count })
    .nullable(),
});

export const dashboardDataSchema: z.ZodType<DashboardData> = z.object({
  totals: z.object({
    plays: count,
    artists: count,
    tracks: count,
    sessions: count,
  }),
  timeline: z.array(z.object({ period: text, plays: count })),
  timelineBucket: z.enum(["day", "week", "month"]),
  dayHour: z.array(z.object({ day: count, hour: count, plays: count })),
  calendar: z.array(z.object({ day: text, plays: count })),
  calendarStartedAt: nullableText,
  calendarEndedAt: nullableText,
  topArtists: z.array(z.object({ name: text, plays: count })),
  recentPlay: z
    .object({
      artist: text,
      album: nullableText,
      track: text,
      playedAt: text,
      source: text,
    })
    .nullable(),
  lifetime: lifetimeSchema,
  behavior: behaviorSchema,
  seasonal: seasonalSchema,
  historyStartedAt: nullableText,
  historyEndedAt: nullableText,
});

export const dashboardSnapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  ranges: z.object({
    "30-days": dashboardDataSchema,
    "90-days": dashboardDataSchema,
    "6-months": dashboardDataSchema,
    "12-months": dashboardDataSchema,
    "this-year": dashboardDataSchema,
    "all-time": dashboardDataSchema,
  }),
});

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;

const dashboardSnapshot = dashboardSnapshotSchema.parse(dashboardJson);

export function getDashboardSnapshot(range: DashboardRange) {
  return dashboardSnapshot.ranges[range];
}

export function getDashboardSnapshots() {
  return dashboardSnapshot.ranges;
}
