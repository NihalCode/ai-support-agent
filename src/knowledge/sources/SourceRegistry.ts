import "server-only";

import {
  CYWARE_PRODUCT_PRESETS,
  type CywareProductId,
} from "@/lib/support/cyware-products";
import { DEFAULT_CQL_DOC_URL } from "@/lib/support/cql/ingest-docs";
import type { KnowledgeSourceConfig } from "../types";

const DEFAULT_SYNC_HOURS = Number.parseInt(
  process.env.KNOWLEDGE_SYNC_INTERVAL_HOURS?.trim() || "24",
  10
);

function envUrl(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v || fallback;
}

function cywareSource(id: CywareProductId): KnowledgeSourceConfig {
  const preset = CYWARE_PRODUCT_PRESETS[id];
  const urlKey = `${id.toUpperCase()}_DOCS_URL` as const;
  const url = envUrl(urlKey, preset.docsSiteUrl);
  return {
    id: `cyware-${id}`,
    name: preset.name,
    product: id,
    type: id === "cftr" ? "openapi" : "markdown",
    url,
    enabled: process.env[`KNOWLEDGE_SOURCE_${id.toUpperCase()}_ENABLED`] !== "false",
    syncIntervalHours: DEFAULT_SYNC_HOURS,
  };
}

/** Central registry for automatic knowledge ingestion sources. */
export function listKnowledgeSources(): KnowledgeSourceConfig[] {
  const sources: KnowledgeSourceConfig[] = [
    cywareSource("csap"),
    cywareSource("cftr"),
    cywareSource("ctix"),
    cywareSource("orchestrate"),
    {
      id: "cyware-cql",
      name: "Cyware Query Language (CQL)",
      product: "cql",
      type: "url",
      url: envUrl("CQL_DOCS_URL", DEFAULT_CQL_DOC_URL),
      enabled: process.env.KNOWLEDGE_SOURCE_CQL_ENABLED !== "false",
      syncIntervalHours: DEFAULT_SYNC_HOURS,
    },
    {
      id: "confluence-knowledge",
      name: "Confluence knowledge base",
      product: "confluence",
      type: "confluence",
      enabled: process.env.KNOWLEDGE_SOURCE_CONFLUENCE_ENABLED !== "false",
      syncIntervalHours: DEFAULT_SYNC_HOURS,
    },
    {
      id: "zendesk-tickets",
      name: "Zendesk support tickets",
      product: "zendesk",
      type: "zendesk",
      enabled: process.env.KNOWLEDGE_SOURCE_ZENDESK_ENABLED !== "false",
      syncIntervalHours: DEFAULT_SYNC_HOURS,
    },
  ];

  const supportUrl = process.env.SUPPORT_DOCS_URL?.trim();
  if (supportUrl) {
    sources.push({
      id: "internal-support-docs",
      name: "Internal support documentation",
      product: "support_docs",
      type: "url",
      url: supportUrl,
      enabled: process.env.KNOWLEDGE_SOURCE_SUPPORT_DOCS_ENABLED !== "false",
      syncIntervalHours: DEFAULT_SYNC_HOURS,
    });
  }

  return sources;
}

export function getKnowledgeSource(id: string): KnowledgeSourceConfig | null {
  return listKnowledgeSources().find((s) => s.id === id) ?? null;
}

export function listEnabledKnowledgeSources(): KnowledgeSourceConfig[] {
  return listKnowledgeSources().filter((s) => s.enabled);
}
