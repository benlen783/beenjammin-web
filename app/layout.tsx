import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/app/globals.css";
import { AppNav } from "@/components/AppNav";
import { siteDescription, siteName, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BeenJammin | Last.fm & Spotify Listening Stats",
    template: "%s | BeenJammin",
  },
  description: siteDescription,
  applicationName: siteName,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName,
    title: "BeenJammin | Last.fm & Spotify Listening Stats",
    description: siteDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "BeenJammin music listening history analytics",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BeenJammin | Last.fm & Spotify Listening Stats",
    description: siteDescription,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    description: siteDescription,
  };

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c"),
          }}
        />
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
