"use client";

import { useMemo, useState } from "react";

import type {
  BehaviorStats,
  LifetimeRecords,
  SeasonalStats,
} from "@/lib/dashboard-types";

const PAGE_SIZE = 6;
const numberFormatter = new Intl.NumberFormat("en-US");

type RecordTone = "green" | "violet" | "blue" | "amber";

type RecordCard = {
  label: string;
  value: string;
  title: string;
  detail: string;
  tone: RecordTone;
};

function formatRecordDay(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatLocalDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-15T12:00:00Z`));
}

function formatMonthNumber(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, value - 1, 15)));
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`2024-${value}T12:00:00Z`));
}

function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function formatHour(hour: number) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: "UTC",
  });
  const start = new Date(Date.UTC(2026, 0, 1, hour));
  const end = new Date(Date.UTC(2026, 0, 1, (hour + 1) % 24));
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

function formatDuration(minutes: number) {
  if (minutes < 1) return "Under 1 min";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days} days`;
}

const weekdayNames = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const daypartRanges = {
  "Early morning": "5–9 AM",
  "Late morning": "9 AM–noon",
  Afternoon: "Noon–5 PM",
  Evening: "5 PM–midnight",
};

function scatterRoutineRecords(cards: RecordCard[]) {
  const routineOrder = [
    "Monday soundtrack",
    "Early morning favorite",
    "Tuesday soundtrack",
    "Late morning favorite",
    "Wednesday soundtrack",
    "Afternoon favorite",
    "Thursday soundtrack",
    "Evening favorite",
    "Friday soundtrack",
    "Saturday soundtrack",
    "Sunday soundtrack",
  ];
  const targetPositions = [2, 8, 13, 16, 20, 25, 28, 32, 37, 40, 44];
  const byLabel = new Map(cards.map((card) => [card.label, card]));
  const routineCards = routineOrder.flatMap((label) => {
    const card = byLabel.get(label);
    return card ? [card] : [];
  });
  const routineLabels = new Set(routineOrder);
  const remainingCards = cards.filter((card) => !routineLabels.has(card.label));
  const routineByPosition = new Map(
    routineCards.map((card, index) => [targetPositions[index], card]),
  );
  let remainingIndex = 0;

  return cards.map((_, position) => {
    const routineCard = routineByPosition.get(position);
    if (routineCard) return routineCard;
    const card = remainingCards[remainingIndex];
    remainingIndex += 1;
    return card;
  });
}

