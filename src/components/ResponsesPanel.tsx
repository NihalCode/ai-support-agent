"use client";

import { Card, Button, CopyButton, Badge } from "./ui";

export interface DraftedComments {
  customer: string;
  engineering: string;
  meta: {
    labels: string[];
    priority: string;
    assignee: string;
    needsEngineering: boolean;
    needsEngineeringReason?: string;
  };
}

export function ResponsesPanel({
  comments,
  onPostCustomer,
  canWrite,
  issueRef,
}: {
  comments: DraftedComments;
  onPostCustomer: () => void;
  canWrite: boolean;
  issueRef?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="I · Suggested customer response"
        right={<CopyButton text={comments.customer} label="Copy customer response" />}
      >
        <pre style={preStyle}>{comments.customer}</pre>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Button
            variant="primary"
            onClick={onPostCustomer}
            disabled={!canWrite || !issueRef}
            title={
              !issueRef
                ? "Provide an issue/ticket reference to post"
                : !canWrite
                ? "Read-only mode is enabled"
                : "Post this comment (requires confirmation)"
            }
          >
            Generate &amp; post {issueRef ? `to ${issueRef}` : "comment"}
          </Button>
        </div>
      </Card>

      <Card
        title="Internal engineering note"
        right={<CopyButton text={comments.engineering} label="Copy engineering note" />}
      >
        <pre style={preStyle}>{comments.engineering}</pre>
      </Card>

      <Card title="Suggested triage metadata">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {comments.meta.labels.map((l) => (
            <Badge key={l} label={l} />
          ))}
          <Badge label={`priority: ${comments.meta.priority}`} />
          <Badge label={`assignee: ${comments.meta.assignee}`} />
          {comments.meta.needsEngineering && <Badge label="needs engineering" />}
        </div>
        {comments.meta.needsEngineeringReason && (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
            {comments.meta.needsEngineeringReason}
          </p>
        )}
      </Card>
    </div>
  );
}

const preStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontSize: 13,
  lineHeight: 1.6,
  margin: 0,
  fontFamily: "inherit",
};
