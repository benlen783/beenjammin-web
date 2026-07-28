import { z } from "zod";

export const SPOTIFY_DEEP_DIVE_SUMMARY_VERSION = 2;
export const SPOTIFY_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;

const appleDeviceNames: Record<string, string> = {
  "iphone12,3": "iPhone 11 Pro",
  "iphone10,1": "iPhone 8",
  "iphone8,1": "iPhone 6s",
  "iphone7,2": "iPhone 6",
};

export function spotifyDeviceLabel(platform: string) {
  const raw = platform.trim();
  const lower = raw.toLocaleLowerCase("en-US");

  if (lower.includes("echo_dot") || lower.includes("amazon_salmon"))
    return "Amazon Echo Dot";
  if (lower.includes("xbox_one") || lower === "xbox") return "Xbox One";
  if (lower.includes("ps4") || lower.includes("scei")) return "PlayStation 4";
  if (lower.includes("chromecast_ultra")) return "Chromecast Ultra";
  if (lower.includes("comcast") || lower.includes("xfinity"))
    return "Xfinity TV";

  const rokuModel = raw.match(/roku;([^;]+)/i)?.[1];
  if (rokuModel) return `Roku ${rokuModel.toUpperCase()}`;

  const samsungModel = raw.match(/tizen_tv samsung;([^;]+)/i)?.[1];
  if (samsungModel) return `Samsung ${samsungModel.toUpperCase()} TV`;
  if (lower === "tizen" || lower.includes("tizen_tv")) return "Samsung TV";

  const iphoneIdentifier = raw.match(/\((iPhone\d+,\d+)/i)?.[1];
  if (iphoneIdentifier) {
    return (
      appleDeviceNames[iphoneIdentifier.toLocaleLowerCase("en-US")] ??
      `iPhone (${iphoneIdentifier})`
    );
  }
  const ipadIdentifier = raw.match(/\((iPad\d+,\d+)/i)?.[1];
  if (ipadIdentifier) {
    if (ipadIdentifier.toLocaleLowerCase("en-US").startsWith("ipad6,8"))
      return "iPad Pro 12.9-inch (1st generation)";
    return `iPad (${ipadIdentifier})`;
  }
  if (lower.includes("ios")) return "iPhone or iPad (model unavailable)";

  if (lower.includes("android")) {
    const details = raw.match(/\(([^)]+)\)/)?.[1];
    const model = details?.split(",").at(-1)?.trim();
    return model && model.length > 1 ? model : "Android device";
  }
  if (lower.includes("windows")) return "Windows PC";
  if (lower.includes("mac") || lower.includes("darwin")) return "Mac";
  if (lower.includes("linux")) return "Linux computer";
  if (lower.includes("web_player") || lower.includes("web player"))
    return "Web browser";

  return raw || "Unknown device";
}

const trackInsightSchema = z.object({
  track: z.string().min(1).max(500),
  artist: z.string().min(1).max(500),
  events: z.number().int().nonnegative(),
  value: z.number().finite().nonnegative(),
});

const aggregateRowSchema = z.object({
  label: z.string().min(1).max(500),
  events: z.number().int().nonnegative(),
  milliseconds: z.number().finite().nonnegative(),
});

const tripInsightSchema = z.object({
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  days: z.number().int().min(1).max(100_000),
  events: z.number().int().min(1),
  uniqueTracks: z.number().int().nonnegative().max(10_000_000).default(0),
  milliseconds: z.number().finite().nonnegative(),
  countries: z.array(aggregateRowSchema).min(1).max(30),
  topTrack: trackInsightSchema.nullable(),
});

const dayHourSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  events: z.number().int().nonnegative(),
  milliseconds: z.number().finite().nonnegative(),
});

const sessionLengthSchema = z.object({
  label: z.string().min(1).max(100),
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  milliseconds: z.number().finite().nonnegative(),
});

const albumEngagementSchema = z.object({
  album: z.string().min(1).max(500),
  artist: z.string().min(1).max(500),
  events: z.number().int().nonnegative(),
  milliseconds: z.number().finite().nonnegative(),
  completedEvents: z.number().int().nonnegative(),
  uniqueTracks: z.number().int().nonnegative(),
});

const concentrationSchema = z.object({
  rank: z.number().int().positive().max(10_000_000),
  percentage: z.number().finite().min(0).max(100),
  milliseconds: z.number().finite().nonnegative(),
});

