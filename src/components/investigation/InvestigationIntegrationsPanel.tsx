"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";

interface TicketResult {
  ref: string;
  title: string;
  status?: string;
  url?: string;
}

export function InvestigationIntegrationsPanel({
  investigationId,
  links,
  onLinksChange,
}: {
  investigationId: string;
  links?: {
    zendeskTicketId?: string;
    jiraIssueKey?: string;
  } | null;
  onLinksChange?: () => void;
}) {
  const { canUseDeveloperMode } = useAuth();
  const { isClientMode } = useWorkspace();
  const developerMode = canUseDeveloperMode && !isClientMode;

  const [zendeskQuery, setZendeskQuery] = useState("");
  const [jiraQuery, setJiraQuery] = useState("");
  const [zendeskResults, setZendeskResults] = useState<TicketResult[]>([]);
  const [jiraResults, setJiraResults] = useState<TicketResult[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [jiraDraft, setJiraDraft] = useState({ summary: "", description: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function searchZendesk() {
    if (!zendeskQuery.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/integrations/zendesk/tickets?q=${encodeURIComponent(zendeskQuery.trim())}`
      );
      const data = (await res.json()) as { tickets?: TicketResult[]; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Zendesk search unavailable");
        setZendeskResults([]);
        return;
      }
      setZendeskResults(data.tickets ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function searchJira() {
    if (!jiraQuery.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/integrations/jira/issues?q=${encodeURIComponent(jiraQuery.trim())}`
      );
      const data = (await res.json()) as { issues?: TicketResult[]; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Jira search unavailable");
        setJiraResults([]);
        return;
      }
      setJiraResults(data.issues ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function linkZendesk(ticketId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/zendesk/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link", investigationId, ticketId }),
      });
      const data = (await res.json()) as { error?: string };
      setMessage(res.ok ? `Linked Zendesk ticket ${ticketId}` : data.error ?? "Link failed");
      onLinksChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function linkJira(issueKey: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/jira/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link", investigationId, issueKey }),
      });
      const data = (await res.json()) as { error?: string };
      setMessage(res.ok ? `Linked Jira issue ${issueKey}` : data.error ?? "Link failed");
      onLinksChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function requestZendeskReply(publicReply: boolean) {
    if (!links?.zendeskTicketId || !replyBody.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/zendesk/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: publicReply ? "request_reply" : "request_note",
          ticketId: links.zendeskTicketId,
          body: publicReply ? replyBody : noteBody,
        }),
      });
      const data = (await res.json()) as { approvalId?: string; error?: string };
      setMessage(
        res.ok
          ? `Approval queued (${data.approvalId?.slice(0, 8)}…) — ${publicReply ? "customer reply" : "internal note"}`
          : data.error ?? "Request failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestJiraCreate() {
    if (!jiraDraft.summary.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/jira/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_create",
          summary: jiraDraft.summary,
          description: jiraDraft.description,
        }),
      });
      const data = (await res.json()) as { approvalId?: string; error?: string };
      setMessage(res.ok ? `Jira creation approval queued (${data.approvalId?.slice(0, 8)}…)` : data.error ?? "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="investigation-integrations-panel" style={{ fontSize: 12, marginTop: 16 }}>
      <h4 style={{ margin: "0 0 8px" }}>External systems</h4>
      {message && <p style={{ color: "var(--muted)", margin: "0 0 8px" }}>{message}</p>}

      <section style={{ marginBottom: 16 }} data-testid="investigation-zendesk-section">
        <strong>Zendesk</strong>
        {links?.zendeskTicketId ? (
          <p style={{ color: "var(--accent)", margin: "4px 0" }}>
            Linked ticket: {links.zendeskTicketId}
          </p>
        ) : (
          <p style={{ color: "var(--muted)", margin: "4px 0" }}>No linked Zendesk ticket.</p>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            className="ide-chat-input"
            placeholder="Search Zendesk"
            value={zendeskQuery}
            onChange={(e) => setZendeskQuery(e.target.value)}
            style={{ flex: 1 }}
            data-testid="investigation-zendesk-search"
          />
          <button type="button" className="ide-tree-item" style={{ width: "auto" }} disabled={busy} onClick={() => void searchZendesk()}>
            Search
          </button>
        </div>
        {zendeskResults.map((t) => (
          <div key={t.ref} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0" }}>
            <span>{t.ref}: {t.title}</span>
            <button type="button" className="ide-tree-item" style={{ width: "auto" }} onClick={() => void linkZendesk(t.ref)}>
              Link
            </button>
          </div>
        ))}
        {links?.zendeskTicketId && (
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            <textarea
              className="ide-chat-input"
              placeholder="Draft customer reply"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={2}
            />
            <button type="button" className="ide-tree-item" style={{ width: "auto" }} disabled={busy} onClick={() => void requestZendeskReply(true)}>
              Request customer reply approval
            </button>
            <textarea
              className="ide-chat-input"
              placeholder="Draft internal note"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={2}
            />
            <button type="button" className="ide-tree-item" style={{ width: "auto" }} disabled={busy} onClick={() => void requestZendeskReply(false)}>
              Request internal note approval
            </button>
          </div>
        )}
      </section>

      <section data-testid="investigation-jira-section">
        <strong>Jira</strong>
        {links?.jiraIssueKey ? (
          <p style={{ color: "var(--accent)", margin: "4px 0" }}>
            Linked issue: {links.jiraIssueKey}
          </p>
        ) : (
          <p style={{ color: "var(--muted)", margin: "4px 0" }}>
            {developerMode ? "No linked Jira issue." : "Engineering issues are linked by your developer team."}
          </p>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            className="ide-chat-input"
            placeholder="Search Jira"
            value={jiraQuery}
            onChange={(e) => setJiraQuery(e.target.value)}
            style={{ flex: 1 }}
            data-testid="investigation-jira-search"
          />
          <button type="button" className="ide-tree-item" style={{ width: "auto" }} disabled={busy} onClick={() => void searchJira()}>
            Search
          </button>
        </div>
        {jiraResults.map((t) => (
          <div key={t.ref} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0" }}>
            <span>{t.ref}: {t.title}</span>
            <button type="button" className="ide-tree-item" style={{ width: "auto" }} onClick={() => void linkJira(t.ref)}>
              Link
            </button>
          </div>
        ))}
        {developerMode && (
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            <input
              className="ide-chat-input"
              placeholder="Jira issue summary"
              value={jiraDraft.summary}
              onChange={(e) => setJiraDraft((d) => ({ ...d, summary: e.target.value }))}
            />
            <textarea
              className="ide-chat-input"
              placeholder="Developer handoff / description"
              value={jiraDraft.description}
              onChange={(e) => setJiraDraft((d) => ({ ...d, description: e.target.value }))}
              rows={3}
            />
            <button type="button" className="ide-tree-item" style={{ width: "auto" }} disabled={busy} onClick={() => void requestJiraCreate()}>
              Request Jira creation approval
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
