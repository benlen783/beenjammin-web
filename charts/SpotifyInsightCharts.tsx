"use client";

import { useMemo } from "react";

import { BaseChart } from "@/charts/BaseChart";
import type { SpotifyDeepDiveSummary } from "@/lib/spotify-deep-dive";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SpotifyWeekHeatmap({
  points,
}: {
  points: SpotifyDeepDiveSummary["listeningByDayHour"];
}) {
  const option = useMemo(() => {
    const values = points.map((point) => point.milliseconds / 3_600_000);
    const maximum = Math.max(1, ...values);

    return {
      grid: { left: 42, right: 12, top: 8, bottom: 32 },
      tooltip: {
        position: "top" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        formatter: (parameters: unknown) => {
          const parameter = parameters as {
            data: { value: [number, number, number]; events: number };
          };
          const [hour, day, hours] = parameter.data.value;
          return `${DAYS[day]} ${hour.toString().padStart(2, "0")}:00<br/><b>${hours.toFixed(2)}h</b> · ${parameter.data.events.toLocaleString()} plays`;
        },
      },
      xAxis: {
        type: "category" as const,
        data: Array.from({ length: 24 }, (_, hour) => hour),
        axisLabel: {
          interval: 0,
          formatter: (value: string) => {
            const hour = Number(value);
            return hour % 3 === 0
              ? hour === 0
                ? "12a"
                : hour === 12
                  ? "12p"
                  : `${hour % 12}${hour < 12 ? "a" : "p"}`
              : "";
          },
        },
      },
      yAxis: {
        type: "category" as const,
        data: DAYS,
      },
      visualMap: {
        min: 0,
        max: maximum,
        show: false,
        inRange: { color: ["#202321", "#155b31", "#1ed760"] },
      },
      series: [
        {
          name: "Listening hours",
          type: "heatmap" as const,
          data: points.map((point) => ({
            value: [
              point.hour,
              point.day,
              Number((point.milliseconds / 3_600_000).toFixed(2)),
            ],
            events: point.events,
          })),
          itemStyle: {
            borderColor: "#121212",
            borderWidth: 3,
            borderRadius: 4,
          },
          emphasis: {
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(30,215,96,.35)" },
          },
        },
      ],
    };
  }, [points]);

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Spotify listening hours by UTC weekday and hour"
    />
  );
}

export function SpotifySessionLengthChart({
  bins,
}: {
  bins: SpotifyDeepDiveSummary["sessionLengths"];
}) {
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 12, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
      },
      xAxis: { type: "category" as const, data: bins.map((bin) => bin.label) },
      yAxis: {
        type: "value" as const,
        name: "Sessions",
        nameTextStyle: { color: "#777", fontSize: 9 },
        minInterval: 1,
      },
      series: [
        {
          name: "Sessions",
          type: "bar" as const,
          data: bins.map((bin) => bin.sessions),
          barMaxWidth: 42,
          itemStyle: { color: "#52a8ff", borderRadius: [5, 5, 0, 0] },
        },
      ],
    }),
    [bins],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Spotify listening sessions grouped by total music duration"
    />
  );
}

export function SpotifyAlbumEngagementChart({
  albums,
}: {
  albums: SpotifyDeepDiveSummary["albumEngagement"];
}) {
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 12, top: 12, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        formatter: (parameters: unknown) => {
          const parameter = parameters as {
            data: {
              value: [number, number, number];
              album: string;
              artist: string;
              events: number;
            };
          };
          const [hours, completion, uniqueTracks] = parameter.data.value;
          return `<b>${parameter.data.album}</b><br/>${parameter.data.artist}<br/>${hours.toFixed(2)}h · ${completion.toFixed(1)}% completed<br/>${uniqueTracks} tracks · ${parameter.data.events.toLocaleString()} plays`;
        },
      },
      xAxis: {
        type: "value" as const,
        name: "Listening hours",
        nameLocation: "middle" as const,
        nameGap: 24,
        nameTextStyle: { color: "#777", fontSize: 9 },
        axisLabel: { formatter: (value: number) => `${value}h` },
      },
      yAxis: {
        type: "value" as const,
        name: "Completion",
        min: 0,
        max: 100,
        nameTextStyle: { color: "#777", fontSize: 9 },
        axisLabel: { formatter: (value: number) => `${value}%` },
      },
      series: [
        {
          name: "Albums",
          type: "scatter" as const,
          data: albums.map((album) => ({
            value: [
              Number((album.milliseconds / 3_600_000).toFixed(2)),
              album.events
                ? Number(
                    ((album.completedEvents / album.events) * 100).toFixed(1),
                  )
                : 0,
              album.uniqueTracks,
            ],
            album: album.album,
            artist: album.artist,
            events: album.events,
          })),
          symbolSize: (value: number[]) =>
            Math.min(34, 8 + Math.sqrt(value[2] ?? 0) * 4),
          itemStyle: { color: "#8f72ff", opacity: 0.82 },
          emphasis: { focus: "series" as const, scale: 1.25 },
        },
      ],
    }),
    [albums],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Top Spotify albums by listening time, completion rate, and unique tracks"
    />
  );
}

