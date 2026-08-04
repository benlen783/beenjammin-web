const fallbackSiteUrl = "https://beenjammin-web.vercel.app";

function normalizeSiteUrl(value: string) {
  const url = value.startsWith("http") ? value : `https://${value}`;
  return url.replace(/\/$/, "");
}

export const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    fallbackSiteUrl,
);

export const siteName = "BeenJammin";
export const siteDescription =
  "Explore your complete Last.fm and Spotify listening history with interactive dashboards for top artists, tracks, listening patterns, streaks, and more.";
