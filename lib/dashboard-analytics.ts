import { pageview } from "@vercel/analytics";

type DashboardSource = "lastfm" | "spotify";

const completionPaths: Record<DashboardSource, string> = {
  lastfm: "/completed/lastfm-dashboard",
  spotify: "/completed/spotify-dashboard",
};

export function trackDashboardCreated(source: DashboardSource) {
  if (typeof window === "undefined") return;

  const path = completionPaths[source];
  try {
    pageview({ route: path, path });
  } catch {
    // Analytics should never interrupt a completed dashboard.
  }
}
