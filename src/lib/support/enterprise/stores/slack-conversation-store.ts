import "server-only";

import { randomUUID } from "node:crypto";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import { redact } from "../../redact";
import type { SlackConversation } from "../types";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  writeJsonArrayFile,
} from "../file-store";

const MAX_MESSAGES = 50;

export interface SlackThreadMessage {
  role: "user" | "assistant" | "system";
  text: string;
  at: string;
  userId?: string;
}

function conversationsFile(): string {
  return `${enterpriseDataDir("slack")}/conversations.json`;
}

function threadKey(teamId: string, channelId: string, threadTs: string): string {
  return `${teamId}:${channelId}:${threadTs}`;
}

function rowToConversation(row: Record<string, unknown>): SlackConversation {
  return {
    id: String(row.id),
    slackTeamId: String(row.slack_team_id),
    channelId: String(row.channel_id),
    threadTs: String(row.thread_ts),
    slackUserId: String(row.slack_user_id ?? ""),
    appUserId: row.app_user_id ? String(row.app_user_id) : undefined,
    investigationId: row.investigation_id ? String(row.investigation_id) : undefined,
    investigationSessionId: row.investigation_session_id
      ? String(row.investigation_session_id)
      : undefined,
    lastIntent: row.last_intent ? String(row.last_intent) : undefined,
    messagesJson: JSON.stringify(row.messages_json ?? []),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function parseMessages(json: string): SlackThreadMessage[] {
  try {
    const parsed = JSON.parse(json) as SlackThreadMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getConversationMessages(conv: SlackConversation): SlackThreadMessage[] {
  return parseMessages(conv.messagesJson);
}

export async function getSlackConversation(
  teamId: string,
  channelId: string,
  threadTs: string
): Promise<SlackConversation | null> {
  if (isPostgresConfigured()) {
    const rows = await pgQuery`
      SELECT * FROM slack_conversations
      WHERE org_id = ${defaultOrgId()} AND slack_team_id = ${teamId}
        AND channel_id = ${channelId} AND thread_ts = ${threadTs}
      LIMIT 1
    `;
    return rows[0] ? rowToConversation(rows[0]) : null;
  }
  const k = threadKey(teamId || "default", channelId, threadTs);
  return (
    readJsonArrayFile<SlackConversation>(conversationsFile()).find(
      (c) => threadKey(c.slackTeamId, c.channelId, c.threadTs) === k
    ) ?? null
  );
}

export async function upsertSlackConversation(input: {
  teamId?: string;
  channelId: string;
  threadTs: string;
  slackUserId?: string;
  appUserId?: string;
  investigationId?: string;
  investigationSessionId?: string;
  lastIntent?: string;
  message?: Omit<SlackThreadMessage, "at"> & { at?: string };
}): Promise<SlackConversation> {
  const teamId = input.teamId || "default";
  const now = new Date().toISOString();
  const existing = await getSlackConversation(teamId, input.channelId, input.threadTs);
  const messages = existing ? parseMessages(existing.messagesJson) : [];

  if (input.message) {
    messages.push({
      ...input.message,
      text: redact(input.message.text),
      at: input.message.at ?? now,
    });
  }

  const trimmed = messages.slice(-MAX_MESSAGES);
  const conv: SlackConversation = {
    id: existing?.id ?? randomUUID(),
    slackTeamId: teamId,
    channelId: input.channelId,
    threadTs: input.threadTs,
    slackUserId: input.slackUserId ?? existing?.slackUserId ?? "",
    appUserId: input.appUserId ?? existing?.appUserId,
    investigationId: input.investigationId ?? existing?.investigationId,
    investigationSessionId: input.investigationSessionId ?? existing?.investigationSessionId,
    lastIntent: input.lastIntent ?? existing?.lastIntent,
    messagesJson: JSON.stringify(trimmed),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO slack_conversations (
        id, org_id, slack_team_id, channel_id, thread_ts, slack_user_id, app_user_id,
        investigation_id, investigation_session_id, last_intent, messages_json, created_at, updated_at
      ) VALUES (
        ${conv.id}, ${defaultOrgId()}, ${conv.slackTeamId}, ${conv.channelId}, ${conv.threadTs},
        ${conv.slackUserId}, ${conv.appUserId ?? null}, ${conv.investigationId ?? null},
        ${conv.investigationSessionId ?? null}, ${conv.lastIntent ?? null},
        ${JSON.stringify(trimmed)}, ${conv.createdAt}, ${conv.updatedAt}
      )
      ON CONFLICT (org_id, slack_team_id, channel_id, thread_ts) DO UPDATE SET
        slack_user_id = EXCLUDED.slack_user_id,
        app_user_id = EXCLUDED.app_user_id,
        investigation_id = EXCLUDED.investigation_id,
        investigation_session_id = EXCLUDED.investigation_session_id,
        last_intent = EXCLUDED.last_intent,
        messages_json = EXCLUDED.messages_json,
        updated_at = EXCLUDED.updated_at
    `;
    return conv;
  }

  const all = readJsonArrayFile<SlackConversation>(conversationsFile());
  const k = threadKey(teamId, input.channelId, input.threadTs);
  const idx = all.findIndex((c) => threadKey(c.slackTeamId, c.channelId, c.threadTs) === k);
  if (idx >= 0) all[idx] = conv;
  else all.unshift(conv);
  writeJsonArrayFile(conversationsFile(), all);
  return conv;
}

export async function deleteSlackConversation(
  teamId: string,
  channelId: string,
  threadTs: string
): Promise<boolean> {
  if (isPostgresConfigured()) {
    await pgQuery`
      DELETE FROM slack_conversations
      WHERE org_id = ${defaultOrgId()} AND slack_team_id = ${teamId}
        AND channel_id = ${channelId} AND thread_ts = ${threadTs}
    `;
    return true;
  }
  const all = readJsonArrayFile<SlackConversation>(conversationsFile());
  const k = threadKey(teamId, channelId, threadTs);
  const next = all.filter((c) => threadKey(c.slackTeamId, c.channelId, c.threadTs) !== k);
  writeJsonArrayFile(conversationsFile(), next);
  return next.length !== all.length;
}
