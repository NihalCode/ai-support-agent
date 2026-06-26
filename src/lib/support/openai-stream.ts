import "server-only";

import type { ChatMessage } from "./openai";
import { withRetry } from "./retry";

const CHAT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

/** Stream chat completion tokens via OpenAI SSE. Yields text deltas. */
export async function* streamChatText(
  messages: ChatMessage[],
  apiKey: string,
  opts: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string> {
  const res = await withRetry(() =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1200,
        stream: true,
        messages,
      }),
    })
  );

  if (!res.ok || !res.body) {
    throw new Error(`Stream chat failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* skip malformed SSE chunk */
      }
    }
  }
}

/** Simulate streaming by chunking text for heuristic/test mode. */
export async function* simulateStream(text: string, chunkSize = 12): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 8));
  }
}
