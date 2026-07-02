import "server-only";

import type { InvestigationContext } from "./types";
import { cqlDocUrl } from "../cyware-doc-url";
import { formatApiEndpointDisplay, productForSpecId } from "../api-base-url";

const MAX_API_LINKS = 6;
const MAX_CQL_LINKS = 4;

export interface DocLinkLine {
  label: string;
  url: string;
  detail?: string;
}

export function collectApiDocLinks(ctx: Partial<InvestigationContext>): DocLinkLine[] {
  const docs = ctx.docs?.docs ?? [];
  return docs
    .slice(0, MAX_API_LINKS)
    .map((d) => ({
      label: d.title,
      url: d.url ?? "",
      detail:
        d.metadata?.method && d.metadata?.path
          ? formatApiEndpointDisplay(String(d.metadata.path), {
              method: String(d.metadata.method),
              specId: String(d.metadata.repo ?? ""),
              productId: productForSpecId(String(d.metadata.repo ?? "")),
            })
          : undefined,
    }))
    .filter((l) => l.url.startsWith("http"));
}

export function collectCqlDocLinks(ctx: Partial<InvestigationContext>): DocLinkLine[] {
  const snippets = ctx.cql?.docsSnippets ?? [];
  return snippets
    .slice(0, MAX_CQL_LINKS)
    .map((s) => ({
      label: s.title,
      url:
        s.url ??
        cqlDocUrl({
          pageUrl: s.pageUrl,
          heading: s.title,
        }) ??
        "",
    }))
    .filter((l) => l.url.startsWith("http"));
}

export function formatEvidenceLinksMarkdown(ctx: Partial<InvestigationContext>): string {
  const api = collectApiDocLinks(ctx);
  const cql = collectCqlDocLinks(ctx);
  if (api.length === 0 && cql.length === 0) return "";

  const lines = ["", "## Relevant documentation", ""];
  if (api.length > 0) {
    lines.push("### API reference");
    for (const link of api) {
      lines.push(
        `- [${link.label}](${link.url})${link.detail ? ` — \`${link.detail}\`` : ""}`
      );
    }
  }
  if (cql.length > 0) {
    if (api.length > 0) lines.push("");
    lines.push("### CQL documentation");
    for (const link of cql) {
      lines.push(`- [${link.label}](${link.url})`);
    }
  }
  return lines.join("\n");
}

/** Slack mrkdwn: `<url|label>` */
export function formatEvidenceLinksSlack(ctx: Partial<InvestigationContext>): string {
  const api = collectApiDocLinks(ctx);
  const cql = collectCqlDocLinks(ctx);
  if (api.length === 0 && cql.length === 0) return "";

  const lines = ["\n*Relevant docs*"];
  for (const link of api) {
    const detail = link.detail ? ` (${link.detail})` : "";
    lines.push(`• <${link.url}|${link.label}>${detail}`);
  }
  for (const link of cql) {
    lines.push(`• <${link.url}|${link.label}>`);
  }
  return lines.join("\n");
}
