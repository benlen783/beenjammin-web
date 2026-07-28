import { describe, expect, it } from "vitest";

import { enforceRateLimit } from "@/lib/server/rate-limit";

describe("application rate limiting", () => {
  it("returns 429 and Retry-After after the configured request budget", () => {
    const request = new Request("https://beenjammin.example/api/public", {
      headers: { "X-Real-IP": "192.0.2.10" },
    });
    const scope = `test-${crypto.randomUUID()}`;
    const policy = { clientLimit: 2, globalLimit: 10, windowMs: 60_000 };

    expect(enforceRateLimit(request, scope, policy)).toBeNull();
    expect(enforceRateLimit(request, scope, policy)).toBeNull();
    const response = enforceRateLimit(request, scope, policy);

    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
