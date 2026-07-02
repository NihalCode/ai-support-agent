import "server-only";

import { generateCql } from "../cql/generate";
import { runCqlAgent } from "../agents/cqlAgent";
import { CQL_DOC_BASE, CQL_DOC_PAGES } from "../cql/ingest-docs";
import { formatEvidenceLinksMarkdown } from "../investigation/evidence-links";
import type { InvestigationContext } from "../investigation/types";

const GRAMMAR_PAGES: { title: string; file: string }[] = [
  { title: "CQL overview", file: "cyware-query-language--cql-.html" },
  { title: "Understand CQL grammar", file: "understand-cql-grammar.html" },
  { title: "Apply conditions (operators)", file: "apply-conditions-based-on-operators.html" },
  { title: "CQL query use cases", file: "cql-query-usecase.html" },
];

function defaultGrammarLinks(): string[] {
  return GRAMMAR_PAGES.map((p) => `- [${p.title}](${CQL_DOC_BASE}${p.file})`);
}

/** Markdown reply for CQL authoring (web UI + investigations). */
export async function buildCqlMarkdownReply(text: string): Promise<string> {
  const [generated, cqlAgent] = await Promise.all([generateCql(text), runCqlAgent({ text })]);

  const lines: string[] = [
    "# CQL query help",
    "",
    "This is a **CQL authoring request** for CTIX — not an incident investigation.",
    "",
  ];

  if (generated.cql) {
    lines.push("## Suggested CQL", "", "Verify against indexed grammar docs before running in CTIX:", "", "```", generated.cql, "```");
    if (generated.explanation) lines.push("", generated.explanation.slice(0, 600));
  } else {
    lines.push(
      generated.explanation ||
        "Could not generate grounded CQL yet. Index CQL docs in AI Support Studio (Integrations → Cyware CQL → Index), then retry."
    );
    if (generated.missingInfo?.length) {
      lines.push("", ...generated.missingInfo.map((m) => `- ${m}`));
    }
  }

  const docLinks = new Map<string, string>();
  for (const s of cqlAgent.data.docsSnippets) {
    if (s.url?.startsWith("http")) docLinks.set(s.url, s.title);
  }
  for (const p of GRAMMAR_PAGES) {
    const url = `${CQL_DOC_BASE}${p.file}`;
    if (!docLinks.has(url)) docLinks.set(url, p.title);
  }

  lines.push("", "## CQL grammar docs");
  if (docLinks.size > 0) {
    for (const [url, title] of docLinks) lines.push(`- [${title}](${url})`);
  } else {
    lines.push(...defaultGrammarLinks());
  }

  return lines.join("\n");
}

export function formatCqlInvestigationMarkdown(ctx: Partial<InvestigationContext>): string {
  const q = ctx.query;
  const cql = ctx.cql;
  const lines = [
    "# CQL Query Help",
    "",
    "## Request",
    q?.text ?? "(none)",
    "",
    "## Details Known",
    "- Type: CQL authoring (CTIX threat data search)",
    "- Endpoint: — (CQL runs in CTIX, not a REST path)",
    "",
    "## Missing Details",
    "- None",
    "",
    "## Suggested CQL",
  ];

  const query = cql?.queries?.[0];
  if (query?.cql) {
    lines.push("", "```", query.cql, "```", "", query.explanation || "");
  } else {
    lines.push("", cql?.summary ?? "Index CQL docs and retry generation.");
  }

  lines.push("", "## Evidence Checked", `- CQL docs: ${cql?.summary ?? "—"}`);
  lines.push(formatEvidenceLinksMarkdown(ctx));
  return lines.join("\n");
}

export function cqlGrammarDocUrls(): string[] {
  return CQL_DOC_PAGES.map((p) => `${CQL_DOC_BASE}${p}`);
}
