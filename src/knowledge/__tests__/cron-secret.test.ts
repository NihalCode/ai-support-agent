import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/cron/verify-cron-secret";

function requestWith(
  url: string,
  init?: { authorization?: string }
): NextRequest {
  const headers = new Headers();
  if (init?.authorization) headers.set("authorization", init.authorization);
  return new NextRequest(url, { headers });
}

describe("verifyCronSecret", () => {
  const prev = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("accepts Authorization Bearer header", () => {
    const req = requestWith("https://app.test/api/cron/knowledge-sync", {
      authorization: "Bearer test-cron-secret",
    });
    expect(verifyCronSecret(req)).toBe(true);
  });

  it("accepts ?secret= query param", () => {
    const req = requestWith("https://app.test/api/cron/knowledge-sync?secret=test-cron-secret");
    expect(verifyCronSecret(req)).toBe(true);
  });

  it("rejects wrong secret", () => {
    const req = requestWith("https://app.test/api/cron/knowledge-sync?secret=wrong");
    expect(verifyCronSecret(req)).toBe(false);
  });

  it("rejects when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    const req = requestWith("https://app.test/api/cron/knowledge-sync?secret=anything");
    expect(verifyCronSecret(req)).toBe(false);
  });
});
