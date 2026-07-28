"use client";

import { useMemo } from "react";

import { BaseChart } from "@/charts/BaseChart";
import type { SpotifyDeepDiveSummary } from "@/lib/spotify-deep-dive";

export function SpotifyDurationChart({
  points,
}: {
  points: SpotifyDeepDiveSummary["durationByMonth"];
}) {
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 12, bottom: 22, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
      },
      xAxis: {
        type: "category" as const,
        data: points.map((point) => point.month),
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: "value" as const,
        name: "Hours",
        nameTextStyle: { color: "#777", fontSize: 9 },
        axisLabel: { formatter: (value: number) => `${value.toFixed(0)}h` },
      },
      series: [
        {
          name: "Listening hours",
          type: "bar" as const,
          data: points.map((point) =>
            Number((point.milliseconds / 3_600_000).toFixed(2)),
          ),
          tooltip: {
            valueFormatter: (value: unknown) =>
              `${Number(value ?? 0).toFixed(2)}h`,
          },
          barMaxWidth: 18,
          itemStyle: {
            color: "#1ed760",
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    }),
    [points],
  );

  return (
    <BaseChart
      option={option}
      className="spotify-duration-chart"
      ariaLabel="Monthly Spotify listening hours"
    />
  );
}
