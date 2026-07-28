"use client";

import { useMemo } from "react";

import { BaseChart } from "@/charts/BaseChart";
import type { DayHourPoint } from "@/lib/dashboard-types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DayHourHeatmap({ points }: { points: DayHourPoint[] }) {
  const option = useMemo(() => {
    const maximum = Math.max(1, ...points.map((point) => point.plays));

    return {
      animationDuration: 450,
      grid: { left: 42, right: 18, top: 8, bottom: 38 },
      tooltip: {
        position: "top" as const,
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
      },
      xAxis: {
        type: "category" as const,
        data: Array.from({ length: 24 }, (_, hour) =>
          hour === 0
            ? "12a"
            : hour === 12
              ? "12p"
              : hour % 3 === 0
                ? `${hour % 12}${hour < 12 ? "a" : "p"}`
                : "",
        ),
        splitArea: { show: false },
        axisLabel: { interval: 0 },
      },
      yAxis: {
        type: "category" as const,
        data: DAYS,
        splitArea: { show: false },
      },
      visualMap: {
        min: 0,
        max: maximum,
        show: false,
        inRange: { color: ["#202321", "#155b31", "#1ed760"] },
      },
      series: [
        {
          name: "Plays",
          type: "heatmap" as const,
          data: points.map((point) => [point.hour, point.day - 1, point.plays]),
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
      className="heatmap-chart"
      ariaLabel="Play count by day of week and hour of day"
    />
  );
}
