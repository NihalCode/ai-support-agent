import { describe, expect, it } from "vitest";

import { enrichSlackThread } from "@/lib/support/slack/enrich-thread";

describe("enrichSlackThread", () => {
  it("returns ack for short non-actionable messages", async () => {
    const result = await enrichSlackThread({
      channelId: "C123",
      threadTs: "111.222",
      latestMessage: "hi",
    });
    expect(result.mode).toBe("ack");
    expect(result.text).toBe("");
  });
});
