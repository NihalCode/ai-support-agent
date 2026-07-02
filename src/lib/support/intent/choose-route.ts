import "server-only";

import type { IntentClassification, WorkspaceIntentContext } from "./types";
import {
  shouldAutoInvestigateFromIntent,
  formatIntentSummary,
  isAppBuildRequest,
} from "./classify-intent";
import { enrichSupportQuery, isCqlAuthoringRequest } from "../investigation/extract-query";

export type ChatRouteKind =
  | "unsupported_app_build"
  | "investigation_create"
  | "investigation_chat"
  | "investigation_customer_response"
  | "investigation_developer_handoff"
  | "cql"
  | "api"
  | "clarify"
  | "general";

export interface ChosenChatRoute {
  kind: ChatRouteKind;
  investigationPromptHint?: string;
}

export function chooseAgentRoute(
  classification: IntentClassification,
  ctx: WorkspaceIntentContext,
  message?: string
): ChosenChatRoute {
  const msg = message?.trim() ?? classification.extractedEntities.supportIssue ?? "";
  if (msg) {
    const q = enrichSupportQuery({ text: msg });
    if (isCqlAuthoringRequest(msg, q)) {
      return { kind: "cql" };
    }
  }

  if (isAppBuildRequest(classification, ctx)) {
    return { kind: "unsupported_app_build" };
  }

  if (classification.needsClarification && classification.confidence === "low" && classification.primaryIntent === "unknown") {
    return { kind: "clarify" };
  }

  if (ctx.sessionId || ctx.investigationId) {
    if (classification.primaryIntent === "generate_customer_response") {
      return {
        kind: "investigation_customer_response",
        investigationPromptHint: "Draft a plain-English customer response based on investigation evidence.",
      };
    }
    if (classification.primaryIntent === "generate_developer_handoff") {
      return {
        kind: "investigation_developer_handoff",
        investigationPromptHint: "Summarize what engineering needs to fix, with evidence citations.",
      };
    }
    if (["generate_cql", "validate_cql"].includes(classification.primaryIntent)) {
      return { kind: "cql" };
    }
    if (["generate_api_request", "search_api_docs", "run_api_dry_run"].includes(classification.primaryIntent)) {
      return { kind: "api" };
    }
    return { kind: "investigation_chat" };
  }

  if (shouldAutoInvestigateFromIntent(classification, ctx)) {
    return { kind: "investigation_create" };
  }

  if (["generate_cql", "validate_cql"].includes(classification.primaryIntent)) {
    return { kind: "cql" };
  }

  if (["generate_api_request", "search_api_docs"].includes(classification.primaryIntent)) {
    return { kind: "api" };
  }

  if (classification.primaryIntent === "unknown") {
    return { kind: "clarify" };
  }

  // Default: if it reads like support, investigate
  if (classification.primaryIntent === "diagnose_support_issue") {
    return { kind: "investigation_create" };
  }

  return { kind: "clarify" };
}

export function buildClarificationReply(classification: IntentClassification): string {
  if (classification.clarificationQuestion) {
    const choices = classification.clarificationChoices?.map((c, i) => `${i + 1}. ${c}`).join("\n");
    return [classification.clarificationQuestion, choices].filter(Boolean).join("\n\n");
  }
  return "Describe what you want to investigate, which API endpoint you need, or what CQL query you want help with — I'll figure out the best next step.";
}

export function buildIntentAwareIntro(classification: IntentClassification): string {
  return formatIntentSummary(classification);
}
