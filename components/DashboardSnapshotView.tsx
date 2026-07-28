"use client";

import { useSearchParams } from "next/navigation";

import { CommandCenter } from "@/components/CommandCenter";
import { Dashboard } from "@/components/Dashboard";
import {
  parseDashboardRange,
  type DashboardData,
  type DashboardRange,
} from "@/lib/dashboard-types";

type SnapshotRanges = Record<DashboardRange, DashboardData>;

export function DashboardSnapshotView({
  ranges,
  mode,
}: {
  ranges: SnapshotRanges;
  mode: "dashboard" | "command-center";
}) {
  const searchParams = useSearchParams();
  const range = parseDashboardRange(searchParams.get("range") ?? undefined);
  const data = ranges[range];

  return mode === "command-center" ? (
    <CommandCenter data={data} range={range} />
  ) : (
    <Dashboard data={data} range={range} />
  );
}
