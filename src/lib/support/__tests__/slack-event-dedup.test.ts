import { describe, expect, it } from "vitest";

import {
  claimSlackEventDelivery,
  claimSlackThreadReplySlot,
  claimSlackUserMessageReply,
  MAX_BOT_REPLIES_PER_THREAD,
} from "../slack/event-dedup";
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

  it("ignores channel thread follow-ups without @mention", () => {
    expect(
      shouldHandleSlackEvent("event_callback", {
        type: "message",
        channel: "C1",
        ts: "2.2",
        thread_ts: "1.1",
        text: "any update?",
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
});

describe("claimSlackEventDelivery", () => {
  it("dedupes the same Slack message delivery", async () => {
    const input = { eventId: "Ev123", channelId: "C1", messageTs: "111.222" };
    expect(await claimSlackEventDelivery(input)).toBe(true);
    expect(await claimSlackEventDelivery(input)).toBe(false);
  });
});

describe("claimSlackUserMessageReply", () => {
  it("allows only one bot reply per user message", async () => {
    const input = { channelId: "C9", userMessageTs: "999.001" };
    expect(await claimSlackUserMessageReply(input)).toBe(true);
    expect(await claimSlackUserMessageReply(input)).toBe(false);
  });
});

describe("claimSlackThreadReplySlot", () => {
  it(`allows at most ${MAX_BOT_REPLIES_PER_THREAD} bot replies per thread`, async () => {
    const input = { channelId: "C8", threadTs: "100.200" };
    expect(await claimSlackThreadReplySlot(input)).toBe(true);
    expect(await claimSlackThreadReplySlot(input)).toBe(true);
    expect(await claimSlackThreadReplySlot(input)).toBe(false);
  });
});
