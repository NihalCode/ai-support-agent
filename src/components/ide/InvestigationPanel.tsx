"use client";

import type { InvestigationContext } from "@/lib/support/investigation/types";
import { EvidencePanel } from "../investigation/EvidencePanel";
import { ToolCallCard } from "../workspace/ToolCallCard";

/** Live investigation evidence sidebar — wraps existing EvidencePanel + tool cards. */
export function InvestigationPanel({ context }: { context: InvestigationContext | null }) {
  if (!context) {
    return (
      <div className="ide-empty" style={{ padding: 16 }}>
        Run an investigation to see evidence, API endpoints, logs, and Jira matches here.
      </div>
    );
  }

  return (
    <div style={{ padding: 8 }}>
      <EvidencePanel context={context} />
      <div style={{ marginTop: 12 }}>
        <ToolCallCard agent="docs" summary={context.docs.summary} />
        <ToolCallCard agent="jira" summary={context.jira.summary} mock={context.jira.mock} />
        <ToolCallCard agent="code" summary={context.code.summary} mock={context.code.mock} />
        <ToolCallCard agent="logs" summary={context.logs.summary} mock={context.logs.mock} />
        {context.cql && <ToolCallCard agent="cql" summary={context.cql.summary} mock={context.cql.mock} />}
      </div>
    </div>
  );
}