function recordCards(
  records: LifetimeRecords,
  behavior: BehaviorStats,
  seasonal: SeasonalStats,
): RecordCard[] {
  const repeated = records.repeatedTrack;
  const starter = records.favoriteStarter;
  const rediscovery = records.rediscovery;
  const mostPlayed = records.mostPlayedTrack;
  const busiest = records.busiestDay;
  const diverse = records.mostDiverseDay;
  const streak = records.longestStreak;
  const lateNight = records.lateNightTrack;
  const weekend = records.weekendArtist;
  const persistent = records.persistentArtist;
  const takeover = records.artistTakeover;
  const albumDay = records.albumDay;
  const seasonArtists = new Map(
    seasonal.seasonArtists.map((record) => [record.season, record]),
  );
  const weekdayArtists = new Map(
    behavior.weekdayArtists.map((record) => [record.weekday, record]),
  );
  const daypartTracks = new Map(
    behavior.daypartTracks.map((record) => [record.daypart, record]),
  );

  const cards: RecordCard[] = [
    {
      label: "Most repeated track in one day",
      value: `${numberFormatter.format(repeated?.plays ?? 0)} plays`,
      title: repeated?.track ?? "No record yet",
      detail: repeated
        ? `${repeated.artist} · ${formatRecordDay(repeated.day)}`
        : "Waiting for history",
      tone: "green",
    },
    {
      label: "Favorite session starter",
      value: `${numberFormatter.format(starter?.sessions ?? 0)} sessions`,
      title: starter?.track ?? "No record yet",
      detail: starter?.artist ?? "Waiting for history",
      tone: "violet",
    },
    {
      label: "Longest rediscovery gap",
      value: `${numberFormatter.format(rediscovery?.gapDays ?? 0)} days`,
      title: rediscovery?.track ?? "No record yet",
      detail: rediscovery
        ? `${rediscovery.artist} · ${formatRecordDay(rediscovery.previousPlay.slice(0, 10))} → ${formatRecordDay(rediscovery.returnPlay.slice(0, 10))}`
        : "Waiting for history",
      tone: "blue",
    },
    {
      label: "Most-played track, all time",
      value: `${numberFormatter.format(mostPlayed?.plays ?? 0)} plays`,
      title: mostPlayed?.track ?? "No record yet",
      detail: mostPlayed?.artist ?? "Waiting for history",
      tone: "amber",
    },
    {
      label: "Busiest listening day",
      value: `${numberFormatter.format(busiest?.plays ?? 0)} plays`,
      title: busiest ? formatRecordDay(busiest.day) : "No record yet",
      detail: busiest ? "Your highest-volume day" : "Waiting for history",
      tone: "green",
    },
    {
      label: "Most diverse listening day",
      value: `${numberFormatter.format(diverse?.artists ?? 0)} artists`,
      title: diverse ? formatRecordDay(diverse.day) : "No record yet",
      detail: diverse
        ? `${numberFormatter.format(diverse.plays)} plays that day`
        : "Waiting for history",
      tone: "violet",
    },
    {
      label: "Longest daily listening streak",
      value: `${numberFormatter.format(streak?.days ?? 0)} days`,
      title: streak
        ? `${formatRecordDay(streak.startedAt)} — ${formatRecordDay(streak.endedAt)}`
        : "No record yet",
      detail: streak ? "At least one play every day" : "Waiting for history",
      tone: "blue",
    },
    {
      label: "After-midnight favorite",
      value: `${numberFormatter.format(lateNight?.plays ?? 0)} plays`,
      title: lateNight?.track ?? "No record yet",
      detail: lateNight
        ? `${lateNight.artist} · Midnight–5 AM`
        : "Waiting for history",
      tone: "amber",
    },
    {
      label: "Weekend fixture",
      value: `${numberFormatter.format(weekend?.plays ?? 0)} plays`,
      title: weekend?.artist ?? "No record yet",
      detail: weekend ? "Saturday and Sunday" : "Waiting for history",
      tone: "green",
    },
    {
      label: "Most months in rotation",
      value: `${numberFormatter.format(persistent?.months ?? 0)} months`,
      title: persistent?.artist ?? "No record yet",
      detail: persistent
        ? `${numberFormatter.format(persistent.plays)} plays across active months`
        : "Waiting for history",
      tone: "violet",
    },
    {
      label: "Biggest artist takeover day",
      value: `${numberFormatter.format(takeover?.plays ?? 0)} plays`,
      title: takeover?.artist ?? "No record yet",
      detail: takeover ? formatRecordDay(takeover.day) : "Waiting for history",
      tone: "blue",
    },
    {
      label: "Deepest album day",
      value: `${numberFormatter.format(albumDay?.tracks ?? 0)} tracks`,
      title: albumDay?.album ?? "No record yet",
      detail: albumDay
        ? `${albumDay.artist} · ${formatRecordDay(albumDay.day)} · ${numberFormatter.format(albumDay.plays)} plays`
        : "Waiting for history",
      tone: "amber",
    },
    {
      label: "Peak listening hour",
      value: `${numberFormatter.format(behavior.peakHour?.plays ?? 0)} plays`,
      title: behavior.peakHour
        ? formatHour(behavior.peakHour.hour)
        : "No record yet",
      detail: "America/Chicago · Completed scrobbles",
      tone: "green",
    },
    {
      label: "Favorite listening weekday",
      value: `${numberFormatter.format(behavior.peakWeekday?.plays ?? 0)} plays`,
      title: behavior.peakWeekday
        ? weekdayNames[behavior.peakWeekday.weekday]
        : "No record yet",
      detail: "Your highest-volume day of the week",
      tone: "violet",
    },
    {
      label: "Active-day pace",
      value: `${numberFormatter.format(behavior.activeDayAverage?.average ?? 0)} plays`,
      title: behavior.activeDayAverage
        ? `${numberFormatter.format(behavior.activeDayAverage.activeDays)} active days`
        : "No record yet",
      detail: "Average on days with at least one scrobble",
      tone: "blue",
    },
    {
      label: "Deepest listening session",
      value: `${numberFormatter.format(behavior.longestSession?.plays ?? 0)} plays`,
      title: behavior.longestSession
        ? formatLocalDate(behavior.longestSession.startedAt)
        : "No record yet",
      detail: behavior.longestSession
        ? `${formatDuration(behavior.longestSession.elapsedMinutes)} from first to last scrobble`
        : "Waiting for history",
      tone: "amber",
    },
    {
      label: "Most varied listening session",
      value: `${numberFormatter.format(behavior.mostVariedSession?.artists ?? 0)} artists`,
      title: behavior.mostVariedSession
        ? formatLocalDate(behavior.mostVariedSession.startedAt)
        : "No record yet",
      detail: behavior.mostVariedSession
        ? `${numberFormatter.format(behavior.mostVariedSession.plays)} plays · 30-minute gap rule`
        : "Waiting for history",
      tone: "green",
    },
    {
      label: "Longest same-artist run",
      value: `${numberFormatter.format(behavior.longestArtistRun?.plays ?? 0)} plays`,
      title: behavior.longestArtistRun?.artist ?? "No record yet",
      detail: "Consecutive Last.fm scrobbles",
      tone: "violet",
    },
    {
      label: "Longest same-album run",
      value: `${numberFormatter.format(behavior.longestAlbumRun?.plays ?? 0)} plays`,
      title: behavior.longestAlbumRun?.album ?? "No record yet",
      detail: behavior.longestAlbumRun
        ? `${behavior.longestAlbumRun.artist} · Consecutive scrobbles`
        : "Waiting for history",
      tone: "blue",
    },
    {
      label: "Fastest obsession",
      value: behavior.fastestObsession
        ? formatDuration(behavior.fastestObsession.elapsedMinutes)
        : "—",
      title: behavior.fastestObsession?.track ?? "No record yet",
      detail: behavior.fastestObsession
        ? `${behavior.fastestObsession.artist} · First to 10th play`
        : "Waiting for history",
      tone: "amber",
    },
    {
      label: "Biggest discovery month",
      value: `${numberFormatter.format(behavior.discoveryMonth?.artists ?? 0)} artists`,
      title: behavior.discoveryMonth
        ? formatMonth(behavior.discoveryMonth.month)
        : "No record yet",
      detail: "Artists appearing for the first time",
      tone: "green",
    },
    {
      label: "Longest artist comeback",
      value: `${numberFormatter.format(behavior.artistComeback?.gapDays ?? 0)} days`,
      title: behavior.artistComeback?.artist ?? "No record yet",
      detail: behavior.artistComeback
        ? `${formatLocalDate(behavior.artistComeback.previousPlay)} → ${formatLocalDate(behavior.artistComeback.returnPlay)}`
        : "Waiting for history",
      tone: "violet",
    },
    {
      label: "Most enduring track",
      value: `${numberFormatter.format(behavior.enduringTrack?.years ?? 0)} years`,
      title: behavior.enduringTrack?.track ?? "No record yet",
      detail: behavior.enduringTrack
        ? `${behavior.enduringTrack.artist} · ${behavior.enduringTrack.firstYear}–${behavior.enduringTrack.lastYear} · ${numberFormatter.format(behavior.enduringTrack.plays)} plays`
        : "Waiting for history",
      tone: "blue",
    },
    {
      label: "Deepest artist catalog day",
      value: `${numberFormatter.format(behavior.catalogDay?.tracks ?? 0)} tracks`,
      title: behavior.catalogDay?.artist ?? "No record yet",
      detail: behavior.catalogDay
        ? `${formatRecordDay(behavior.catalogDay.day)} · ${numberFormatter.format(behavior.catalogDay.plays)} plays`
        : "Waiting for history",
      tone: "amber",
    },
    {
      label: "Most-played season",
      value: `${numberFormatter.format(seasonal.favoriteSeason?.plays ?? 0)} plays`,
      title: seasonal.favoriteSeason?.season ?? "No record yet",
      detail: "Total completed scrobbles across that season",
      tone: "green",
    },
    ...(["Winter", "Spring", "Summer", "Fall"] as const).map(
      (season, index): RecordCard => {
        const record = seasonArtists.get(season);
        const tones: RecordTone[] = ["violet", "blue", "amber", "green"];
        return {
          label: `${season} soundtrack`,
          value: `${numberFormatter.format(record?.plays ?? 0)} plays`,
          title: record?.artist ?? "No record yet",
          detail: `Top artist during ${season.toLowerCase()} months`,
          tone: tones[index],
        };
      },
    ),
    {
      label: "Favorite calendar month",
      value: `${numberFormatter.format(seasonal.favoriteCalendarMonth?.plays ?? 0)} plays`,
      title: seasonal.favoriteCalendarMonth
        ? formatMonthNumber(seasonal.favoriteCalendarMonth.month)
        : "No record yet",
      detail: "Combined across every year",
      tone: "violet",
    },
    {
      label: "Biggest single month",
      value: `${numberFormatter.format(seasonal.biggestMonth?.plays ?? 0)} plays`,
      title: seasonal.biggestMonth
        ? formatMonth(seasonal.biggestMonth.month)
        : "No record yet",
      detail: "Your highest-volume month on record",
      tone: "blue",
    },
    {
      label: "Biggest listening year",
      value: `${numberFormatter.format(seasonal.biggestYear?.plays ?? 0)} plays`,
      title: seasonal.biggestYear
        ? String(seasonal.biggestYear.year)
        : "No record yet",
      detail: "Completed Last.fm scrobbles",
      tone: "amber",
    },
    {
      label: "Favorite day of the month",
      value: `${numberFormatter.format(seasonal.favoriteDayOfMonth?.plays ?? 0)} plays`,
      title: seasonal.favoriteDayOfMonth
        ? `The ${ordinal(seasonal.favoriteDayOfMonth.day)}`
        : "No record yet",
      detail: "Combined across all months and years",
      tone: "green",
    },
    {
      label: "Most replayed calendar date",
      value: `${numberFormatter.format(seasonal.mostReplayedDate?.plays ?? 0)} plays`,
      title: seasonal.mostReplayedDate
        ? formatCalendarDate(seasonal.mostReplayedDate.calendarDate)
        : "No record yet",
      detail: seasonal.mostReplayedDate
        ? `${numberFormatter.format(seasonal.mostReplayedDate.years)} different years represented`
        : "Waiting for history",
      tone: "violet",
    },
    {
      label: "This date in listening history",
      value: `${numberFormatter.format(seasonal.todayHistory.plays)} plays`,
      title: formatCalendarDate(seasonal.todayHistory.calendarDate),
      detail:
        seasonal.todayHistory.track && seasonal.todayHistory.artist
          ? `${seasonal.todayHistory.track} · ${seasonal.todayHistory.artist} · ${seasonal.todayHistory.years} years`
          : "No completed scrobbles on this date yet",
      tone: "blue",
    },
    {
      label: "Most consistent calendar date",
      value: `${numberFormatter.format(seasonal.mostConsistentDate?.years ?? 0)} years`,
      title: seasonal.mostConsistentDate
        ? formatCalendarDate(seasonal.mostConsistentDate.calendarDate)
        : "No record yet",
      detail: seasonal.mostConsistentDate
        ? `${numberFormatter.format(seasonal.mostConsistentDate.plays)} plays across recurring dates`
        : "Waiting for history",
      tone: "amber",
    },
    ...([1, 2, 3, 4, 5, 6, 7] as const).map((weekday, index): RecordCard => {
      const record = weekdayArtists.get(weekday);
      const tones: RecordTone[] = [
        "green",
        "violet",
        "blue",
        "amber",
        "green",
        "violet",
        "blue",
      ];
      return {
        label: `${weekdayNames[weekday]} soundtrack`,
        value: `${numberFormatter.format(record?.plays ?? 0)} plays`,
        title: record?.artist ?? "No record yet",
        detail: `Top artist across all ${weekdayNames[weekday]}s`,
        tone: tones[index],
      };
    }),
    ...(["Early morning", "Late morning", "Afternoon", "Evening"] as const).map(
      (daypart, index): RecordCard => {
        const record = daypartTracks.get(daypart);
        const tones: RecordTone[] = ["amber", "green", "violet", "blue"];
        return {
          label: `${daypart} favorite`,
          value: `${numberFormatter.format(record?.plays ?? 0)} plays`,
          title: record?.track ?? "No record yet",
          detail: record
            ? `${record.artist} · ${daypartRanges[daypart]}`
            : "Waiting for history",
          tone: tones[index],
        };
      },
    ),
    {
      label: "Longest silence between scrobbles",
      value: `${numberFormatter.format(behavior.longestListeningGap?.gapDays ?? 0)} days`,
      title: behavior.longestListeningGap
        ? `${behavior.longestListeningGap.previousTrack} → ${behavior.longestListeningGap.returnTrack}`
        : "No record yet",
      detail: behavior.longestListeningGap
        ? `${formatLocalDate(behavior.longestListeningGap.previousPlay)} → ${formatLocalDate(behavior.longestListeningGap.returnPlay)}`
        : "Waiting for history",
      tone: "amber",
    },
  ];

  return scatterRoutineRecords(cards);
}