const skipTimingSchema = z.object({
  label: z.string().min(1).max(100),
  events: z.number().int().nonnegative(),
  percentage: z.number().finite().min(0).max(100),
});

const sessionAttentionSchema = z.object({
  label: z.string().min(1).max(100),
  events: z.number().int().nonnegative(),
  skippedEvents: z.number().int().nonnegative(),
  completedEvents: z.number().int().nonnegative(),
});

const listeningModeSchema = sessionAttentionSchema.extend({
  milliseconds: z.number().finite().nonnegative(),
});

const replayDelaySchema = z.object({
  label: z.string().min(1).max(100),
  events: z.number().int().nonnegative(),
  percentage: z.number().finite().min(0).max(100),
});

const sessionVarietySchema = z.object({
  label: z.string().min(1).max(100),
  sessions: z.number().int().nonnegative(),
  averageMinutes: z.number().finite().nonnegative(),
  averageArtists: z.number().finite().nonnegative(),
  averageTracks: z.number().finite().nonnegative(),
  averagePlays: z.number().finite().nonnegative(),
});

export const spotifyDeepDiveSummarySchema = z
  .object({
    version: z.literal(SPOTIFY_DEEP_DIVE_SUMMARY_VERSION),
    coverageStartedAt: z.iso.datetime({ offset: true }),
    coverageEndedAt: z.iso.datetime({ offset: true }),
    totalEvents: z.number().int().nonnegative().max(10_000_000),
    totalMilliseconds: z.number().finite().nonnegative(),
    offlinePercentage: z.number().finite().min(0).max(100),
    shufflePercentage: z.number().finite().min(0).max(100),
    skipPercentage: z.number().finite().min(0).max(100),
    completionPercentage: z.number().finite().min(0).max(100),
    incognitoPercentage: z.number().finite().min(0).max(100),
    mostSkipped: z.array(trackInsightSchema).max(5),
    highestSkipRate: z.array(trackInsightSchema).max(10),
    mostReliableCompletion: z.array(trackInsightSchema).max(10),
    loveHateTrack: z.array(trackInsightSchema).max(5),
    shuffleCasualty: z.array(trackInsightSchema).max(5),
    topListeningTime: z.array(trackInsightSchema).max(5),
    mostPlayedOnShuffle: z.array(trackInsightSchema).max(5),
    quickestSkips: z.array(trackInsightSchema).max(5),
    directChoiceFavorites: z.array(trackInsightSchema).max(5),
    topAlbumsByTime: z.array(aggregateRowSchema).max(5),
    platforms: z.array(aggregateRowSchema).max(500),
    countries: z.array(aggregateRowSchema).max(300),
    usualCountry: z.string().min(1).max(100).nullable().default(null),
    trips: z.array(tripInsightSchema).max(500).default([]),
    reasonStarts: z.array(aggregateRowSchema).max(100),
    reasonEnds: z.array(aggregateRowSchema).max(100),
    listeningByDayHour: z.array(dayHourSchema).max(168).default([]),
    sessionLengths: z.array(sessionLengthSchema).max(20).default([]),
    albumEngagement: z.array(albumEngagementSchema).max(20).default([]),
    listeningConcentration: z.array(concentrationSchema).max(20).default([]),
    skipTiming: z.array(skipTimingSchema).max(20).default([]),
    sessionAttention: z.array(sessionAttentionSchema).max(20).default([]),
    listeningModes: z.array(listeningModeSchema).max(20).default([]),
    replayDelays: z.array(replayDelaySchema).max(20).default([]),
    sessionVariety: z.array(sessionVarietySchema).max(20).default([]),
    durationByMonth: z
      .array(
        z.object({
          month: z.string().regex(/^\d{4}-\d{2}$/),
          milliseconds: z.number().finite().nonnegative(),
          events: z.number().int().nonnegative(),
        }),
      )
      .max(1_200),
  })
  .superRefine((summary, context) => {
    if (
      new Date(summary.coverageStartedAt) > new Date(summary.coverageEndedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverageEndedAt"],
        message: "Coverage end must not precede coverage start.",
      });
    }
  });

export type SpotifyDeepDiveSummary = z.infer<
  typeof spotifyDeepDiveSummarySchema
>;
