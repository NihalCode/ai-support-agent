import "server-only";

import {
  getSlackConversation,
  upsertSlackConversation,
  getConversationMessages,
  type SlackThreadMessage,
} from "../enterprise/stores/slack-conversation-store";

export type { SlackThreadMessage };

export interface SlackThreadMemory {
  channelId: string;
  threadTs: string;
  teamId?: string;
  investigationSessionId?: string;
  investigationId?: string;
  messages: SlackThreadMessage[];
  updatedAt: string;
}

function toMemory(
  teamId: string | undefined,
  channelId: string,
  threadTs: string,
  conv: Awaited<ReturnType<typeof getSlackConversation>>
): SlackThreadMemory | null {
  if (!conv) return null;
  return {
    channelId,
    threadTs,
    teamId: teamId ?? conv.slackTeamId,
    investigationSessionId: conv.investigationSessionId,
    investigationId: conv.investigationId,
    messages: getConversationMessages(conv),
    updatedAt: conv.updatedAt,
  };
}

export async function getSlackThread(
  channelId: string,
  threadTs: string,
  teamId = "default"
): Promise<SlackThreadMemory | null> {
  const conv = await getSlackConversation(teamId, channelId, threadTs);
  return toMemory(teamId, channelId, threadTs, conv);
}

export async function setSlackThreadInvestigation(
  channelId: string,
  threadTs: string,
  investigationSessionId: string,
  teamId = "default",
  investigationId?: string
): Promise<SlackThreadMemory | null> {
  const existing = await getSlackConversation(teamId, channelId, threadTs);
  if (!existing) return null;
  const conv = await upsertSlackConversation({
    teamId,
    channelId,
    threadTs,
    investigationSessionId,
    investigationId,
  });
  return toMemory(teamId, channelId, threadTs, conv);
}

export async function appendSlackThreadMessage(input: {
  channelId: string;
  threadTs: string;
  teamId?: string;
  message: Omit<SlackThreadMessage, "at"> & { at?: string };
}): Promise<SlackThreadMemory> {
  const conv = await upsertSlackConversation({
    teamId: input.teamId,
    channelId: input.channelId,
    threadTs: input.threadTs,
    slackUserId: input.message.userId,
    message: input.message,
  });
  return toMemory(input.teamId, input.channelId, input.threadTs, conv)!;
}
