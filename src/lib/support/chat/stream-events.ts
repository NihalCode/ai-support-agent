/** Chat streaming event types for SSE. */

export type ChatStreamEvent =
  | { type: "message_start"; messageId: string }
  | { type: "token"; messageId: string; text: string }
  | { type: "tool_call_start"; toolCallId: string; agent: string; name: string; summary?: string }
  | { type: "tool_call_update"; toolCallId: string; status: string; summary?: string }
  | {
      type: "tool_call_result";
      toolCallId: string;
      status: "success" | "error" | "skipped";
      summary: string;
      evidence?: unknown[];
    }
  | { type: "session_created"; sessionId: string; investigationId?: string; title: string }
  | { type: "investigation_update"; investigationId: string; patch: unknown }
  | { type: "approval_required"; approvalId: string; action: unknown }
  | { type: "message_done"; messageId: string }
  | { type: "error"; messageId?: string; error: string };

export function encodeSseEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
