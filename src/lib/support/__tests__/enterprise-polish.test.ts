import { describe, it, expect } from "vitest";
import { redactMetadata } from "../enterprise/redact-metadata";
import { classifyApprovalMeta } from "../enterprise/stores/approval-store";
import { classifyAction } from "../safety";
import { buildDegradedSummaries, sanitizeHealthForSupportMode } from "../enterprise/degraded-mode";
import type { IntegrationHealthCard } from "../enterprise/types";
import { checklistProgress } from "../enterprise/setup-checklist";
import {
  isSupportMode,
  showDeveloperTools,
  supportModeLabel,
} from "../enterprise/mode-visibility";
import { appendAuditLog, listAuditLogs } from "../enterprise/stores/audit-store";
import { upsertSlackConversation, getSlackConversation } from "../enterprise/stores/slack-conversation-store";
import { upsertInvestigationLinks, getInvestigationLinks } from "../enterprise/stores/investigation-links-store";

describe("enterprise audit", () => {
  it("redacts secret metadata before storage", () => {
    const out = redactMetadata({ apiKey: "sk-secret1234567890", note: "ok" });
    expect(out?.apiKey).toBe("[REDACTED]");
    expect(out?.note).toBe("ok");
  });

  it("appends audit entries to file store", async () => {
    await appendAuditLog({
      action: "test:enterprise",
      targetSystem: "app",
      status: "completed",
    });
    const logs = await listAuditLogs({ action: "test:enterprise", limit: 5 });
    expect(logs.some((l) => l.action === "test:enterprise")).toBe(true);
  });
});

describe("approval metadata", () => {
  it("classifies zendesk public reply as medium risk", () => {
    const safety = classifyAction({ kind: "api", method: "POST", summary: "reply" });
    const meta = classifyApprovalMeta(
      { type: "ticket-comment", provider: "zendesk", ref: "ZD-1", body: "hi", public: true },
      safety
    );
    expect(meta.actionType).toBe("send_zendesk_reply");
    expect(meta.riskLevel).toBe("medium");
  });
});

describe("degraded mode", () => {
  it("sanitizes mock status outside test mode", () => {
    const prev = process.env.TEST_MODE;
    process.env.TEST_MODE = "false";
    const cards: IntegrationHealthCard[] = [
      {
        integration: "Jira",
        status: "mock",
        summary: "mock",
        actions: ["configure"],
      },
    ];
    const sanitized = sanitizeHealthForSupportMode(cards);
    expect(sanitized[0].status).toBe("not_configured");
    process.env.TEST_MODE = prev;
  });

  it("builds friendly degraded summaries", () => {
    const messages = buildDegradedSummaries(
      [
        {
          integration: "Jira",
          status: "not_configured",
          summary: "missing",
          actions: ["configure"],
        },
      ],
      false
    );
    expect(messages[0]?.friendly).toMatch(/Jira isn't connected/i);
  });
});

describe("setup checklist progress", () => {
  it("calculates percent complete", () => {
    const p = checklistProgress([
      { id: "a", label: "A", description: "", status: "complete" },
      { id: "b", label: "B", description: "", status: "pending" },
    ]);
    expect(p.percent).toBe(50);
  });
});

describe("mode visibility", () => {
  it("labels support vs developer mode", () => {
    expect(isSupportMode("client")).toBe(true);
    expect(supportModeLabel("client")).toBe("Support Mode");
    expect(showDeveloperTools("developer", true)).toBe(true);
    expect(showDeveloperTools("client", true)).toBe(false);
  });
});

describe("slack conversation store", () => {
  it("maps thread to same investigation session", async () => {
    await upsertSlackConversation({
      channelId: "C1",
      threadTs: "1.1",
      teamId: "T1",
      investigationSessionId: "sess-1",
      message: { role: "user", text: "help with ZD-1001" },
    });
    const conv = await getSlackConversation("T1", "C1", "1.1");
    expect(conv?.investigationSessionId).toBe("sess-1");
  });
});

describe("investigation links", () => {
  it("links zendesk ticket to investigation", async () => {
    await upsertInvestigationLinks("inv-1", {
      sourceSystem: "zendesk",
      zendeskTicketId: "ZD-1001",
      jiraIssueKey: "PROJ-9",
    });
    const links = await getInvestigationLinks("inv-1");
    expect(links?.zendeskTicketId).toBe("ZD-1001");
    expect(links?.jiraIssueKey).toBe("PROJ-9");
  });
});
