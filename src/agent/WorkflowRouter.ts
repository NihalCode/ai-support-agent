import "server-only";

import { chooseAgentRoute } from "@/lib/support/intent/choose-route";
import type { IntentClassification } from "@/lib/support/intent/types";
import type { WorkspaceIntentContext } from "@/lib/support/intent/types";

export function routeWorkflow(
  classification: IntentClassification,
  context: WorkspaceIntentContext,
  message: string
) {
  return chooseAgentRoute(classification, context, message);
}
