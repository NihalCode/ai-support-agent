import { describe, it, expect } from "vitest";
import { detectSource } from "../sourceDetector";

describe("sourceDetector", () => {
  it("detects Postman collection JSON", () => {
    const r = detectSource({
      content: '{"info":{"name":"Test","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"}}',
    });
    expect(r.kind).toBe("postman");
  });

  it("detects OpenAPI", () => {
    const r = detectSource({ content: '{"openapi":"3.0.0","paths":{"/ping":{"get":{}}}}' });
    expect(r.kind).toBe("openapi");
  });

  it("detects CQL docs URL", () => {
    const r = detectSource({ url: "https://techdocs.cyware.com/ctix/en/cyware-query-language--cql-.html" });
    expect(r.kind).toBe("cql-docs");
  });

  it("detects Theneo Cyware docs", () => {
    const r = detectSource({ url: "https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference" });
    expect(r.kind).toBe("theneo");
  });
});
