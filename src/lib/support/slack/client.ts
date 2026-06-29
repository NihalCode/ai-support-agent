import "server-only";

import { defaultOrgId } from "@/lib/auth/config";
import { resolveSlackCredentials } from "@/integrations/core/resolveIntegrationCredentials";
import { redact } from "../redact";
import { safeFetch } from "../../ssrf";

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export async function postSlackMessage(input: {
  channel: string;
  text: string;
  threadTs?: string;
  blocks?: SlackBlock[];
  orgId?: string;
}): Promise<{ ok: boolean; detail: string; ts?: string }> {
  const creds = await resolveSlackCredentials(input.orgId ?? defaultOrgId());
  const token = creds.botToken;
  if (!token) return { ok: false, detail: "Slack bot token not configured" };

  const res = await safeFetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channel,
      text: redact(input.text),
      thread_ts: input.threadTs,
      blocks: input.blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  if (!res.ok) return { ok: false, detail: `Slack HTTP ${res.status}: ${redact(res.text.slice(0, 200))}` };
  const data = JSON.parse(res.text) as { ok?: boolean; error?: string; ts?: string };
  if (!data.ok) return { ok: false, detail: `Slack API: ${data.error ?? "unknown error"}` };
  return { ok: true, detail: "sent", ts: data.ts };
}
