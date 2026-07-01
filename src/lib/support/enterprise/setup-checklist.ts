import "server-only";

import { listUsers } from "@/lib/auth/user-store";
import { buildIntegrationHealthCards } from "./integration-health";
import { listKnowledgeSources } from "./stores/knowledge-source-store";
import { fetchApprovals } from "./stores/approval-store";
import { listAuditLogs } from "./stores/audit-store";
import type { SetupChecklistItem } from "./types";

export async function buildSetupChecklist(): Promise<SetupChecklistItem[]> {
  const cards = await buildIntegrationHealthCards(true);
  const byName = Object.fromEntries(cards.map((c) => [c.integration.toLowerCase(), c]));
  const users = await listUsers();
  const knowledge = await listKnowledgeSources();
  const approvals = await fetchApprovals();
  const audits = await listAuditLogs({ limit: 1 });

  function statusFor(
    integration: string,
    fallback: SetupChecklistItem["status"] = "pending"
  ): SetupChecklistItem["status"] {
    const card = byName[integration.toLowerCase()];
    if (!card) return fallback;
    if (card.status === "connected") return "complete";
    if (card.status === "mock" || card.status === "degraded") return "degraded";
    return "pending";
  }

  return [
    {
      id: "auth0",
      label: "Auth0 login",
      description: "Users can sign in with Auth0.",
      status: statusFor("Auth0"),
      settingsSection: "integrations",
    },
    {
      id: "google",
      label: "Google login",
      description: "Optional Google social login via Auth0 connection.",
      status: statusFor("Google Login", "degraded"),
      settingsSection: "integrations",
    },
    {
      id: "neon",
      label: "Neon DB",
      description: "Durable Postgres for users, approvals, audit, and Slack memory.",
      status: statusFor("Neon DB"),
      settingsSection: "integrations",
    },
    {
      id: "roles",
      label: "Assign roles",
      description: "At least one admin/owner after first login.",
      status: users.some((u) => u.role === "owner" || u.role === "admin") ? "complete" : "pending",
      settingsSection: "users",
    },
    {
      id: "jira",
      label: "Jira",
      description: "Search and link Jira issues to investigations.",
      status: statusFor("Jira"),
      settingsSection: "integrations",
    },
    {
      id: "zendesk",
      label: "Zendesk",
      description: "Create investigations from Zendesk tickets.",
      status: statusFor("Zendesk"),
      settingsSection: "integrations",
    },
    {
      id: "confluence",
      label: "Confluence",
      description: "Sync runbooks and docs into knowledge sources.",
      status: statusFor("Confluence"),
      settingsSection: "knowledge",
    },
    {
      id: "slack",
      label: "Slack bot",
      description: "Thread memory and investigation handoff from Slack.",
      status: statusFor("Slack"),
      settingsSection: "integrations",
    },
    {
      id: "knowledge",
      label: "Knowledge sources",
      description: "At least one indexed knowledge source.",
      status: knowledge.some((k) => k.status === "indexed") ? "complete" : knowledge.length ? "degraded" : "pending",
      settingsSection: "knowledge",
    },
    {
      id: "approval",
      label: "External write approval",
      description: "Approval queue is active for Jira/Zendesk/Slack writes.",
      status: "complete",
      actionLabel: "View approvals",
    },
    {
      id: "audit",
      label: "Audit logs",
      description: "Unified audit trail for admin review.",
      status: audits.length > 0 ? "complete" : "degraded",
      settingsSection: "audit",
    },
    {
      id: "investigation",
      label: "First investigation",
      description: "Run an investigation from chat or a ticket.",
      status: approvals.length > 0 || audits.some((a) => a.action.includes("investigation"))
        ? "complete"
        : "pending",
    },
  ];
}

export function checklistProgress(items: SetupChecklistItem[]): {
  complete: number;
  total: number;
  percent: number;
} {
  const complete = items.filter((i) => i.status === "complete").length;
  const total = items.length;
  return { complete, total, percent: total ? Math.round((complete / total) * 100) : 0 };
}
