import { z } from "zod";

import { LASTFM_MAX_PUBLIC_PAGES } from "@/lib/config";
import {
  buildLastFmUserAgent,
  fetchLastFmPublicHistoryPage,
} from "@/lib/lastfm";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/response";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  username: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(LASTFM_MAX_PUBLIC_PAGES).default(1),
});

export async function GET(request: Request) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The Last.fm analyzer is not configured." },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    username: url.searchParams.get("username"),
    page: url.searchParams.get("page") ?? 1,
  });
  if (!parsed.success) {
    return Response.json(
      { error: "Enter a valid Last.fm username." },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const rateLimited = enforceRateLimit(request, "lastfm-public-history", {
    clientLimit: 120,
    globalLimit: 300,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const history = await fetchLastFmPublicHistoryPage({
      apiKey,
      username: parsed.data.username,
      page: parsed.data.page,
      userAgent: buildLastFmUserAgent(
        process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL,
      ),
    });
    return Response.json(history, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Last.fm failed.";
    const status = message.includes("error 6") ? 404 : 502;
    if (status === 502) console.error("Public Last.fm history failed", error);
    return Response.json(
      {
        error:
          status === 404
            ? "That Last.fm user was not found."
            : "Last.fm could not load that history. Try again shortly.",
      },
      { status, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
