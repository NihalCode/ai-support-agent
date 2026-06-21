import { describe, it, expect } from "vitest";
import { extractTheneoPage } from "../api-specs/theneo";
import { collectionUrlFromDocumenterHtml } from "../api-specs/postman-documenter";
import { CYWARE_PRODUCT_PRESETS } from "../cyware-products";

describe("Theneo page extraction", () => {
  it("extracts pre block content from HTML export", () => {
    const html = `<html><body><pre>GET /v3/ping\nHealth check</pre></body></html>`;
    expect(extractTheneoPage(html)).toContain("GET /v3/ping");
  });

  it("detects METHOD /path patterns in extracted text", () => {
    const text = extractTheneoPage(`<pre>POST /v3/tags/\nCreate a tag</pre>`);
    expect(text).toMatch(/POST \/v3\/tags\//);
  });
});

describe("Postman Documenter", () => {
  it("extracts collection URL from CFTR-style HTML", () => {
    const html = `<meta name="ownerId" content="4787352"><meta name="publishedId" content="UVeDuTqn">`;
    const url = collectionUrlFromDocumenterHtml(html, "https://cftrapi.cyware.com/");
    expect(url).toContain("/api/collections/4787352/UVeDuTqn");
  });
});

describe("Cyware product presets", () => {
  it("defines all four products", () => {
    expect(Object.keys(CYWARE_PRODUCT_PRESETS).sort()).toEqual(["cftr", "csap", "ctix", "orchestrate"]);
  });

  it("uses Theneo for CSAP and Postman Documenter for CFTR", () => {
    expect(CYWARE_PRODUCT_PRESETS.csap.importStrategy).toBe("theneo");
    expect(CYWARE_PRODUCT_PRESETS.cftr.importStrategy).toBe("postman-documenter");
    expect(CYWARE_PRODUCT_PRESETS.orchestrate.importStrategy).toBe("theneo");
  });
});