export function SpotifyConcentrationChart({
  points,
}: {
  points: SpotifyDeepDiveSummary["listeningConcentration"];
}) {
  const option = useMemo(() => {
    const maximum = Math.max(
      10,
      Math.ceil(Math.max(0, ...points.map((point) => point.percentage)) / 5) *
        5,
    );

    return {
      grid: { left: 8, right: 8, top: 12, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        valueFormatter: (value: unknown) =>
          `${Number(value ?? 0).toFixed(1)}% of listening time`,
      },
      xAxis: {
        type: "category" as const,
        data: points.map((point) => `Top ${point.rank}`),
      },
      yAxis: {
        type: "value" as const,
        min: 0,
        max: maximum,
        axisLabel: { formatter: (value: number) => `${value}%` },
      },
      series: [
        {
          name: "Share of listening time",
          type: "bar" as const,
          data: points.map((point) => Number(point.percentage.toFixed(1))),
          barMaxWidth: 54,
          label: {
            show: true,
            position: "top" as const,
            color: "#b3b3b3",
            formatter: "{c}%",
          },
          itemStyle: { color: "#f5b84b", borderRadius: [5, 5, 0, 0] },
        },
      ],
    };
  }, [points]);

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Percentage of Spotify listening time concentrated in the top tracks"
    />
  );
}

export function SpotifySkipTimingChart({
  bins,
}: {
  bins: SpotifyDeepDiveSummary["skipTiming"];
}) {
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 12, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
      },
      xAxis: { type: "category" as const, data: bins.map((bin) => bin.label) },
      yAxis: {
        type: "value" as const,
        name: "Skipped plays",
        minInterval: 1,
        nameTextStyle: { color: "#777", fontSize: 9 },
      },
      series: [
        {
          name: "Skipped plays",
          type: "bar" as const,
          data: bins.map((bin) => bin.events),
          barMaxWidth: 44,
          itemStyle: { color: "#ff7d8e", borderRadius: [5, 5, 0, 0] },
        },
      ],
    }),
    [bins],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Skipped Spotify plays grouped by seconds heard before skipping"
    />
  );
}

