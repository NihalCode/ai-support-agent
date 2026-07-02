import { describe, it, expect, beforeEach } from "vitest";
import {
  claimSlackEventDelivery,
  claimSlackInteraction,
  claimSlackUserMessageReply,
} from "@/lib/support/slack/event-dedup";

describe("Slack interaction dedupe", () => {
  beforeEach(() => {
    const g = globalThis as unknown as { __slackDedup?: Map<string, number> };
    g.__slackDedup = new Map();
  });

  it("dedupes the same Slack message delivery", async () => {
    const input = { eventId: "Ev123", channelId: "C1", messageTs: "1234.5678" };
    expect(await claimSlackEventDelivery(input)).toBe(true);
    expect(await claimSlackEventDelivery(input)).toBe(false);
  });

  it("dedupes duplicate user message replies", async () => {
    expect(await claimSlackUserMessageReply({ channelId: "C1", userMessageTs: "99.1" })).toBe(true);
    expect(await claimSlackUserMessageReply({ channelId: "C1", userMessageTs: "99.1" })).toBe(false);
  });

  it("dedupes Slack approve button retries", async () => {
    const input = {
      teamId: "T1",
      userId: "U1",
      actionTs: "123.456",
      approvalId: "appr-1",
      decision: "approve",
    };
    expect(await claimSlackInteraction(input)).toBe(true);
    expect(await claimSlackInteraction(input)).toBe(false);
  });
});
