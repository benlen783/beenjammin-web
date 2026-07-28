import type { Metadata } from "next";
import { Suspense } from "react";

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
      </body>
    </html>
  );
}
