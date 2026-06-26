import { describe, it, expect } from "vitest";
import {
  detectCywareProducts,
  retrieveApiEndpointContext,
  buildCywareActionPlan,
  mergeFixSteps,
  isVagueSupportStep,
} from "../api-context";

const AISUP5_2_SNIPPET = `
Orchestrate playbook Enrich and Block High-Confidence IPs failed silently — no alert to CSAP.
Run CQL for malicious IP indicators last 24h confidence >= 90, enrich via CTIX threat data API,
push to CSAP intel card, trigger CFTR incident if more than 5 IPs match.
TIMEOUT after 45s. Which Orchestrate APIs for run logs and node failures?
Correct CQL for malicious IP indicators. CTIX API enrich indicator by ID. CSAP API intel card. CFTR incident API.
`;

describe("detectCywareProducts", () => {
  it("detects orchestrate from playbook timeout ticket text", () => {
    const text =
      "Orchestrate playbook Block Malicious IP times out. Need API to check run status and retry.";
    expect(detectCywareProducts(text)).toContain("orchestrate");
  });

  it("detects all four products from AISUP5-2 style ticket", () => {
    const products = detectCywareProducts(AISUP5_2_SNIPPET);
    expect(products).toContain("orchestrate");
    expect(products).toContain("ctix");
    expect(products).toContain("csap");
    expect(products).toContain("cftr");
  });
});

describe("retrieveApiEndpointContext", () => {
  it("returns playbook run endpoints for orchestrate tickets", () => {
    const query =
      "Orchestrate playbook timeout check playbook run status retry Block Malicious IP";
    const chunks = retrieveApiEndpointContext(query, 5);
    const paths = chunks.map((c) => c.metadata.endpoint_path ?? "").join(" ");
    expect(paths).toMatch(/playbook-result|playbook\/run/i);
    expect(chunks.some((c) => /run log|playbook result|run playbook/i.test(c.metadata.title ?? ""))).toBe(true);
  });

  it("returns endpoints from each Cyware product for multi-product tickets", () => {
    const chunks = retrieveApiEndpointContext(AISUP5_2_SNIPPET, 4);
    const repos = new Set(chunks.map((c) => c.metadata.repo));
    expect(repos.has("cyware-orchestrate-api")).toBe(true);
    expect(repos.has("cyware-ctix-api")).toBe(true);
    expect(repos.has("cyware-csap-api")).toBe(true);
    expect(repos.has("cyware-cftr-api")).toBe(true);

    const paths = chunks.map((c) => c.metadata.endpoint_path ?? "").join(" ");
    expect(paths).toMatch(/playbook-result/i);
    expect(paths).toMatch(/create_card|csap/i);
    expect(paths).toMatch(/incident/i);
  });
});

describe("buildCywareActionPlan", () => {
  it("produces named endpoints per product for AISUP5-2", () => {
    const apiChunks = retrieveApiEndpointContext(AISUP5_2_SNIPPET, 4);
    const plan = buildCywareActionPlan(AISUP5_2_SNIPPET, apiChunks, []);
    expect(plan).not.toBeNull();
    expect(plan!.products.length).toBeGreaterThanOrEqual(4);
    expect(plan!.fixSteps.join(" ")).toMatch(/GET.*playbook-result/i);
    expect(plan!.fixSteps.join(" ")).toMatch(/create_card|CSAP/i);
    expect(plan!.fixSteps.join(" ")).toMatch(/incident|CFTR/i);
    expect(plan!.fixSteps.join(" ")).toMatch(/CQL/i);
    expect(isVagueSupportStep("Provide the client with the Orchestrate API")).toBe(true);
    expect(mergeFixSteps(["Provide the client with the API"], plan!.fixSteps)).toEqual(plan!.fixSteps);
  });
});
