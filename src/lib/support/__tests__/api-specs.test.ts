import { describe, it, expect } from "vitest";
import { normalizeApiSource, detectKind, chunkApiSpec, rankEndpoints, endpointSafety } from "../api-specs";

const OPENAPI_JSON = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Threat Intel API", description: "test" },
  servers: [{ url: "https://api.example.com/v3" }],
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
  paths: {
    "/indicators/": {
      get: {
        summary: "List indicators",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
        responses: { "200": { description: "ok" }, "401": { description: "unauthorized" } },
      },
      post: {
        summary: "Create indicator",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", required: ["value", "type"], properties: { value: {}, type: {}, note: {} } },
            },
          },
        },
        responses: { "201": { description: "created" } },
      },
    },
    "/indicators/{id}/": {
      delete: { summary: "Delete indicator", responses: { "204": { description: "gone" } } },
    },
  },
});

const POSTMAN = JSON.stringify({
  info: { name: "Checkout API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json", _postman_id: "x" },
  variable: [{ key: "baseUrl", value: "https://api.shop.com" }, { key: "token", value: "secret-xyz" }],
  item: [
    {
      name: "Orders",
      item: [
        {
          name: "Create order",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "{{baseUrl}}/orders?dryRun=true", path: ["orders"], query: [{ key: "dryRun", value: "true" }] },
            body: { mode: "raw", raw: '{"item":"sku1","qty":2}' },
          },
        },
      ],
    },
  ],
});

describe("API source normalization", () => {
  it("detects kinds", () => {
    expect(detectKind(OPENAPI_JSON)).toBe("openapi");
    expect(detectKind(POSTMAN)).toBe("postman");
    expect(detectKind("curl -X POST https://x.com/a -d '{}'")).toBe("curl");
    expect(detectKind("## API\n\nGET /things returns things")).toBe("markdown");
  });

  it("normalizes OpenAPI: base URL, auth, params, fields, effect", () => {
    const spec = normalizeApiSource(OPENAPI_JSON);
    expect(spec.baseUrl).toBe("https://api.example.com/v3");
    expect(spec.authType).toBe("bearer");
    expect(spec.endpoints).toHaveLength(3);

    const post = spec.endpoints.find((e) => e.method === "POST")!;
    expect(post.requiredFields).toEqual(expect.arrayContaining(["value", "type"]));
    expect(post.optionalFields).toContain("note");
    expect(post.effect).toBe("write");

    const get = spec.endpoints.find((e) => e.method === "GET")!;
    expect(get.effect).toBe("read");
    expect(get.queryParams.map((q) => q.name)).toContain("limit");
    expect(get.responses.some((r) => r.isError)).toBe(true);

    const del = spec.endpoints.find((e) => e.method === "DELETE")!;
    expect(del.effect).toBe("destructive");
  });

  it("classifies endpoint safety (DELETE blocked, POST approval, GET read-only)", () => {
    const spec = normalizeApiSource(OPENAPI_JSON);
    const del = spec.endpoints.find((e) => e.method === "DELETE")!;
    expect(endpointSafety(del).blocked).toBe(true);
    const post = spec.endpoints.find((e) => e.method === "POST")!;
    expect(endpointSafety(post).requiresApproval).toBe(true);
    const get = spec.endpoints.find((e) => e.method === "GET")!;
    expect(endpointSafety(get).safetyClass).toBe("READ_ONLY");
  });

  it("normalizes Postman: resolves variables, folders, body, redacts secret vars", () => {
    const spec = normalizeApiSource(POSTMAN);
    expect(spec.sourceKind).toBe("postman");
    expect(spec.baseUrl).toBe("https://api.shop.com");
    expect(spec.variables?.token).toBeUndefined(); // secret var dropped
    const ep = spec.endpoints[0];
    expect(ep.method).toBe("POST");
    expect(ep.path).toBe("/orders");
    expect(ep.group).toBe("Orders");
    expect(ep.queryParams.map((q) => q.name)).toContain("dryRun");
    expect(ep.optionalFields).toEqual(expect.arrayContaining(["item", "qty"]));
  });

  it("parses cURL", () => {
    const spec = normalizeApiSource(`curl -X POST https://api.x.com/v1/tags -H "Authorization: Bearer t" -d '{"name":"phish"}'`);
    expect(spec.sourceKind).toBe("curl");
    expect(spec.baseUrl).toBe("https://api.x.com");
    expect(spec.endpoints[0].method).toBe("POST");
    expect(spec.endpoints[0].path).toBe("/v1/tags");
    expect(spec.endpoints[0].optionalFields).toContain("name");
  });

  it("chunks endpoints with endpoint metadata", () => {
    const spec = normalizeApiSource(OPENAPI_JSON);
    const chunks = chunkApiSpec(spec);
    expect(chunks).toHaveLength(3);
    const c = chunks[0];
    expect(c.metadata.sourceType).toBe("openapi");
    expect(c.metadata.endpoint_path).toBeTruthy();
    expect(c.metadata.http_method).toBeTruthy();
  });

  it("ranks endpoints for a natural-language query", () => {
    const spec = normalizeApiSource(OPENAPI_JSON);
    const ranked = rankEndpoints(spec, "create a new indicator", 2);
    expect(ranked[0].method).toBe("POST");
  });
});
