"use client";

import { useCallback, useState } from "react";
import { Paperclip, Sparkles } from "lucide-react";
import type { ChatMessage } from "@/components/ide/types";
import { sanitizeSupportText } from "@/lib/chat/support-sanitize";
import { IntentCard } from "./cards/IntentCard";
import { ToolProgressCard, type StepStatus } from "./cards/ToolProgressCard";
import { ApprovalCard } from "./cards/ApprovalCard";
import { FriendlyErrorCard } from "./cards/FriendlyErrorCard";

function mapToolStatus(status: string): StepStatus {
  if (status === "success") return "complete";
  if (status === "error") return "failed";
  if (status === "running") return "running";
  if (status === "skipped") return "unavailable";
  return "pending";
}

function splitContentBlocks(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\n\n+/).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

export function MessageBubble({
  message,
  developerMode,
}: {
  message: ChatMessage;
  developerMode: boolean;
}) {
  const [approvalBusy, setApprovalBusy] = useState(false);

  const handleApproval = useCallback(
    async (intent: "approve" | "reject") => {
      const id = message.meta?.approvalId;
      if (!id) return;
      setApprovalBusy(true);
      try {
        await fetch("/api/support/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, id }),
        });
      } finally {
        setApprovalBusy(false);
      }
    },
    [message.meta?.approvalId]
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end chat-fade-in">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md border border-white/10 bg-white/[0.075] px-4 py-3 text-sm leading-6 text-slate-100">
          {message.meta?.attachments && message.meta.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5" data-testid="user-message-attachments">
              {message.meta.attachments.map((a) => (
                <span
                  key={a.filename}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
                >
                  <Paperclip className="h-3 w-3" />
                  {a.filename}
                </span>
              ))}
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  const content = sanitizeSupportText(message.content, developerMode);
  const blocks = splitContentBlocks(content);

  return (
    <div className="flex gap-3 chat-fade-in" data-testid={message.role === "assistant" ? "chat-assistant-message" : undefined}>
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {developerMode && message.meta?.intent && (
          <IntentCard
            intent={sanitizeSupportText(message.meta.intent, developerMode)}
            confidence="High"
            plan={undefined}
          />
        )}

        {message.meta?.error && (
          <FriendlyErrorCard
            title="Something went wrong"
            message={sanitizeSupportText(message.meta.error, developerMode) || "The request could not be completed."}
            impact="You can try again or rephrase your request."
            technicalDetails={message.meta.error}
            developerMode={developerMode}
          />
        )}

        {message.toolCards && message.toolCards.length > 0 && (
          <ToolProgressCard
            title="Checking connected systems"
            steps={message.toolCards.map((c) => ({
              label: sanitizeSupportText(c.summary || c.action, developerMode),
              status: mapToolStatus(c.status),
            }))}
          />
        )}

        {message.meta?.approvalId && (
          <ApprovalCard
            title="Approval required"
            description="The agent needs your approval before taking this action."
            risk="Medium"
            target={message.meta.approvalId.slice(0, 8)}
            preview={message.meta.approvalPreview}
            onApprove={() => void handleApproval("approve")}
            onReject={() => void handleApproval("reject")}
            busy={approvalBusy}
          />
        )}

        {blocks.map((block, i) => (
          <div
            key={`${message.id}-block-${i}`}
            className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-slate-200"
          >
            {block}
          </div>
        ))}

        {message.role === "assistant" && message.id && (
          <div className="flex items-center gap-2 pt-1" data-testid="chat-feedback">
            <button
              type="button"
              className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
              aria-label="Helpful"
              onClick={() =>
                void fetch("/api/metrics/feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ messageId: message.id, rating: "up" }),
                })
              }
            >
              👍
            </button>
            <button
              type="button"
              className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
              aria-label="Not helpful"
              onClick={() =>
                void fetch("/api/metrics/feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ messageId: message.id, rating: "down" }),
                })
              }
            >
              👎
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
