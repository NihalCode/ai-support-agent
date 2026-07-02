import { describe, expect, it } from "vitest";
import { containsForbiddenSupportCopy, sanitizeSupportText } from "@/lib/chat/support-sanitize";

describe("support-sanitize", () => {
  it("strips forbidden labels in support mode", () => {
    const raw = "Checking MCP and Agent Trace on localhost";
    expect(sanitizeSupportText(raw, false)).not.toMatch(/MCP|Agent Trace|localhost/);
  });

  it("preserves text in developer mode", () => {
    const raw = "MCP server connected";
    expect(sanitizeSupportText(raw, true)).toBe(raw);
  });

  it("detects forbidden copy", () => {
    expect(containsForbiddenSupportCopy("RAG local fallback")).toBe(true);
    expect(containsForbiddenSupportCopy("Connected to Slack")).toBe(false);
  });
});
