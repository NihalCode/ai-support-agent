import type { BuildAppTemplateId } from "./types";

export function generateEnvSnippet(templateId: BuildAppTemplateId, products: string[]): string {
  const lines = [
    "# Server-side only. Do not expose with NEXT_PUBLIC_.",
    "# Copy to .env.local and fill in real values — never commit .env.local.",
    "",
    "# Optional — app builder / AI features",
    "OPENAI_API_KEY=sk-your-openai-api-key-here",
    "",
  ];

  if (products.some((p) => /ctix|cyware/i.test(p)) || templateId.includes("indicator") || templateId.includes("cql")) {
    lines.push(
      "CYWARE_BASE_URL=https://your-cyware-instance.example.com/ctixapi",
      "CYWARE_ACCESS_ID=your-access-id-here",
      "CYWARE_SECRET_KEY=your-secret-key-here",
      ""
    );
  }

  if (products.some((p) => /csap/i.test(p))) {
    lines.push("CSAP_BASE_URL=https://your-csap-instance.example.com/api", "");
  }

  if (products.some((p) => /orchestrate/i.test(p))) {
    lines.push("ORCHESTRATE_BASE_URL=https://your-orchestrate-instance.example.com/api", "");
  }

  if (products.some((p) => /cftr/i.test(p))) {
    lines.push("CFTR_BASE_URL=https://your-cftr-instance.example.com/api", "");
  }

  lines.push(
    "# Optional Vercel deployment (server-side only)",
    "VERCEL_TOKEN=your-vercel-token-here",
    "VERCEL_ORG_ID=your-vercel-org-id-here",
    "VERCEL_PROJECT_ID=your-vercel-project-id-here"
  );

  return lines.join("\n");
}
