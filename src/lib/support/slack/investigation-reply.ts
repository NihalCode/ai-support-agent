import "server-only";

import { classifyUserIntent } from "../intent/classify-intent";
import type { IntentClassification } from "../intent/types";
import type { InvestigateResponse, InvestigationContext } from "../investigation/types";
import { formatEvidenceLinksSlack } from "../investigation/evidence-links";

const SLACK_MAX = 3600;

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** True when the Slack message asks for customer-facing guidance or has a secondary customer intent. */
export function wantsCustomerGuidance(
  message: string,
  classification: IntentClassification
): boolean {
  if (classification.primaryIntent === "generate_customer_response") return true;
  if (classification.secondaryIntents.includes("generate_customer_response")) return true;
  return /\b(what should support|tell the customer|what (to|do) (we|i) tell|customer reply|say to the customer|reply to the customer|what should (we|i) (say|tell))\b/i.test(
    message
  );
}

/** True when the message has multiple support facets (tickets + runbook + questions, etc.). */
export function isCompoundSupportPrompt(
  message: string,
  classification: IntentClassification
): boolean {
  if (
    classification.secondaryIntents.some((i) =>
      [
        "generate_customer_response",
        "generate_developer_handoff",
        "search_jira",
        "continue_investigation",
      ].includes(i)
    )
  ) {
    return true;
  }

  const facets = [
    /\b(runbook|playbook)\b/i.test(message),
    /\b(what should|tell the customer|customer|say to|reply to)\b/i.test(message),
    /\b(jira|zendesk|ZD-\d+|[A-Z][A-Z0-9]+-\d+|linked ticket|ticket)\b/i.test(message),
    (message.match(/\?/g) ?? []).length >= 1,
  ].filter(Boolean).length;

  return facets >= 2;
}

export function wantsRunbookSteps(message: string, ctx: Partial<InvestigationContext>): boolean {
  if (/\brunbook\b/i.test(message)) return true;
  return (ctx.docs?.docs ?? []).some(
    (d) => d.sourceType === "confluence" && /\brunbook/i.test(d.title)
  );
}

/** Pull short actionable bullets from Confluence runbook evidence. */
export function extractRunbookBullets(ctx: Partial<InvestigationContext>): string[] {
  const confluence = (ctx.docs?.docs ?? []).filter(
    (d) =>
      d.sourceType === "confluence" &&
      (/\brunbook/i.test(d.title) || /\brunbook/i.test(d.summary ?? ""))
  );

  const bullets: string[] = [];
  for (const doc of confluence.slice(0, 2)) {
    const text = (doc.summary ?? doc.title).trim();
    const numbered = text.match(/\d+[\.)]\s*[^.\n]+/g);
    if (numbered?.length) {
      bullets.push(...numbered.slice(0, 4));
      continue;
    }
    const sentenceSteps = text
      .split(/(?:\.\s+|;\s+|,\s+then\s+)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
    if (sentenceSteps.length > 1) {
      bullets.push(...sentenceSteps.slice(0, 4));
    } else if (text.length > 0) {
      bullets.push(text);
    }
  }

  return bullets.slice(0, 5);
}

export interface SlackInvestigationReplyInput {
  userMessage: string;
  result: InvestigateResponse;
  ticketNote?: string;
  appBase?: string | null;
}

/** Structured Slack mrkdwn for investigation results — preserves doc links and adds support guidance. */
export function formatSlackInvestigationReply(input: SlackInvestigationReplyInput): string {
  const { userMessage, result, ticketNote, appBase } = input;
  const ctx = result.context;
  const report = result.report;
  const classification = classifyUserIntent({ message: userMessage });
  const compound = isCompoundSupportPrompt(userMessage, classification);
  const includeCustomer = compound || wantsCustomerGuidance(userMessage, classification);
  const includeRunbook = compound && wantsRunbookSteps(userMessage, ctx);

  const sections: string[] = [];

  const summary = report?.plainEnglishSummary?.trim();
  if (summary) {
    sections.push(`*Summary*\n${truncate(summary, compound ? 450 : 900)}`);
  }

  const customerResponse = report?.customerResponse?.trim();
  if (includeCustomer && customerResponse) {
    sections.push(`*What to tell the customer*\n${truncate(customerResponse, 750)}`);
  }

  const runbookBullets = extractRunbookBullets(ctx);
  if (includeRunbook && runbookBullets.length > 0) {
    const lines = runbookBullets.map((b) => {
      const cleaned = b.replace(/^\d+[\.)]\s*/, "").trim();
      return `• ${truncate(cleaned, 180)}`;
    });
    sections.push(`*Runbook steps*\n${lines.join("\n")}`);
  }

  const nextStep = report?.recommendedNextStep?.trim();
  if (compound && nextStep) {
    sections.push(`*Recommended next actions*\n• ${truncate(nextStep.replace(/\s+/g, " "), 420)}`);
  }

  const evidenceLinks = ctx ? formatEvidenceLinksSlack(ctx) : "";
  const base = appBase?.replace(/\/$/, "") ?? "";
  const studioLink = base
    ? `\nOpen in AI Support Studio: ${base}/?investigation=${result.sessionId}`
    : "";
  const footer = `${evidenceLinks}${ticketNote ?? ""}${studioLink}`;

  let body = sections.join("\n\n");
  const maxBody = Math.max(600, SLACK_MAX - footer.length);
  if (body.length > maxBody) {
    body = `${body.slice(0, maxBody - 1)}…`;
  }

  return `${body}${footer}`.trim();
}
