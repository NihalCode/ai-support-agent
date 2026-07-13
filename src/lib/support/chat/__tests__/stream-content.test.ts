import { describe, expect, it } from "vitest";

import { applyChatContentEvent } from "../stream-content";

describe("streamed final response content", () => {
  it("does not prepend intent classification to the final response", () => {
    let content = "";
    content = applyChatContentEvent(content, {
      type: "intent_classified",
      messageId: "message-1",
      primaryIntent: "support.ticket_research",
      summary: "Searching Zendesk ticket history",
      confidence: "high",
      recommendedRoute: "zendesk",
    });
    content = applyChatContentEvent(content, {
      type: "token",
      messageId: "message-1",
      text: "Here is the final customer-ready response.",
    });

    expect(content).toBe("Here is the final customer-ready response.");
    expect(content).not.toContain("Searching Zendesk");
  });
});
