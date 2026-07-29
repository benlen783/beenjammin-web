import type { Metadata } from "next";
import { Suspense } from "react";

import { CommandCenter } from "@/components/CommandCenter";
import { DashboardSnapshotView } from "@/components/DashboardSnapshotView";
import {
  getDashboardSnapshot,
  getDashboardSnapshots,
} from "@/lib/dashboard-snapshot";

export const metadata: Metadata = {
  title: "Command Center",
};

export default function CommandCenterPage() {
  const ranges = getDashboardSnapshots();
  const defaultData = getDashboardSnapshot("all-time");

  return (
    <main className="app-shell command-center-shell">
      <details className="example-data-panel">
        <summary>
          <span>Explore the example Command Center</span>
          <small>Published, read-only example data</small>
        </summary>
        <div className="example-data-content">
          <Suspense
            fallback={<CommandCenter data={defaultData} range="all-time" />}
          >
            <DashboardSnapshotView ranges={ranges} mode="command-center" />
          </Suspense>
        </div>
      </details>
    </main>
  );
}
