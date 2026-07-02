import "server-only";

import type { UnifiedChatInput, UnifiedChatResult } from "./types";
import { normalizeChatMode } from "./ModeSelector";
import { classifyWithAttachments, formatClassificationSummary } from "./IntentClassifier";
import { routeWorkflow } from "./WorkflowRouter";

export async function handleUnifiedChatMessage(input: UnifiedChatInput): Promise<UnifiedChatResult> {
  const chatMode = normalizeChatMode(input.selectedMode, input.canUseDeveloperMode);

  const intentCtx = {
    sessionId: input.sessionId,
    investigationId: input.investigationId,
    buildProjectId: input.buildProjectId,
    buildOk: input.buildOk,
    buildFailed: input.buildOk === false,
  };

  const { classification, attachmentContexts, enrichedMessage } = classifyWithAttachments({
    message: input.message,
    context: intentCtx,
    attachmentIds: input.attachmentIds,
    chatMode,
  });

  const route = routeWorkflow(classification, intentCtx, enrichedMessage);

  return {
    route: {
      kind: route.kind,
      primaryIntent: classification.primaryIntent,
      attachmentContextSummary: attachmentContexts.map((c) => c.summary).join("; ") || undefined,
    },
    enrichedMessage,
    classificationSummary: formatClassificationSummary(classification),
  };
}

export { normalizeChatMode, modeBehavior, modeLabel } from "./ModeSelector";
export { classifyWithAttachments } from "./IntentClassifier";
export { routeWorkflow } from "./WorkflowRouter";
