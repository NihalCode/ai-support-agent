import "server-only";

import { generateCql } from "../cql/generate";
import { runCqlAgent } from "../agents/cqlAgent";
import { CQL_DOC_BASE, CQL_DOC_PAGES } from "../cql/ingest-docs";
import { slugifyDocTitle } from "../cyware-doc-url";

const GRAMMAR_PAGES: { title: string; file: string }[] = [
  { title: "CQL overview", file: "cyware-query-language--cql-.html" },
  { title: "Understand CQL grammar", file: "understand-cql-grammar.html" },
  { title: "Apply conditions (operators)", file: "apply-conditions-based-on-operators.html" },
  { title: "CQL query use cases", file: "cql-query-usecase.html" },
];

function defaultGrammarLinks(): string[] {
  return GRAMMAR_PAGES.map((p) => {
    const url = `${CQL_DOC_BASE}${p.file}`;
    return `• <${url}|${p.title}>`;
  });
}

/** Compact Slack reply for CQL authoring requests (not incident investigations). */
export async function buildCqlSlackReply(
  text: string,
  appBase?: string | null,
  sessionId?: string
): Promise<string> {
  const [generated, cqlAgent] = await Promise.all([
    generateCql(text),
    runCqlAgent({ text }),
  ]);

  const lines: string[] = ["*CQL query help* (CTIX — not an incident investigation)"];

  if (generated.cql) {
    lines.push("", "*Suggested CQL* (verify against indexed grammar docs):", "```", generated.cql, "```");
    if (generated.explanation) lines.push("", generated.explanation.slice(0, 400));
  } else {
    lines.push(
      "",
      generated.explanation ||
        "Could not generate grounded CQL yet. Index CQL docs in AI Support Studio (Integrations → Cyware CQL → Index), then retry."
    );
    if (generated.missingInfo?.length) {
      lines.push("", generated.missingInfo.map((m) => `• ${m}`).join("\n"));
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

  lines.push("", "*CQL grammar docs*");
  if (docLinks.size > 0) {
    for (const [url, title] of docLinks) {
      lines.push(`• <${url}|${title}>`);
    }
  } else {
    lines.push(...defaultGrammarLinks());
  }

  const base = appBase?.replace(/\/$/, "") ?? "";
  if (base && sessionId) {
    lines.push("", `Open in AI Support Studio: ${base}/?investigation=${sessionId}`);
  } else if (base) {
    lines.push("", `More tools: ${base}`);
  }

  return lines.join("\n").slice(0, 3900);
}

/** Example CQL when generation is unavailable (structurally valid per tests). */
export function exampleMaliciousIpCql(): string {
  return 'type = "ipv4-addr" AND confidence >= 90 AND modified_on >= NOW(-24h)';
}

export function cqlGrammarDocUrls(): string[] {
  return CQL_DOC_PAGES.map((p) => `${CQL_DOC_BASE}${p}`);
}

export function cqlDocUrlWithAnchor(pageFile: string, heading: string): string {
  const base = `${CQL_DOC_BASE}${pageFile}`;
  const anchor = slugifyDocTitle(heading);
  return anchor ? `${base}#${anchor}` : base;
}
