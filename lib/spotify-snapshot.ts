import { z } from "zod";

import spotifyJson from "@/content/analytics/spotify.json";
import { spotifyDeepDiveSummarySchema } from "@/lib/spotify-deep-dive";

export const publicSpotifySnapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  summary: spotifyDeepDiveSummarySchema,
});

export type PublicSpotifySnapshot = z.infer<typeof publicSpotifySnapshotSchema>;

const spotifySnapshot = publicSpotifySnapshotSchema.parse(spotifyJson);

export function getPublicSpotifySnapshot() {
  return spotifySnapshot;
}
