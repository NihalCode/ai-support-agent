/** Chat streaming event types for SSE. */

export type ChatStreamEvent =
  | { type: "message_start"; messageId: string }
  | {
      type: "intent_classified";
      messageId: string;
      primaryIntent: string;
      confidence: string;
      summary: string;
      recommendedRoute: string;
    }
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
  | {
      type: "build_app_handoff";
      title: string;
      description: string;
      templateId: string;
      templateReason: string;
      ticketId?: string;
      projectId?: string;
      mode: "plan" | "edit" | "deploy";
      autoStart: boolean;
    }
  | {
      type: "build_app_created";
      projectId: string;
      title: string;
      templateId: string;
      approvalId?: string;
      fileCount: number;
    }
  | { type: "build_app_updated"; projectId: string; patch: unknown }
  | { type: "investigation_update"; investigationId: string; patch: unknown }
  | { type: "approval_required"; approvalId: string; action: unknown }
  | { type: "message_done"; messageId: string }
  | { type: "error"; messageId?: string; error: string };

export function encodeSseEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
