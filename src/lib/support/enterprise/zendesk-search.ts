import "server-only";

import { getConfig, hasOpenAI, hasPinecone } from "../config";
import { retrieveAcross } from "../retrieve";
import { zendeskTicketNamespace } from "../enterprise/zendesk-ticket-ingest";
import {
  countStoredZendeskTickets,
  getStoredZendeskTicket,
  searchStoredZendeskTickets,
} from "../enterprise/stores/zendesk-ticket-store";
import type { NormalizedIssue } from "../types";

export async function searchZendeskForAgent(
  query: string,
  limit = 6,
  liveSearch?: (query: string, limit: number) => Promise<NormalizedIssue[]>,
  organizationId?: string
): Promise<{ tickets: NormalizedIssue[]; fromIndex: boolean; fromLive: boolean }> {
  const storedCount = await countStoredZendeskTickets(organizationId);
  const local =
    storedCount > 0
      ? await searchStoredZendeskTickets(query, limit, organizationId)
      : [];
  let semantic: NormalizedIssue[] = [];

  const cfg = getConfig();
  if (storedCount > 0 && hasOpenAI(cfg) && hasPinecone(cfg)) {
    try {
      const { chunks } = await retrieveAcross(
        [zendeskTicketNamespace(organizationId)],
        query,
        limit
      );
      semantic = await Promise.all(
        chunks
          .filter((c) => c.metadata.sourceType === "zendesk")
          .map(async (c) => {
            const key = String(c.metadata.filePath ?? c.id);
            const stored = await getStoredZendeskTicket(key, organizationId);
            return stored ?? {
              id: key,
              source: "zendesk" as const,
              key,
              title: String(c.metadata.title ?? c.text.split("\n")[0] ?? "Zendesk ticket"),
              body: c.text,
              state: "unknown",
              labels: [],
              comments: [],
              url: c.metadata.url ?? "",
            };
          })
      );
    } catch {
      /* optional semantic path */
    }
  }

  const merged = [...local];
  const seen = new Set(local.map((t) => t.id));
  for (const t of semantic) {
    if (!seen.has(t.id)) merged.push(t);
  }

  let fromLive = false;
  if (merged.length < limit && liveSearch) {
    const live = await liveSearch(query, limit);
    for (const t of live) {
      if (!seen.has(t.id)) {
        merged.push(t);
        seen.add(t.id);
      }
    }
    fromLive = live.length > 0;
  }

  return {
    tickets: merged.slice(0, limit),
    fromIndex: local.length > 0 || semantic.length > 0,
    fromLive,
  };
}
