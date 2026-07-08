"use client";

import { useEffect, useState } from "react";
import type { EditorTab } from "./types";
import { InvestigationWorkspace } from "../investigation/InvestigationWorkspace";
import { IntegrationsPanel } from "../IntegrationsPanel";
import { CredentialSetup } from "../workspace/CredentialSetup";
import { ApiRunnerPanel } from "../workspace/ApiRunnerPanel";
import { useWorkspace } from "./WorkspaceProvider";
import { ApiRegistryEditor } from "./editors/ApiRegistryEditor";
import { CqlWorkspaceEditor } from "./editors/CqlWorkspaceEditor";
import { WelcomeEditor } from "./editors/WelcomeEditor";
import { DiagnoseEditor } from "./editors/DiagnoseEditor";
import { EndpointEditor } from "./editors/EndpointEditor";
import { InvestigationObjectPanel } from "../investigation/InvestigationObjectPanel";
import { FeatureRemovedEditor } from "./editors/FeatureRemovedEditor";
import { SettingsEditor } from "./editors/SettingsEditor";
import { JiraTicketEditor } from "./editors/JiraTicketEditor";
import { AuditTimelinePanel } from "@/components/enterprise/AuditTimelinePanel";

export function EditorArea({
  groupId,
  tabs,
  activeTabId,
}: {
  groupId: string;
  tabs: EditorTab[];
  activeTabId: string | null;
}) {
  const { setInvestigationSession, setActiveInvestigation } = useWorkspace();
  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) =>
        setDevMode(
          Boolean(
            s.integrations?.ctix?.configured ||
              s.integrations?.github?.configured ||
              s.integrations?.jira?.configured
          )
        )
      )
      .catch(() => undefined);
  }, []);

  if (!tab) return <div className="ide-empty">No editor tab open</div>;

  return (
    <div className="ide-editor" data-group={groupId}>
      {tab.kind === "welcome" && <WelcomeEditor />}
      {tab.kind === "investigation" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
          <InvestigationWorkspace
            embedded
            onResult={(data) => {
              if (data.sessionId) setInvestigationSession(data.sessionId);
              fetch("/api/support/investigations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: data.report?.title ?? "Investigation",
                  userIssue: data.context?.query?.text ?? "Support issue",
                  sessionId: data.sessionId,
                  suspectedRootCause: data.report?.likelyCause,
                  confidence: data.report?.confidence ?? "low",
                  customerFacingResponse: data.report?.customerResponse,
                  developerHandoff: data.report?.developerNotes,
                }),
              })
                .then((r) => r.json())
                .then((inv) => setActiveInvestigation(inv.id))
                .catch(() => undefined);
            }}
          />
          <InvestigationObjectPanel investigationId={tab.payload?.investigationId as string | undefined} />
        </div>
      )}
      {tab.kind === "diagnose" && <DiagnoseEditor />}
      {tab.kind === "integrations" && (
        <IntegrationsPanel
          key={String(tab.payload?.tab ?? "health")}
          initialTab={tab.payload?.tab as "approvals" | "health" | undefined}
        />
      )}
      {tab.kind === "api-registry" && <ApiRegistryEditor specId={tab.payload?.specId as string | undefined} />}
      {tab.kind === "endpoint" && (
        <EndpointEditor
          specId={tab.payload?.specId as string | undefined}
          method={String(tab.payload?.method ?? "GET")}
          path={String(tab.payload?.path ?? "/")}
        />
      )}
      {tab.kind === "api-runner" && <ApiRunnerPanel developerMode={devMode} />}
      {tab.kind === "cql" && <CqlWorkspaceEditor />}
      {tab.kind === "credentials" && <CredentialSetup />}
      {tab.kind === "settings" && (
        <SettingsEditor
          key={String(tab.payload?.section ?? "integrations")}
          initialSection={
            tab.payload?.section as
              | "integrations"
              | "health"
              | "credentials"
              | "audit"
              | "setup"
              | "knowledge"
              | "notifications"
              | "retention"
              | "users"
              | "personal-preferences"
              | undefined
          }
        />
      )}
      {tab.kind === "audit-logs" && (
        <div style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Audit logs</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
            Unified timeline grouped by Slack threads, investigations, and approvals.
          </p>
          <AuditTimelinePanel />
        </div>
      )}
      {tab.kind === "investigation-object" && (
        <InvestigationObjectPanel investigationId={String(tab.payload?.investigationId ?? "")} />
      )}
      {tab.kind === "mcp-config" && (
        <div>
          <h2 style={{ marginTop: 0 }}>MCP configuration</h2>
          <p style={{ color: "var(--muted)" }}>
            Copy <code>.cursor/mcp.json.example</code> → <code>.cursor/mcp.json</code>. See <code>mcp/README.md</code>.
          </p>
          <IntegrationsPanel />
        </div>
      )}
      {tab.kind === "build-app" && (
        <FeatureRemovedEditor
          feature="Build App"
          alternatives={[
            "Ask about CSAP, CFTR, CTIX, or Orchestrate endpoints",
            "Generate CQL queries",
            "Start a support investigation",
            "Draft a developer handoff",
          ]}
        />
      )}
      {tab.kind === "deployments" && (
        <FeatureRemovedEditor
          feature="Generated app deployments"
          alternatives={[
            "Use API Registry for endpoint testing",
            "Investigate API failures in main chat",
          ]}
        />
      )}
      {tab.kind === "jira-ticket" && (
        <JiraTicketEditor ticketKey={String(tab.payload?.key ?? tab.title)} />
      )}
      {tab.kind === "markdown-report" && (
        <pre className="ide-code-block">{String(tab.payload?.content ?? "")}</pre>
      )}
      {tab.kind === "diff" && (
        <pre className="ide-code-block">{String(tab.payload?.diff ?? "No diff content")}</pre>
      )}
      {tab.kind === "code-file" && (
        <pre className="ide-code-block">{String(tab.payload?.content ?? "")}</pre>
      )}
    </div>
  );
}
