"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function dashboardViewHref(path: "/" | "/command-center", range?: string) {
  return range && range !== "12-months" ? `${path}?range=${range}` : path;
}

function commandModeHref(path: string, commandMode: boolean) {
  return commandMode ? `${path}?view=command-center` : path;
}

export function AppNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active =
    pathname === "/command-center"
      ? "command-center"
      : pathname === "/spotify-deep-dive"
        ? "spotify"
        : "dashboard";
  const dashboardRange = searchParams.get("range") ?? undefined;
  const isDashboardView = active === "dashboard" || active === "command-center";
  const isCommandCenter =
    active === "command-center" ||
    searchParams.get("view") === "command-center";
  const dashboardHref = isCommandCenter
    ? dashboardViewHref("/command-center", dashboardRange)
    : dashboardViewHref("/", dashboardRange);
  const spotifyHref = commandModeHref("/spotify-deep-dive", isCommandCenter);
  const toggleHref = isDashboardView
    ? dashboardViewHref(
        isCommandCenter ? "/" : "/command-center",
        dashboardRange,
      )
    : commandModeHref(pathname, !isCommandCenter);
  const toggleDescription = isCommandCenter
    ? "Switch to the full Dashboard layout"
    : "Switch to the compact Command Center layout";

  useEffect(() => {
    document.documentElement.classList.toggle("command-mode", isCommandCenter);
    return () => document.documentElement.classList.remove("command-mode");
  }, [isCommandCenter]);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link
          className="brand"
          href={dashboardHref}
          aria-label="BeenJammin Last.fm dashboard"
        >
          <span className="brand-mark brand-letter" aria-hidden="true">
            B
          </span>
          <span>BeenJammin</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <Link
            href={dashboardHref}
            className={isDashboardView ? "nav-link active" : "nav-link"}
            aria-current={isDashboardView ? "page" : undefined}
          >
            Last.fm Dashboard
          </Link>
          <Link
            href={spotifyHref}
            className={active === "spotify" ? "nav-link active" : "nav-link"}
            aria-current={active === "spotify" ? "page" : undefined}
          >
            <span className="nav-full">Spotify Deep Dive</span>
            <span className="nav-short">Spotify</span>
          </Link>
        </nav>

        <Link
          className={`view-toggle${isCommandCenter ? " active" : ""}`}
          href={toggleHref}
          aria-label={toggleDescription}
          data-tooltip={toggleDescription}
          title={toggleDescription}
        >
          <span className="view-toggle-label">Command Center</span>
          <span className="view-toggle-track" aria-hidden="true">
            <span />
          </span>
        </Link>
      </div>
    </header>
  );
}
