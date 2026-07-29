import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/app/globals.css";
import { AppNav } from "@/components/AppNav";

export const metadata: Metadata = {
  title: {
    default: "BeenJammin — Listening history, in detail",
    template: "%s · BeenJammin",
  },
  description:
    "Published music analytics and browser-local tools for exploring listening history.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <Suspense fallback={<div className="topbar" aria-hidden="true" />}>
          <AppNav />
        </Suspense>
        {children}
        <footer className="site-footer">
          <nav aria-label="External links">
            <a
              href="https://benlenox.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Portfolio <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://github.com/benlen783"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
