export const DASHBOARD_RANGES = [
  { key: "30-days", label: "1 month", shortLabel: "1m" },
  { key: "90-days", label: "90 days", shortLabel: "90d" },
  { key: "6-months", label: "6 months", shortLabel: "6m" },
  { key: "12-months", label: "12 months", shortLabel: "12m" },
  { key: "this-year", label: "This year", shortLabel: "Year" },
  { key: "all-time", label: "All time", shortLabel: "All" },
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]["key"];

export type DashboardDateRange = {
  startDate: string;
  endDate: string;
};

export type DashboardTotals = {
  plays: number;
  artists: number;
  tracks: number;
  sessions: number;
};

export type TimelinePoint = { period: string; plays: number };
export type DayHourPoint = { day: number; hour: number; plays: number };
export type CalendarPoint = { day: string; plays: number };
export type RankedArtist = { name: string; plays: number };

export type RecentPlay = {
  artist: string;
  album: string | null;
  track: string;
  playedAt: string;
  source: string;
};

export type LifetimeRecords = {
  repeatedTrack: {
    track: string;
    artist: string;
    day: string;
    plays: number;
  } | null;
  favoriteStarter: {
    track: string;
    artist: string;
    sessions: number;
  } | null;
  rediscovery: {
    track: string;
    artist: string;
    previousPlay: string;
    returnPlay: string;
    gapDays: number;
  } | null;
  mostPlayedTrack: {
    track: string;
    artist: string;
    plays: number;
  } | null;
  busiestDay: { day: string; plays: number } | null;
  mostDiverseDay: { day: string; artists: number; plays: number } | null;
  longestStreak: {
    startedAt: string;
    endedAt: string;
    days: number;
  } | null;
  lateNightTrack: { track: string; artist: string; plays: number } | null;
  weekendArtist: { artist: string; plays: number } | null;
  persistentArtist: { artist: string; months: number; plays: number } | null;
  artistTakeover: {
    artist: string;
    day: string;
    plays: number;
  } | null;
  albumDay: {
    album: string;
    artist: string;
    day: string;
    tracks: number;
    plays: number;
  } | null;
};

export type Daypart =
  "Early morning" | "Late morning" | "Afternoon" | "Evening";

export type BehaviorStats = {
  peakHour: { hour: number; plays: number } | null;
  peakWeekday: { weekday: number; plays: number } | null;
  activeDayAverage: { average: number; activeDays: number } | null;
  longestSession: {
    plays: number;
    startedAt: string;
    endedAt: string;
    elapsedMinutes: number;
  } | null;
  mostVariedSession: {
    artists: number;
    plays: number;
    startedAt: string;
  } | null;
  longestArtistRun: { artist: string; plays: number } | null;
  longestAlbumRun: { album: string; artist: string; plays: number } | null;
  fastestObsession: {
    track: string;
    artist: string;
    elapsedMinutes: number;
  } | null;
  discoveryMonth: { month: string; artists: number } | null;
  artistComeback: {
    artist: string;
    previousPlay: string;
    returnPlay: string;
    gapDays: number;
  } | null;
  enduringTrack: {
    track: string;
    artist: string;
    years: number;
    firstYear: number;
    lastYear: number;
    plays: number;
  } | null;
  catalogDay: {
    artist: string;
    day: string;
    tracks: number;
    plays: number;
  } | null;
  weekdayArtists: Array<{
    weekday: number;
    artist: string;
    plays: number;
  }>;
  daypartTracks: Array<{
    daypart: Daypart;
    track: string;
    artist: string;
    plays: number;
  }>;
  longestListeningGap: {
    previousTrack: string;
    returnTrack: string;
    previousPlay: string;
    returnPlay: string;
    gapDays: number;
  } | null;
};

export type SeasonName = "Winter" | "Spring" | "Summer" | "Fall";

export type SeasonalStats = {
  favoriteSeason: { season: SeasonName; plays: number } | null;
  seasonArtists: Array<{
    season: SeasonName;
    artist: string;
    plays: number;
  }>;
  favoriteCalendarMonth: { month: number; plays: number } | null;
  biggestMonth: { month: string; plays: number } | null;
  biggestYear: { year: number; plays: number } | null;
  favoriteDayOfMonth: { day: number; plays: number } | null;
  mostReplayedDate: {
    calendarDate: string;
    plays: number;
    years: number;
  } | null;
  todayHistory: {
    calendarDate: string;
    plays: number;
    years: number;
    track: string | null;
    artist: string | null;
  };
  mostConsistentDate: {
    calendarDate: string;
    plays: number;
    years: number;
  } | null;
};

export type DashboardData = {
  totals: DashboardTotals;
  timeline: TimelinePoint[];
  timelineBucket: "day" | "week" | "month";
  dayHour: DayHourPoint[];
  calendar: CalendarPoint[];
  calendarStartedAt: string | null;
  calendarEndedAt: string | null;
  topArtists: RankedArtist[];
  recentPlay: RecentPlay | null;
  lifetime: LifetimeRecords;
  behavior: BehaviorStats;
  seasonal: SeasonalStats;
  historyStartedAt: string | null;
  historyEndedAt: string | null;
};

export function parseDashboardRange(value: string | undefined): DashboardRange {
  return DASHBOARD_RANGES.some((range) => range.key === value)
    ? (value as DashboardRange)
    : "all-time";
}

export function getDashboardRangeLabel(range: DashboardRange) {
  return (
    DASHBOARD_RANGES.find((option) => option.key === range)?.label ?? "All time"
  );
}
