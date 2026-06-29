import "server-only";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { supportDataRoot } from "../data-root";
import { redact } from "../redact";

export interface SlackThreadMessage {
  role: "user" | "assistant" | "system";
  text: string;
  at: string;
  userId?: string;
}

export interface SlackThreadMemory {
  channelId: string;
  threadTs: string;
  teamId?: string;
  messages: SlackThreadMessage[];
  updatedAt: string;
}

const MAX_MESSAGES = 50;

function filePath(): string {
  return path.join(supportDataRoot("slack"), "threads.json");
}

function readAll(): SlackThreadMemory[] {
  try {
    const raw = readFileSync(filePath(), "utf8");
    const parsed = JSON.parse(raw) as { threads?: SlackThreadMemory[] };
    return Array.isArray(parsed.threads) ? parsed.threads : [];
  } catch {
    return [];
  }
}

function writeAll(threads: SlackThreadMemory[]): void {
  writeFileSync(filePath(), `${JSON.stringify({ threads }, null, 2)}\n`, "utf8");
}

function key(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

export function getSlackThread(channelId: string, threadTs: string): SlackThreadMemory | null {
  const k = key(channelId, threadTs);
  return readAll().find((t) => key(t.channelId, t.threadTs) === k) ?? null;
}

export function appendSlackThreadMessage(input: {
  channelId: string;
  threadTs: string;
  teamId?: string;
  message: Omit<SlackThreadMessage, "at"> & { at?: string };
}): SlackThreadMemory {
  const threads = readAll();
  const k = key(input.channelId, input.threadTs);
  const now = new Date().toISOString();
  let thread = threads.find((t) => key(t.channelId, t.threadTs) === k);
  if (!thread) {
    thread = {
      channelId: input.channelId,
      threadTs: input.threadTs,
      teamId: input.teamId,
      messages: [],
      updatedAt: now,
    };
    threads.push(thread);
  }
  thread.messages.push({
    ...input.message,
    text: redact(input.message.text),
    at: input.message.at ?? now,
  });
  thread.messages = thread.messages.slice(-MAX_MESSAGES);
  thread.updatedAt = now;
  writeAll(threads);
  return thread;
}
