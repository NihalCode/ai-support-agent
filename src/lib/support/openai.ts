import "server-only";

/**
 * SDK-free OpenAI client (embeddings + chat) via fetch. Returns null/empty on
 * failure so callers can fall back to deterministic behavior.
 */

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 512;
const CHAT_MODEL = "gpt-4o-mini";

export async function embedTexts(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts.map((t) => t.slice(0, 8000)),
      dimensions: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`Embedding failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

export async function embedOne(text: string, apiKey: string): Promise<number[]> {
  const [v] = await embedTexts([text], apiKey);
  return v ?? [];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Chat completion that requests a JSON object response. Returns parsed JSON. */
export async function chatJson<T>(
  messages: ChatMessage[],
  apiKey: string,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1500,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`Chat failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const raw = data.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as T;
}

export const EMBEDDING_DIMENSION = EMBED_DIM;
