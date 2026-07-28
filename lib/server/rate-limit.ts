import { isIP } from "node:net";

import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/response";

type RateLimitPolicy = {
  clientLimit: number;
  globalLimit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let checksSinceCleanup = 0;

function clientIdentifier(request: Request) {
  const candidates = [
    request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim(),
    request.headers.get("x-real-ip")?.trim(),
  ];

  return (
    candidates.find((candidate) => candidate && isIP(candidate)) ?? "unknown"
  );
}

function consume(key: string, limit: number, windowMs: number, now: number) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, resetAt: current.resetAt };
}

function cleanupExpiredBuckets(now: number) {
  checksSinceCleanup += 1;
  if (checksSinceCleanup < 500) return;
  checksSinceCleanup = 0;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * A bounded in-process safety net. Public deployments should also enable their
 * hosting provider's distributed rate limiting.
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  policy: RateLimitPolicy,
) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const globalResult = consume(
    `${scope}:global`,
    policy.globalLimit,
    policy.windowMs,
    now,
  );
  const clientResult = globalResult.allowed
    ? consume(
        `${scope}:client:${clientIdentifier(request)}`,
        policy.clientLimit,
        policy.windowMs,
        now,
      )
    : globalResult;

  if (globalResult.allowed && clientResult.allowed) return null;

  const resetAt = Math.max(globalResult.resetAt, clientResult.resetAt);
  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1_000));
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        "Retry-After": String(retryAfter),
      },
    },
  );
}
