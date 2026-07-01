import "server-only";

import type { IntegrationHealthCard } from "./types";

export interface DegradedModeMessage {
  friendly: string;
  technical?: string;
}

export function degradedMessageForIntegration(
  card: IntegrationHealthCard,
  developerMode: boolean
): DegradedModeMessage | null {
  if (card.status === "connected") return null;

  const missing = card.missingEnvVars?.join(", ");
  switch (card.integration.toLowerCase()) {
    case "jira":
      return {
        friendly: "Jira isn't connected — investigations will use docs, Zendesk, and Confluence only.",
        technical: developerMode
          ? `Jira status: ${card.status}. Missing: ${missing ?? "none listed"}.`
          : undefined,
      };
    case "zendesk":
      return {
        friendly: "Zendesk isn't connected — you can draft customer responses but can't post them yet.",
        technical: developerMode ? `Zendesk status: ${card.status}. Missing: ${missing ?? "none"}.` : undefined,
      };
    case "slack":
      return {
        friendly: "Slack bot isn't configured — web chat and investigations still work.",
        technical: developerMode ? `Slack status: ${card.status}.` : undefined,
      };
    case "confluence":
      return {
        friendly: "Confluence sync isn't available — other knowledge sources may still work.",
        technical: developerMode ? `Confluence status: ${card.status}.` : undefined,
      };
    case "neon db":
      return {
        friendly: "Database persistence isn't active — data may reset between deploys.",
        technical: developerMode ? "Set DATABASE_URL for Neon Postgres." : undefined,
      };
    default:
      if (card.status === "mock") {
        return {
          friendly: `${card.integration} is running in demo mode.`,
          technical: developerMode ? "TEST_MODE or missing credentials — mock connector active." : undefined,
        };
      }
      return card.status === "not_configured"
        ? {
            friendly: `${card.integration} is not configured.`,
            technical: developerMode ? card.summary : undefined,
          }
        : {
            friendly: `${card.integration} needs attention.`,
            technical: developerMode ? card.summary : undefined,
          };
  }
}

export function buildDegradedSummaries(
  cards: IntegrationHealthCard[],
  developerMode: boolean
): DegradedModeMessage[] {
  return cards
    .map((c) => degradedMessageForIntegration(c, developerMode))
    .filter((m): m is DegradedModeMessage => m !== null);
}

/** Prevent mock connectors from presenting as live outside TEST_MODE. */
export function sanitizeHealthForSupportMode(
  cards: IntegrationHealthCard[]
): IntegrationHealthCard[] {
  const testMode = process.env.TEST_MODE === "true";
  return cards.map((c) => {
    if (c.status === "mock" && !testMode) {
      return {
        ...c,
        status: "not_configured",
        summary: `${c.integration} is not configured for production.`,
      };
    }
    return c;
  });
}
