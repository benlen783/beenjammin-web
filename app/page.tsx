import { Suspense } from "react";

import { Dashboard } from "@/components/Dashboard";
import { DashboardSnapshotView } from "@/components/DashboardSnapshotView";
import { LastFmDashboardExplorer } from "@/components/LastFmDashboardExplorer";
import {
  getDashboardSnapshot,
  getDashboardSnapshots,
} from "@/lib/dashboard-snapshot";

export default function DashboardPage() {
  const ranges = getDashboardSnapshots();
  const defaultData = getDashboardSnapshot("12-months");

  return (
    <main className="app-shell">
      <LastFmDashboardExplorer />
      <details className="example-data-panel">
        <summary>
          <span>Explore the example dashboard</span>
          <small>Published, read-only example data</small>
        </summary>
        <div className="example-data-content">
          <Suspense
            fallback={<Dashboard data={defaultData} range="12-months" />}
          >
            <DashboardSnapshotView ranges={ranges} mode="dashboard" />
          </Suspense>
        </div>
      </details>
    </main>
  );
}
