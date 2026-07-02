import "server-only";

import { classifyUserIntent, formatIntentSummary } from "@/lib/support/intent/classify-intent";
import type { IntentClassification } from "@/lib/support/intent/types";
import type { WorkspaceIntentContext } from "@/lib/support/intent/types";
import { buildAttachmentContexts } from "@/lib/files/AttachmentContextService";
import { formatAttachmentContextBlock } from "@/lib/files/CybersecurityFileParsers";
import type { AttachmentContext } from "@/lib/files/types";
import type { ChatMode } from "./types";
import { modeBehavior } from "./ModeSelector";

export function classifyWithAttachments(input: {
  message: string;
  context: WorkspaceIntentContext;
  attachmentIds: string[];
  chatMode: ChatMode;
}): {
  classification: IntentClassification;
  attachmentContexts: AttachmentContext[];
  enrichedMessage: string;
} {
  const attachmentContexts = buildAttachmentContexts(input.attachmentIds);
  const attachmentBlock = formatAttachmentContextBlock(attachmentContexts);

  let enrichedMessage = input.message;
  if (attachmentBlock) {
    enrichedMessage = `${input.message}\n\n--- Uploaded file context ---\n${attachmentBlock}`;
  }

  if (attachmentContexts.some((c) => c.suggestedIntents.includes("generate_api_request"))) {
    enrichedMessage += "\n\n[User may want API endpoint help from uploaded files.]";
  }
  if (attachmentContexts.some((c) => c.suggestedIntents.includes("analyze_cyber_artifact"))) {
    enrichedMessage += "\n\n[User uploaded cybersecurity artifacts for analysis.]";
  }

  const behavior = modeBehavior(input.chatMode);
  if (behavior.fullBuildVerification) {
    enrichedMessage += "\n\n[Mode: deep verification requested.]";
  }

  const classification = classifyUserIntent({
    message: enrichedMessage,
    context: input.context,
  });

  return { classification, attachmentContexts, enrichedMessage };
}

export function formatClassificationSummary(classification: IntentClassification): string {
  return formatIntentSummary(classification);
}
