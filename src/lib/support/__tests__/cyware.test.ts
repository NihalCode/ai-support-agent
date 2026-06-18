import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CywareConnector } from "../connectors/cyware";
import { listProviders } from "../providers";
import { normalizeApiSource } from "../api-specs";
import { registerSpec } from "../api-specs/registry";

const ENV = { ...process.env };

function setCyware(authType: string) {
  process.env.CYWARE_BASE_URL = "https://ctix.example.com/ctixapi";
  process.env.CYWARE_API_KEY = "cyware-secret-key";
  process.env.CYWARE_CLIENT_ID = "client-1";
  process.env.CYWARE_CLIENT_SECRET = "client-secret";
  process.env.CYWARE_AUTH_TYPE = authType;
}

describe("CywareConnector", () => {
  beforeEach(() => setCyware("bearer"));
  afterEach(() => {
    process.env = { ...ENV };
  });

  it("is configured when base url + key present", () => {
    expect(new CywareConnector().configured).toBe(true);
  });

  it("builds a bearer-authenticated, safety-classified, redacted request", () => {
    const plan = new CywareConnector().buildRequest("POST", "/v3/tags/", { body: { name: "phishing" }, summary: "create tag" });
    expect(plan.url).toBe("https://ctix.example.com/ctixapi/v3/tags/");
    expect(plan.headers.Authorization).toContain("Bearer cyware-secret-key");
    expect(plan.redactedHeaders.Authorization).not.toContain("cyware-secret-key");
    expect(plan.safety.requiresApproval).toBe(true); // POST create
  });

  it("classifies GET search as read-only (no approval)", () => {
    const plan = new CywareConnector().buildRequest("GET", "/v3/indicators/", { query: { q: "evil" }, summary: "search indicators" });
    expect(plan.url).toContain("?q=evil");
    expect(plan.safety.safetyClass).toBe("READ_ONLY");
    expect(plan.safety.requiresApproval).toBe(false);
  });

  it("uses basic auth when configured", () => {
    setCyware("basic");
    const plan = new CywareConnector().buildRequest("GET", "/ping");
    expect(plan.headers.Authorization).toMatch(/^Basic /);
  });

  it("resolves a flow to an endpoint from a registered Cyware spec", () => {
    const spec = normalizeApiSource(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Cyware CTIX API" },
        servers: [{ url: "https://ctix.example.com" }],
        paths: {
          "/v3/indicators/search/": { get: { summary: "Search indicators" } },
          "/v3/tags/": { post: { summary: "Create tag" } },
        },
      }),
      { name: "Cyware CTIX API" }
    );
    registerSpec(spec);
    const resolved = new CywareConnector().resolveFlow("searchIndicators");
    expect(resolved?.endpoint.path).toContain("indicators");
  });
});

describe("provider registry", () => {
  beforeEach(() => setCyware("api_key"));
  afterEach(() => {
    process.env = { ...ENV };
  });
  it("lists Cyware as one provider when configured", () => {
    const providers = listProviders();
    expect(providers.some((p) => p.kind === "cyware")).toBe(true);
  });
});
