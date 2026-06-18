import { describe, it, expect } from "vitest";
import { withRetry } from "../retry";

const fast = { baseDelayMs: 1, maxDelayMs: 2 };

describe("withRetry", () => {
  it("retries on thrown errors then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    }, fast);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("retries on retryable resolved values (429/5xx) then returns last", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return { status: calls < 2 ? 503 : 200 };
      },
      fast
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not retry non-retryable resolved values (4xx)", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return { status: 404 };
      },
      fast
    );
    expect(result.status).toBe(404);
    expect(calls).toBe(1);
  });

  it("throws after exhausting retries", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("always");
      }, { ...fast, retries: 2 })
    ).rejects.toThrow("always");
    expect(calls).toBe(3); // initial + 2 retries
  });
});
