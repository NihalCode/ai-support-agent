import "server-only";

import type { ChatStreamEvent } from "@/lib/support/chat/stream-events";
import { UNSUPPORTED_APP_BUILD_MESSAGE } from "@/lib/support/unsupported-app-build";
import type { ChatMode } from "./types";
import type { IntentClassification } from "@/lib/support/intent/types";

type SendFn = (event: ChatStreamEvent) => void;

/** @deprecated Build App removed — returns graceful unsupported message. */
export async function executeBuildAppWorkflow(input: {
  message: string;
  enrichedMessage: string;
  projectId?: string;
  buildOk?: boolean | null;
  messageId: string;
  chatMode: ChatMode;
  send: SendFn;
  classification?: IntentClassification;
}) {
  input.send({ type: "token", messageId: input.messageId, text: UNSUPPORTED_APP_BUILD_MESSAGE });
  return { fullText: UNSUPPORTED_APP_BUILD_MESSAGE, projectId: undefined };
}
