import "server-only";

import type { ApprovalAction } from "./types";
import { resolveRepoRef, ticketConnectorForRef, getJiraTickets } from "./connectors";
import { getConfig } from "./config";
import { audit } from "./audit";
import { redact, redactHeaders } from "./redact";
import { safeFetch } from "../ssrf";

/**
 * Single execution point for every approval-gated action. The approval queue
 * and write route call this only after a SafetyVerdict + explicit approval.
 * Read-only mode is enforced here as a final backstop.
 */

export interface ExecuteResult {
  ok: boolean;
  detail: string;
  url?: string;
  mock?: boolean;
}

export async function executeAction(
  action: ApprovalAction,
  opts: { approved: boolean } = { approved: false }
): Promise<ExecuteResult> {
  const cfg = getConfig();

  if (cfg.readOnly) {
    await audit({ action: `exec:${action.type}`, approved: false, details: "blocked: read-only mode" });
    throw new Error("Read-only mode is enabled (SUPPORT_AGENT_READ_ONLY=true). Writes are disabled.");
  }
  if (!opts.approved) {
    await audit({ action: `exec:${action.type}`, approved: false, details: "rejected: not approved" });
    throw new Error("Action not approved. Explicit user approval is required.");
  }

  switch (action.type) {
    case "ticket-comment": {
      const { ref: repoRef } = resolveRepoRef(action.repoUrl);
      const { connector, mock } = ticketConnectorForRef(action.ref, repoRef);
      const result = await connector.addComment(action.ref, action.body);
      await audit({
        action: "write:comment",
        target: action.ref,
        approved: true,
        provider: connector.id,
        safetyClass: "WRITE_LOW_RISK",
        details: `${mock ? "MOCK " : ""}posted to ${connector.id}: ${result.url ?? "ok"}`,
      });
      return { ok: result.ok, detail: result.url ?? "comment posted", url: result.url, mock: result.mock ?? mock };
    }

    case "jira-transition": {
      const { connector, mock } = getJiraTickets();
      if (mock || !connector.transitionIssue) {
        return mockWrite("jira-transition", `${action.ref} → ${action.transition}`);
      }
      const r = await connector.transitionIssue(action.ref, action.transition);
      await audit({ action: "write:jira-transition", target: action.ref, approved: true, provider: "jira", safetyClass: "WRITE_MEDIUM_RISK", details: `→ ${action.transition}` });
      return { ok: r.ok, detail: `transitioned ${action.ref} → ${action.transition}`, url: r.url };
    }

    case "jira-link": {
      const { connector, mock } = getJiraTickets();
      if (mock || !connector.linkIssues) {
        return mockWrite("jira-link", `${action.from} ${action.linkType} ${action.to}`);
      }
      const r = await connector.linkIssues(action.from, action.to, action.linkType);
      await audit({ action: "write:jira-link", target: `${action.from}->${action.to}`, approved: true, provider: "jira", safetyClass: "WRITE_HIGH_RISK", details: action.linkType });
      return { ok: r.ok, detail: `linked ${action.from} ${action.linkType} ${action.to}` };
    }

    case "jira-create": {
      const { connector, mock } = getJiraTickets();
      if (mock || !connector.createIssue) {
        return mockWrite("jira-create", `${action.projectKey}: ${action.summary}`);
      }
      const r = await connector.createIssue({
        projectKey: action.projectKey,
        summary: action.summary,
        description: action.description,
        issueType: action.issueType,
      });
      await audit({ action: "write:jira-create", target: r.key ?? action.projectKey, approved: true, provider: "jira", safetyClass: "WRITE_MEDIUM_RISK", details: action.summary });
      return { ok: r.ok, detail: `created ${r.key ?? "issue"}`, url: r.url };
    }

    case "api-call": {
      const res = await safeFetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body,
      });
      await audit({
        action: "write:api-call",
        target: action.url,
        approved: true,
        provider: action.provider,
        details: redact(`${action.method} ${action.url} headers=${JSON.stringify(redactHeaders(action.headers))} → ${res.status}`),
      });
      return { ok: res.ok, detail: redact(`${res.status} ${res.text.slice(0, 800)}`) };
    }

    case "mcp-call": {
      // Implemented in Phase 4 via the MCP executor; routed there by the MCP route.
      throw new Error("MCP execution is handled by the MCP executor route.");
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

async function mockWrite(kind: string, detail: string): Promise<ExecuteResult> {
  await audit({ action: `write:${kind}`, approved: true, provider: "mock", details: `MOCK ${detail}` });
  return { ok: true, detail: `MOCK ${kind}: ${detail}`, mock: true };
}