export function LifetimeCarousel({
  records,
  behavior,
  seasonal,
}: {
  records: LifetimeRecords;
  behavior: BehaviorStats;
  seasonal: SeasonalStats;
}) {
  const cards = useMemo(
    () => recordCards(records, behavior, seasonal),
    [behavior, records, seasonal],
  );
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(cards.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const visibleCards = cards.slice(start, start + PAGE_SIZE);

  function movePage(direction: -1 | 1) {
    setPage((current) => (current + direction + pageCount) % pageCount);
  }

  return (
    <div className="record-carousel">
      <div className="record-carousel-controls">
        <span>
          {start + 1}–{Math.min(start + PAGE_SIZE, cards.length)} of{" "}
          {cards.length}
        </span>
        <div>
          <button
            type="button"
            onClick={() => movePage(-1)}
            aria-label="Previous lifetime records"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={() => movePage(1)}
            aria-label="Next lifetime records"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <div
        className="record-grid record-page"
        key={page}
        aria-live="polite"
        aria-label={`Lifetime records ${start + 1} through ${Math.min(start + PAGE_SIZE, cards.length)}`}
      >
        {visibleCards.map((card, index) => (
          <article
            className={`record-card record-${card.tone}`}
            key={card.label}
          >
            <div className="record-index">
              {String(start + index + 1).padStart(2, "0")}
            </div>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <h3 title={card.title}>{card.title}</h3>
            <span>{card.detail}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
