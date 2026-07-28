"use client";

import { useMemo } from "react";

import { BaseChart } from "@/charts/BaseChart";
import type { CalendarPoint } from "@/lib/dashboard-types";

export function CalendarHeatmap({
  points,
  startedAt,
  endedAt,
}: {
  points: CalendarPoint[];
  startedAt: string | null;
  endedAt: string | null;
}) {
  const option = useMemo(() => {
    const maximum = Math.max(1, ...points.map((point) => point.plays));
    const end = endedAt ?? new Date().toISOString().slice(0, 10);
    const start = startedAt ?? end;

    return {
      animationDuration: 450,
      tooltip: {
        backgroundColor: "rgba(24,24,24,.96)",
        borderColor: "rgba(255,255,255,.1)",
      },
      visualMap: {
        min: 0,
        max: maximum,
        show: false,
        inRange: { color: ["#202321", "#175e34", "#1ed760"] },
      },
      calendar: {
        top: 28,
        left: 18,
        right: 18,
        bottom: 16,
        range: [start, end],
        cellSize: ["auto" as const, 13],
        orient: "horizontal" as const,
        splitLine: { show: false },
        itemStyle: { color: "#1a1d1b", borderColor: "#121212", borderWidth: 3 },
        dayLabel: {
          color: "#777",
          firstDay: 1,
          nameMap: ["S", "M", "T", "W", "T", "F", "S"],
        },
        monthLabel: { color: "#777", margin: 12 },
        yearLabel: { show: false },
      },
      series: [
        {
          type: "heatmap" as const,
          coordinateSystem: "calendar" as const,
          data: points.map((point) => [point.day, point.plays]),
        },
      ],
    };
  }, [endedAt, points, startedAt]);

  return (
    <BaseChart
      option={option}
      className="calendar-chart"
      ariaLabel="Daily listening activity calendar"
    />
  );
}
