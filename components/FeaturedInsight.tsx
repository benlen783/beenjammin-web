"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  BehaviorStats,
  LifetimeRecords,
  SeasonalStats,
} from "@/lib/dashboard-types";

const ROTATION_INTERVAL_MS = 8_000;
const numberFormatter = new Intl.NumberFormat("en-US");

type Spotlight = {
  kicker: string;
  stat: string;
  headline: ReactNode;
  detailStart: string;
  detailEnd: string;
  orbitValue: string;
  orbitLabel: string;
};

function formatGap(days: number) {
  const years = Math.floor(days / 365.2425);
  const months = Math.floor((days - years * 365.2425) / 30.44);

  if (!years) return `${months} ${months === 1 ? "month" : "months"}`;
  if (!months) return `${years} ${years === 1 ? "year" : "years"}`;
  return `${years} years, ${months} months`;
}

function formatDate(value: string) {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: isDateOnly ? "UTC" : "America/Chicago",
  }).format(new Date(isDateOnly ? `${value}T12:00:00Z` : value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-15T12:00:00Z`));
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`2024-${value}T12:00:00Z`));
}

function formatHour(hour: number) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(Date.UTC(2026, 0, 1, hour)))}–${formatter.format(new Date(Date.UTC(2026, 0, 1, (hour + 1) % 24)))}`;
}

function formatDuration(minutes: number) {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes
      ? `${hours}h ${remainingMinutes}m`
      : `${hours} hours`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days} days`;
}

const seasonMonths = {
  Winter: "December–February",
  Spring: "March–May",
  Summer: "June–August",
  Fall: "September–November",
};

function buildSpotlights(
  records: LifetimeRecords,
  behavior: BehaviorStats,
  seasonal: SeasonalStats,
): Spotlight[] {
  const spotlights: Spotlight[] = [];

  if (records.rediscovery) {
    const record = records.rediscovery;
    spotlights.push({
      kicker: "Longest rediscovery",
      stat: formatGap(record.gapDays),
      headline: (
        <>
          You went longer without hearing <q>{record.track}</q> by{" "}
          {record.artist} than any other song you later returned to.
        </>
      ),
      detailStart: formatDate(record.previousPlay),
      detailEnd: formatDate(record.returnPlay),
      orbitValue: numberFormatter.format(record.gapDays),
      orbitLabel: "days",
    });
  }

  if (records.longestStreak) {
    const record = records.longestStreak;
    spotlights.push({
      kicker: "Longest daily streak",
      stat: `${numberFormatter.format(record.days)} days`,
      headline: (
        <>Music showed up every day for your longest unbroken listening run.</>
      ),
      detailStart: formatDate(record.startedAt),
      detailEnd: formatDate(record.endedAt),
      orbitValue: numberFormatter.format(record.days),
      orbitLabel: "days",
    });
  }

  if (records.artistTakeover) {
    const record = records.artistTakeover;
    spotlights.push({
      kicker: "Biggest artist takeover",
      stat: `${numberFormatter.format(record.plays)} plays`,
      headline: (
        <>
          <q>{record.artist}</q> owned a single day more completely than any
          other artist in your history.
        </>
      ),
      detailStart: "Single-day high",
      detailEnd: formatDate(record.day),
      orbitValue: numberFormatter.format(record.plays),
      orbitLabel: "plays",
    });
  }

  if (records.persistentArtist) {
    const record = records.persistentArtist;
    spotlights.push({
      kicker: "Longest-running rotation",
      stat: `${numberFormatter.format(record.months)} months`,
      headline: (
        <>
          <q>{record.artist}</q> appeared in more distinct listening months than
          any other artist.
        </>
      ),
      detailStart: `${numberFormatter.format(record.plays)} total plays`,
      detailEnd: "Across active months",
      orbitValue: numberFormatter.format(record.months),
      orbitLabel: "months",
    });
  }

  if (records.mostDiverseDay) {
    const record = records.mostDiverseDay;
    spotlights.push({
      kicker: "Most eclectic day",
      stat: `${numberFormatter.format(record.artists)} artists`,
      headline: (
        <>
          Your listening moved between more different artists on this day than
          on any other.
        </>
      ),
      detailStart: `${numberFormatter.format(record.plays)} total plays`,
      detailEnd: formatDate(record.day),
      orbitValue: numberFormatter.format(record.artists),
      orbitLabel: "artists",
    });
  }

  if (records.lateNightTrack) {
    const record = records.lateNightTrack;
    spotlights.push({
      kicker: "After-midnight favorite",
      stat: `${numberFormatter.format(record.plays)} plays`,
      headline: (
        <>
          <q>{record.track}</q> by {record.artist} is your most-played track
          between midnight and 5 AM.
        </>
      ),
      detailStart: "Midnight",
      detailEnd: "5:00 AM",
      orbitValue: numberFormatter.format(record.plays),
      orbitLabel: "plays",
    });
  }

  if (seasonal.favoriteSeason) {
    const record = seasonal.favoriteSeason;
    const soundtrack = seasonal.seasonArtists.find(
      (candidate) => candidate.season === record.season,
    );
    spotlights.push({
      kicker: "Seasonal center of gravity",
      stat: record.season,
      headline: (
        <>
          {record.season} carries more completed scrobbles than any other season
          {soundtrack ? (
            <>
              , led by <q>{soundtrack.artist}</q>
            </>
          ) : null}
          .
        </>
      ),
      detailStart: seasonMonths[record.season],
      detailEnd: `${numberFormatter.format(record.plays)} plays`,
      orbitValue: numberFormatter.format(record.plays),
      orbitLabel: "plays",
    });
  }

  if (seasonal.todayHistory.plays > 0) {
    const record = seasonal.todayHistory;
    spotlights.push({
      kicker: "This date in listening history",
      stat: `${numberFormatter.format(record.plays)} plays`,
      headline:
        record.track && record.artist ? (
          <>
            Across your history, <q>{record.track}</q> by {record.artist} is the
            defining track for this calendar date.
          </>
        ) : (
          <>This calendar date has its own recurring listening footprint.</>
        ),
      detailStart: formatCalendarDate(record.calendarDate),
      detailEnd: `${record.years} ${record.years === 1 ? "year" : "years"} represented`,
      orbitValue: numberFormatter.format(record.plays),
      orbitLabel: "plays",
    });
  }

  if (behavior.fastestObsession) {
    const record = behavior.fastestObsession;
    spotlights.push({
      kicker: "Fastest obsession",
      stat: formatDuration(record.elapsedMinutes),
      headline: (
        <>
          <q>{record.track}</q> by {record.artist} reached its tenth play faster
          than any other track.
        </>
      ),
      detailStart: "First play",
      detailEnd: "Tenth play",
      orbitValue: numberFormatter.format(record.elapsedMinutes),
      orbitLabel: "minutes",
    });
  }

  if (behavior.peakHour) {
    const record = behavior.peakHour;
    spotlights.push({
      kicker: "Daily listening rush hour",
      stat: formatHour(record.hour),
      headline: (
        <>
          More completed scrobbles land in this hour than anywhere else in your
          day.
        </>
      ),
      detailStart: "America/Chicago",
      detailEnd: `${numberFormatter.format(record.plays)} plays`,
      orbitValue: numberFormatter.format(record.plays),
      orbitLabel: "plays",
    });
  }

  if (seasonal.biggestMonth) {
    const record = seasonal.biggestMonth;
    spotlights.push({
      kicker: "Biggest month on record",
      stat: `${numberFormatter.format(record.plays)} plays`,
      headline: (
        <>
          <q>{formatMonth(record.month)}</q> packed more listening into one
          calendar month than any other.
        </>
      ),
      detailStart: "Monthly high",
      detailEnd: formatMonth(record.month),
      orbitValue: numberFormatter.format(record.plays),
      orbitLabel: "plays",
    });
  }

  return spotlights;
}

export function FeaturedInsight({
  records,
  behavior,
  seasonal,
}: {
  records: LifetimeRecords;
  behavior: BehaviorStats;
  seasonal: SeasonalStats;
}) {
  const spotlights = useMemo(
    () => buildSpotlights(records, behavior, seasonal),
    [behavior, records, seasonal],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cycleReset, setCycleReset] = useState(0);
  const activeSpotlight = spotlights[activeIndex % spotlights.length];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || spotlights.length < 2) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % spotlights.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [cycleReset, paused, reducedMotion, spotlights.length]);

  if (!activeSpotlight) return null;

  function selectSpotlight(index: number) {
    setActiveIndex(index);
    setCycleReset((current) => current + 1);
  }

  function showNextSpotlight() {
    setActiveIndex((current) => (current + 1) % spotlights.length);
    setCycleReset((current) => current + 1);
  }

  return (
    <article
      className="featured-card"
      tabIndex={0}
      aria-label={`Featured statistic: ${activeSpotlight.kicker}. Click to show the next statistic.`}
      onClick={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("button")
        )
          return;
        showNextSpotlight();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        showNextSpotlight();
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
    >
      <div
        className="featured-copy featured-slide"
        key={activeSpotlight.kicker}
      >
        <div className="card-kicker">
          <span className="kicker-dot" /> {activeSpotlight.kicker}
        </div>
        <p className="hero-stat">{activeSpotlight.stat}</p>
        <h2>{activeSpotlight.headline}</h2>
        <div className="rediscovery-dates">
          <span>{activeSpotlight.detailStart}</span>
          <span className="date-line" />
          <span>{activeSpotlight.detailEnd}</span>
        </div>
      </div>

      <div
        className="featured-orbit featured-slide"
        key={`orbit-${activeSpotlight.kicker}`}
        aria-hidden="true"
      >
        <div className="orbit-ring ring-one" />
        <div className="orbit-ring ring-two" />
        <div className="orbit-core">
          <span>{activeSpotlight.orbitValue}</span>
          <small>{activeSpotlight.orbitLabel}</small>
        </div>
      </div>

      <div className="featured-pagination" aria-label="Featured statistics">
        {spotlights.map((spotlight, index) => (
          <button
            type="button"
            className={index === activeIndex ? "active" : ""}
            key={spotlight.kicker}
            onClick={() => selectSpotlight(index)}
            aria-label={`Show ${spotlight.kicker}`}
            aria-current={index === activeIndex ? "true" : undefined}
          />
        ))}
      </div>
    </article>
  );
}
