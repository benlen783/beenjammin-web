"use client";

import { useMemo } from "react";

import { BaseChart } from "@/charts/BaseChart";
import type { TimelinePoint } from "@/lib/dashboard-types";

export function ListeningTimeline({ points }: { points: TimelinePoint[] }) {
  const option = useMemo(
    () => ({
      animationDuration: 500,
      grid: { left: 6, right: 8, top: 22, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
        textStyle: { color: "#fff" },
      },
      xAxis: {
        type: "category" as const,
        boundaryGap: false,
        data: points.map((point) => point.period),
        axisLabel: { hideOverlap: true, margin: 14 },
      },
      yAxis: {
        type: "value" as const,
        minInterval: 1,
        axisLabel: { formatter: (value: number) => value.toLocaleString() },
      },
      series: [
        {
          name: "Plays",
          type: "line" as const,
          data: points.map((point) => point.plays),
          showSymbol: false,
          smooth: 0.26,
          lineStyle: { width: 2.5, color: "#1ed760" },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(30,215,96,.30)" },
                { offset: 1, color: "rgba(30,215,96,0)" },
              ],
            },
          },
          emphasis: { focus: "series" as const },
        },
      ],
    }),
    [points],
  );

  return (
    <BaseChart
      option={option}
      className="timeline-chart"
      ariaLabel="Listening activity over the selected date range"
    />
  );
}
