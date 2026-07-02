import { describe, expect, it } from "vitest";

import { claimSlackEventDelivery } from "../slack/event-dedup";
import { shouldHandleSlackEvent } from "../slack/event-filter";

describe("shouldHandleSlackEvent", () => {
  it("handles app_mention once", () => {
    expect(
      shouldHandleSlackEvent("event_callback", {
        type: "app_mention",
        channel: "C1",
        ts: "1.1",
        text: "<@U123> investigate AISUP5-1",
      })
    ).toBe(true);
  });

  it("skips message events that duplicate app_mention", () => {
    expect(
      shouldHandleSlackEvent("event_callback", {
        type: "message",
        channel: "C1",
        ts: "1.1",
        text: "<@U123> investigate AISUP5-1",
      })
    ).toBe(false);
  });

  it("handles DM messages without mention", () => {
    expect(
      shouldHandleSlackEvent("event_callback", {
        type: "message",
        channel: "D1",
        channel_type: "im",
        ts: "1.1",
        text: "401 on CTIX Open API",
      })
    ).toBe(true);
  });

  it("handles thread follow-ups only when a session exists", () => {
    const event = {
      type: "message" as const,
      channel: "C1",
      ts: "2.2",
      thread_ts: "1.1",
      text: "any update?",
    };
    expect(shouldHandleSlackEvent("event_callback", event, { threadHasSession: false })).toBe(
      false
    );
    expect(shouldHandleSlackEvent("event_callback", event, { threadHasSession: true })).toBe(true);
  });
});

describe("claimSlackEventDelivery", () => {
  it("dedupes the same Slack message delivery", async () => {
    const input = { eventId: "Ev123", channelId: "C1", messageTs: "111.222" };
    expect(await claimSlackEventDelivery(input)).toBe(true);
    expect(await claimSlackEventDelivery(input)).toBe(false);
  });
});
