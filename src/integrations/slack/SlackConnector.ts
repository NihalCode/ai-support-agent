import "server-only";

import { isTestMode } from "@/lib/test-mode";
import { postSlackMessage } from "@/lib/support/slack/client";

import type { EnterpriseConnector, IntegrationHealthResult } from "../core/EnterpriseConnector";
import { healthResult } from "../core/EnterpriseConnector";
import {
  resolveSlackCredentials,
  slackCredentialsConfigured,
} from "../core/resolveIntegrationCredentials";

export class SlackEnterpriseConnector implements EnterpriseConnector {
  type = "slack" as const;
  name = "Slack";

  async healthCheck(): Promise<IntegrationHealthResult> {
    const creds = await resolveSlackCredentials();
    if (!slackCredentialsConfigured(creds)) {
      if (isTestMode()) return healthResult(true, "Slack mock mode active", true);
      return healthResult(false, "Slack is not connected");
    }
    return healthResult(true, "Slack bot token and signing secret configured");
  }
}

export async function sendSlackTestMessage(channel: string, text: string): Promise<{ ok: boolean; detail: string }> {
  if (isTestMode()) {
    return { ok: true, detail: `Mock Slack message to ${channel}` };
  }
  try {
    await postSlackMessage({ channel, text, threadTs: undefined });
    return { ok: true, detail: "Test message sent" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Send failed" };
  }
}
