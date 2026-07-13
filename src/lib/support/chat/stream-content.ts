import type { ChatStreamEvent } from "./stream-events";

export function applyChatContentEvent(
  content: string,
  event: ChatStreamEvent
): string {
  return event.type === "token" ? content + event.text : content;
}
