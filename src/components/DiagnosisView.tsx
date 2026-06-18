"use client";

import type { IssueAnalysis, CodePatch } from "@/lib/support/types";
import { Card, Badge, CopyButton, Button } from "./ui";

const FIXABILITY_LABEL: Record<string, string> = {
  "client-can-fix": "Client can fix",
  "support-can-fix": "Support can fix",
  "engineering-required": "Engineering required",
  "not-enough-info": "Not enough information",
  "not-doable": "Not doable / unsupported",
};

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function PatchView({ patch }: { patch: CodePatch }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
        background: "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{patch.filePath}</strong>
        <Badge label={`risk: ${patch.riskLevel}`} />
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0" }}>{patch.why}</p>
      <pre
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: 10,
          fontSize: 12,
          overflow: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {patch.diff}
      </pre>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        <strong>Tests:</strong> {patch.testsToRun.join("; ")}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        <strong>Rollback:</strong> {patch.rollbackPlan}
      </div>
      <div style={{ marginTop: 8 }}>
        <CopyButton text={patch.diff} label="Copy diff" />
      </div>
    </div>
  );
}

export function DiagnosisView({
  analysis,
  onGeneratePatch,
  patchLoading,
}: {
  analysis: IssueAnalysis;
  onGeneratePatch?: () => void;
  patchLoading?: boolean;
}) {
  return (
    <Card
      title="Diagnosis"
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge label={analysis.confidence} />
          <Badge label={FIXABILITY_LABEL[analysis.fixability] ?? analysis.fixability} />
          {!analysis.usedLlm && <Badge label="heuristic mode" />}
        </div>
      }
    >
      <Field label="A · Plain-English summary">{analysis.summary}</Field>
      <Field label="B · Likely root cause">{analysis.rootCause}</Field>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <span><Badge label={analysis.category} /></span>
      </div>

      <Field label="D · Evidence found">
        <List items={analysis.evidence} />
      </Field>

      <Field label="F · Suggested fix steps">
        <List items={analysis.fixSteps} />
      </Field>

      <Field label="G · Code-level fix suggestion">
        {analysis.codeFix ? (
          <PatchView patch={analysis.codeFix} />
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              No patch generated yet (only proposed when retrieved code supports it).
            </span>
            {onGeneratePatch && (
              <Button onClick={onGeneratePatch} disabled={patchLoading}>
                {patchLoading ? "Generating…" : "Suggest code patch"}
              </Button>
            )}
          </div>
        )}
      </Field>

      {analysis.questionsForClient.length > 0 && (
        <Field label="H · Questions to ask the client">
          <List items={analysis.questionsForClient} />
        </Field>
      )}

      {analysis.escalationNote && (
        <Field label="J · Suggested engineering escalation note">
          <div
            style={{
              border: "1px solid var(--red)",
              background: "color-mix(in srgb, var(--red) 12%, transparent)",
              borderRadius: 8,
              padding: 10,
              fontSize: 13,
            }}
          >
            {analysis.escalationNote}
          </div>
        </Field>
      )}
    </Card>
  );
}
