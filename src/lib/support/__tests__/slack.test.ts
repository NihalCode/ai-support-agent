import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApprovalBlocks } from "../slack/approval-cards";
import { signSlackBody, verifySlackSignature } from "../slack/signature";
import { appendSlackThreadMessage, getSlackThread } from "../slack/thread-store";
import type { ApprovalRequest } from "../types";

describe("Slack integration", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "slack-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("verifies Slack request signatures", () => {
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = "1700000000";
    const signature = signSlackBody("secret", timestamp, body);
    expect(
      verifySlackSignature({
        signingSecret: "secret",
        timestamp,
        signature,
        rawBody: body,
        nowSeconds: 1700000000,
      }).ok
    ).toBe(true);
    expect(
      verifySlackSignature({
        signingSecret: "secret",
        timestamp,
        signature: "v0=bad",
        rawBody: body,
        nowSeconds: 1700000000,
      }).ok
    ).toBe(false);
  });

  it("persists redacted Slack thread memory", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-secret-token-123456";
    await appendSlackThreadMessage({
      channelId: "C1",
      threadTs: "123.45",
      message: { role: "user", text: "token xoxb-secret-token-123456" },
    });
    const thread = await getSlackThread("C1", "123.45");
    expect(thread?.messages[0]?.text).not.toContain("xoxb-secret-token-123456");
    delete process.env.SLACK_BOT_TOKEN;
  });

  it("builds approval blocks without leaking preview secrets", () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-secret-token-123456";
    const approval: ApprovalRequest = {
      id: "approval-1",
      createdAt: new Date().toISOString(),
      status: "pending",
      action: { type: "ticket-comment", provider: "zendesk", ref: "ZD-1", body: "hi" },
      safety: {
        safetyClass: "WRITE_LOW_RISK",
        requiresApproval: true,
        blocked: false,
        reason: "Write action requires approval",
      },
      preview: "Post comment with xoxb-secret-token-123456",
    };
    const json = JSON.stringify(buildApprovalBlocks(approval));
    expect(json).toContain("approval-1");
    expect(json).not.toContain("xoxb-secret-token-123456");
    delete process.env.SLACK_BOT_TOKEN;
  });
});
