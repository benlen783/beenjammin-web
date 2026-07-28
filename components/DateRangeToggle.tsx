import Link from "next/link";

import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard-types";

export function DateRangeToggle({
  selected,
  basePath = "/",
}: {
  selected: DashboardRange;
  basePath?: string;
}) {
  return (
    <div
      className="range-toggle"
      role="group"
      aria-label="Dashboard date range"
    >
      {DASHBOARD_RANGES.map((range) => (
        <Link
          key={range.key}
          href={
            range.key === "12-months"
              ? basePath
              : `${basePath}?range=${range.key}`
          }
          className={
            range.key === selected ? "range-option active" : "range-option"
          }
          aria-current={range.key === selected ? "true" : undefined}
          scroll={false}
        >
          <span className="range-full">{range.label}</span>
          <span className="range-short">{range.shortLabel}</span>
        </Link>
      ))}
    </div>
  );
}
