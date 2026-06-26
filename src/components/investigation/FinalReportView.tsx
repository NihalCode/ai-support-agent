"use client";

import { useState } from "react";
import type { SupportTriageReport, FixProposal } from "@/lib/support/investigation/types";
import type { CodePatch } from "@/lib/support/types";
import { Card, Badge, CopyButton, Button } from "../ui";
import { ConfirmModal } from "../ConfirmModal";

export function FinalReportView({
  report,
  sessionId,
  onReportUpdate,
}: {
  report: SupportTriageReport;
  sessionId: string;
  onReportUpdate?: (report: SupportTriageReport, fixProposal?: FixProposal) => void;
}) {
  const [jiraModal, setJiraModal] = useState(false);
  const [jiraBusy, setJiraBusy] = useState(false);
  const [jiraResult, setJiraResult] = useState<string | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);
  const [patch, setPatch] = useState<CodePatch | null>(null);
  const [prBusy, setPrBusy] = useState(false);
  const [prDescription, setPrDescription] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const md = [
    `# ${report.title}`,
    "",
    "## Plain-English Summary",
    report.plainEnglishSummary,
    "",
    `**Status:** ${report.currentStatus} | **Severity:** ${report.severity} | **Confidence:** ${report.confidence}`,
    "",
    "## What We Found",
    `**Jira:** ${report.whatWeFound.jira}`,
    `**Logs:** ${report.whatWeFound.logs}`,
    `**Code:** ${report.whatWeFound.code}`,
    `**Deployments:** ${report.whatWeFound.deployments}`,
    `**Docs:** ${report.whatWeFound.docs}`,
    "",
    "## Likely Cause",
    report.likelyCause,
    "",
    "## Is It Fixed?",
    report.isItFixed,
    "",
    "## Recommended Next Step",
    report.recommendedNextStep,
    "",
    "## Customer Response",
    report.customerResponse,
    "",
    "## Developer Notes",
    report.developerNotes,
    "",
    `Session: ${sessionId}`,
  ].join("\n");

  async function createJiraTicket() {
    setJiraBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/support/investigate/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "create-jira", approved: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Jira create failed");
      const updated: SupportTriageReport = {
        ...report,
        jiraTicket: {
          ...report.jiraTicket,
          status: "created",
          createdKey: data.key,
          createdUrl: data.url,
        },
      };
      onReportUpdate?.(updated);
      setJiraResult(data.mock ? `Mock ticket: ${data.url}` : `Created: ${data.url}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Jira create failed");
    } finally {
      setJiraBusy(false);
      setJiraModal(false);
    }
  }

  async function generatePatch() {
    setPatchBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/support/investigate/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "generate-patch" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Patch generation failed");
      if (data.patch) {
        setPatch(data.patch as CodePatch);
        onReportUpdate?.(
          {
            ...report,
            developerNotes: [report.developerNotes, "", "## Generated patch", data.patch.diff].join("\n"),
          },
          data.fixProposal
        );
      } else {
        setActionError("Not enough code evidence to generate a safe patch.");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Patch failed");
    } finally {
      setPatchBusy(false);
    }
  }

  async function generatePr() {
    setPrBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/support/investigate/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "pr-description" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "PR description failed");
      setPrDescription(data.description ?? "");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "PR description failed");
    } finally {
      setPrBusy(false);
    }
  }

  const canCreateJira =
    report.jiraTicket.status !== "duplicate-blocked" && report.jiraTicket.status !== "created";

  return (
    <>
      <Card
        title="Final report"
        right={
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Badge label={report.severity} />
            <Badge label={report.confidence} />
            <CopyButton text={md} label="Copy report" />
          </div>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {canCreateJira && (
            <Button variant="primary" onClick={() => setJiraModal(true)} disabled={jiraBusy}>
              Create Jira ticket
            </Button>
          )}
          <Button variant="ghost" onClick={generatePatch} disabled={patchBusy}>
            {patchBusy ? "Generating patch…" : "Generate patch"}
          </Button>
          <Button variant="ghost" onClick={generatePr} disabled={prBusy}>
            {prBusy ? "Writing PR…" : "PR description"}
          </Button>
        </div>

        {jiraResult && (
          <p style={{ fontSize: 13, color: "var(--green)", marginTop: 0 }}>{jiraResult}</p>
        )}
        {actionError && (
          <p style={{ fontSize: 13, color: "var(--red)", marginTop: 0 }}>{actionError}</p>
        )}

        <Section label="Plain-English summary">{report.plainEnglishSummary}</Section>
        <Section label="Current status">
          <Badge label={report.currentStatus.replace(/-/g, " ")} />
        </Section>
        <Section label="What we found">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            <li><strong>Jira:</strong> {report.whatWeFound.jira}</li>
            <li><strong>Logs:</strong> {report.whatWeFound.logs}</li>
            <li><strong>Code:</strong> {report.whatWeFound.code}</li>
            <li><strong>Deployments:</strong> {report.whatWeFound.deployments}</li>
            <li><strong>Docs:</strong> {report.whatWeFound.docs}</li>
          </ul>
        </Section>
        <Section label="Likely cause">{report.likelyCause}</Section>
        <Section label="Is it fixed?">{report.isItFixed}</Section>
        <Section label="Recommended next step">{report.recommendedNextStep}</Section>
        <Section label="Customer-friendly response">
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: 0 }}>{report.customerResponse}</pre>
          <CopyButton text={report.customerResponse} label="Copy customer response" />
        </Section>
        <Section label="Jira ticket">
          {report.jiraTicket.status}
          {report.jiraTicket.createdUrl ? (
            <> — <a href={report.jiraTicket.createdUrl} target="_blank" rel="noreferrer">{report.jiraTicket.createdKey}</a></>
          ) : (
            <> — {report.jiraTicket.title || "(draft pending)"}</>
          )}
        </Section>

        {patch && (
          <Section label="Suggested patch">
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 12,
                background: "var(--surface-2)",
                padding: 10,
                borderRadius: 8,
                maxHeight: 280,
                overflow: "auto",
              }}
            >
              {patch.diff}
            </pre>
            <CopyButton text={patch.diff} label="Copy patch" />
          </Section>
        )}

        {prDescription && (
          <Section label="PR description">
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: 0 }}>{prDescription}</pre>
            <CopyButton text={prDescription} label="Copy PR description" />
          </Section>
        )}
      </Card>

      <ConfirmModal
        open={jiraModal}
        title="Create Jira ticket"
        target={report.jiraTicket.title}
        body={`${report.jiraTicket.summary.slice(0, 600)}${report.jiraTicket.summary.length > 600 ? "…" : ""}`}
        onConfirm={createJiraTicket}
        onCancel={() => setJiraModal(false)}
        busy={jiraBusy}
      />
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
