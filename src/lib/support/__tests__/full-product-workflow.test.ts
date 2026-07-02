import { describe, expect, it } from "vitest";

import { runCqlAgent } from "../agents/cqlAgent";
import { runDocsAgent } from "../agents/docsAgent";
import { runInvestigation } from "../agents/orchestratorAgent";
import {
  detectCywareProducts,
  retrieveApiEndpointContext,
  buildCywareActionPlan,
} from "../api-context";
import { loadBundledCywareSpec } from "../api-specs/bundled-specs";
import { theneoMdToBrowseUrl } from "../cyware-doc-url";
import {
  collectApiDocLinks,
  collectCqlDocLinks,
  formatEvidenceLinksMarkdown,
} from "../investigation/evidence-links";
import type { SupportQuery } from "../investigation/types";

const MULTI_PRODUCT =
  "Orchestrate playbook Enrich and Block High-Confidence IPs failed silently. Run CQL for malicious IP indicators last 24h confidence >= 90, enrich via CTIX threat data API, push CSAP intel card, trigger CFTR incident if more than 5 IPs match. TIMEOUT after 45s.";

const SCENARIOS: { id: string; query: SupportQuery; products: string[]; pathRe: RegExp }[] = [
  {
    id: "ctix",
    query: {
      text: "401 Unauthorized on CTIX Open API since this morning — signature expiry on POST /v3/indicators/search/",
      statusCode: 401,
      endpoint: "/v3/indicators/search/",
    },
    products: ["ctix"],
    pathRe: /indicator|ping|enrichment|auth|rest-auth/i,
  },
  {
    id: "cftr",
    query: {
      text: "CFTR incident API returns 401 — cannot POST create incident since this morning",
      statusCode: 401,
    },
    products: ["cftr"],
    pathRe: /incident|forms/i,
  },
  {
    id: "orchestrate",
    query: {
      text: "Orchestrate playbook Block Malicious IP timed out after 45s — need run logs and node results",
    },
    products: ["orchestrate"],
    pathRe: /playbook-result|playbook\/run|node-results/i,
  },
  {
    id: "cql",
    query: {
      text: "CQL query for malicious IP indicators last 24 hours confidence 90 — which operators and grammar?",
    },
    products: ["ctix"],
    pathRe: /.*/,
  },
  {
    id: "multi",
    query: { text: MULTI_PRODUCT },
    products: ["orchestrate", "ctix", "csap", "cftr"],
    pathRe: /playbook|incident|create_card|indicator/i,
  },
];

describe("bundled Cyware specs", () => {
  it("loads CTIX, CFTR, Orchestrate, CSAP endpoint catalogs", () => {
    expect(loadBundledCywareSpec("ctix")?.endpoints.length).toBeGreaterThan(100);
    expect(loadBundledCywareSpec("cftr")?.endpoints.length).toBeGreaterThan(100);
    expect(loadBundledCywareSpec("orchestrate")?.endpoints.length).toBeGreaterThan(30);
    expect(loadBundledCywareSpec("csap")?.endpoints.length).toBeGreaterThan(50);
  });
});

describe("retrieveApiEndpointContext — per product", () => {
  for (const s of SCENARIOS.filter((x) => x.id !== "cql")) {
    it(`${s.id}: returns ranked endpoints with deep doc URLs`, async () => {
      const chunks = retrieveApiEndpointContext(s.query.text, 6);
      expect(chunks.length).toBeGreaterThan(0);

      const repos = new Set(chunks.map((c) => c.metadata.repo));
      for (const p of s.products) {
        expect(repos.has(`cyware-${p}-api`)).toBe(true);
      }

      const paths = chunks.map((c) => c.metadata.endpoint_path ?? "").join(" ");
      expect(paths).toMatch(s.pathRe);

      for (const c of chunks) {
        const url = c.metadata.url ?? "";
        expect(url.startsWith("http")).toBe(true);
        expect(url).not.toMatch(/llms\.txt$/);
      }
    });
  }
});

describe("docs + CQL agents — snippet links", () => {
  it("docs agent attaches non-landing URLs for CTIX 401", async () => {
    const r = await runDocsAgent({
      text: "401 CTIX Open API unauthorized POST /v3/indicators/search/",
      statusCode: 401,
      endpoint: "/v3/indicators/search/",
    });
    expect(r.data.docs.length).toBeGreaterThan(0);
    for (const d of r.data.docs) {
      expect(d.url?.startsWith("http")).toBe(true);
      expect(d.url).not.toMatch(/llms\.txt$/);
    }
  });

  it("CQL agent returns doc snippet URLs when indexed", async () => {
    const r = await runCqlAgent({
      text: "CQL malicious IP indicators last 24h confidence 90 operators grammar",
    });
    if (r.data.docsSnippets.length > 0) {
      const withUrl = r.data.docsSnippets.filter((s) => s.url?.startsWith("http"));
      expect(withUrl.length).toBeGreaterThan(0);
      expect(withUrl[0]!.url).toMatch(/techdocs\.cyware\.com|cyware/i);
    }
  });
});

describe("runInvestigation — full workflow messages", () => {
  it("multi-product investigation includes evidence doc links in markdown", async () => {
    const result = await runInvestigation({ text: MULTI_PRODUCT });
    expect(result.sessionId).toBeTruthy();
    expect(result.markdownReport).toMatch(/Investigation Summary/);

    const apiLinks = collectApiDocLinks(result.context);
    const cqlLinks = collectCqlDocLinks(result.context);
    expect(apiLinks.length + cqlLinks.length).toBeGreaterThan(0);

    const mdLinks = formatEvidenceLinksMarkdown(result.context);
    expect(mdLinks).toMatch(/Relevant documentation/);
    expect(mdLinks).toMatch(/https?:\/\//);

    for (const link of apiLinks) {
      expect(link.url).not.toMatch(/llms\.txt$/);
    }
  }, 120_000);

  it("buildCywareActionPlan names endpoints for all four API products", () => {
    const products = detectCywareProducts(MULTI_PRODUCT);
    expect(products).toEqual(expect.arrayContaining(["orchestrate", "ctix", "csap", "cftr"]));

    const chunks = retrieveApiEndpointContext(MULTI_PRODUCT, 4);
    const plan = buildCywareActionPlan(MULTI_PRODUCT, chunks, []);
    expect(plan).not.toBeNull();
    expect(plan!.fixSteps.join(" ")).toMatch(/playbook-result|playbook/i);
    expect(plan!.fixSteps.join(" ")).toMatch(/incident|CFTR/i);
    expect(plan!.fixSteps.join(" ")).toMatch(/CQL/i);
  });
});

describe("theneoMdToBrowseUrl", () => {
  it("produces browsable CTIX doc paths", () => {
    const url = theneoMdToBrowseUrl(
      "https://ctixapiv3.cyware.com/intel-exchange-api-reference/tags/list-tags.md"
    );
    expect(url).toContain("/intel-exchange-api-reference/tags/list-tags");
    expect(url).not.toContain(".md");
  });
});