export function SpotifySessionAttentionChart({
  phases,
}: {
  phases: SpotifyDeepDiveSummary["sessionAttention"];
}) {
  const completion = phases.map((phase) =>
    phase.events ? (phase.completedEvents / phase.events) * 100 : 0,
  );
  const skips = phases.map((phase) =>
    phase.events ? (phase.skippedEvents / phase.events) * 100 : 0,
  );
  const option = useMemo(
    () => ({
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: "#8c8c8c", fontSize: 9 },
      },
      grid: { left: 8, right: 8, top: 34, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        valueFormatter: (value: unknown) => `${Number(value ?? 0).toFixed(1)}%`,
      },
      xAxis: {
        type: "category" as const,
        data: phases.map((phase) => phase.label),
      },
      yAxis: {
        type: "value" as const,
        min: 0,
        max: 100,
        axisLabel: { formatter: (value: number) => `${value}%` },
      },
      series: [
        {
          name: "Completed",
          type: "bar" as const,
          data: completion.map((value) => Number(value.toFixed(1))),
          itemStyle: { color: "#1ed760", borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "Skipped",
          type: "bar" as const,
          data: skips.map((value) => Number(value.toFixed(1))),
          itemStyle: { color: "#ff7d8e", borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [completion, phases, skips],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Spotify completion and skip rates across the opening, middle, and closing thirds of listening sessions"
    />
  );
}

export function SpotifyListeningModeChart({
  modes,
}: {
  modes: SpotifyDeepDiveSummary["listeningModes"];
}) {
  const option = useMemo(
    () => ({
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: "#8c8c8c", fontSize: 9 },
      },
      grid: { left: 8, right: 8, top: 34, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        valueFormatter: (value: unknown) => `${Number(value ?? 0).toFixed(1)}%`,
      },
      xAxis: {
        type: "category" as const,
        data: modes.map((mode) => mode.label),
      },
      yAxis: {
        type: "value" as const,
        min: 0,
        max: 100,
        axisLabel: { formatter: (value: number) => `${value}%` },
      },
      series: [
        {
          name: "Completed",
          type: "bar" as const,
          data: modes.map((mode) =>
            Number(
              (mode.events
                ? (mode.completedEvents / mode.events) * 100
                : 0
              ).toFixed(1),
            ),
          ),
          itemStyle: { color: "#1ed760", borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "Skipped",
          type: "bar" as const,
          data: modes.map((mode) =>
            Number(
              (mode.events
                ? (mode.skippedEvents / mode.events) * 100
                : 0
              ).toFixed(1),
            ),
          ),
          itemStyle: { color: "#8f72ff", borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [modes],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Spotify completion and skip rates for direct choices, shuffled plays, and other starts"
    />
  );
}

export function SpotifyReplayDelayChart({
  bins,
}: {
  bins: SpotifyDeepDiveSummary["replayDelays"];
}) {
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 18, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        valueFormatter: (value: unknown) =>
          `${Number(value ?? 0).toFixed(1)}% of repeat plays`,
      },
      xAxis: { type: "category" as const, data: bins.map((bin) => bin.label) },
      yAxis: {
        type: "value" as const,
        axisLabel: { formatter: (value: number) => `${value}%` },
      },
      series: [
        {
          name: "Repeat plays",
          type: "bar" as const,
          data: bins.map((bin) => Number(bin.percentage.toFixed(1))),
          barMaxWidth: 44,
          label: {
            show: true,
            position: "top" as const,
            color: "#b3b3b3",
            formatter: "{c}%",
          },
          itemStyle: { color: "#52a8ff", borderRadius: [5, 5, 0, 0] },
        },
      ],
    }),
    [bins],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Time between consecutive Spotify plays of the same song"
    />
  );
}

export function SpotifySessionVarietyChart({
  points,
}: {
  points: SpotifyDeepDiveSummary["sessionVariety"];
}) {
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 12, top: 18, bottom: 26, containLabel: true },
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        formatter: (parameters: unknown) => {
          const parameter = parameters as {
            data: {
              value: [number, number, number];
              binLabel: string;
              tracks: number;
              plays: number;
            };
          };
          const [minutes, artists, sessions] = parameter.data.value;
          return `<b>${parameter.data.binLabel} sessions</b><br/>${minutes.toFixed(1)} average minutes<br/>${artists.toFixed(1)} artists · ${parameter.data.tracks.toFixed(1)} tracks<br/>${parameter.data.plays.toFixed(1)} plays · ${sessions.toLocaleString()} sessions`;
        },
      },
      xAxis: {
        type: "value" as const,
        name: "Average minutes",
        nameLocation: "middle" as const,
        nameGap: 24,
        nameTextStyle: { color: "#777", fontSize: 9 },
      },
      yAxis: {
        type: "value" as const,
        name: "Unique artists",
        nameTextStyle: { color: "#777", fontSize: 9 },
      },
      series: [
        {
          name: "Session groups",
          type: "scatter" as const,
          data: points
            .filter((point) => point.sessions > 0)
            .map((point) => ({
              value: [
                Number(point.averageMinutes.toFixed(1)),
                Number(point.averageArtists.toFixed(1)),
                point.sessions,
              ],
              binLabel: point.label,
              tracks: point.averageTracks,
              plays: point.averagePlays,
            })),
          symbolSize: (value: number[]) =>
            Math.min(38, 10 + Math.log10((value[2] ?? 0) + 1) * 7),
          label: {
            show: true,
            position: "top" as const,
            color: "#b3b3b3",
            fontSize: 8,
            formatter: (parameters: unknown) =>
              (parameters as { data: { binLabel: string } }).data.binLabel,
          },
          itemStyle: { color: "#f5b84b", opacity: 0.84 },
        },
      ],
    }),
    [points],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-analysis-chart"
      ariaLabel="Average session duration and unique artist variety by session-length group"
    />
  );
}
