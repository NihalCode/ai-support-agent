import { describe, it, expect } from "vitest";
import { extractTheneoPage, parseLlmsIndex, parseCywareEndpointPre } from "../api-specs/theneo";
import { collectionUrlFromDocumenterHtml } from "../api-specs/postman-documenter";
import { CYWARE_PRODUCT_PRESETS } from "../cyware-products";

const SAMPLE_LLMS = `
Intel Exchange API Reference
## Sections
- [Delete Note](https://ctixapiv3.cyware.com/intel-exchange-api-reference/global-notes/delete-note.md): Deletes a note
- [List Tags](https://ctixapiv3.cyware.com/intel-exchange-api-reference/tags/list-tags.md): List all tags
`;

describe("Theneo llms.txt parsing", () => {
  it("extracts markdown .md links from llms.txt", () => {
    const entries = parseLlmsIndex(SAMPLE_LLMS);
    expect(entries.length).toBe(2);
    expect(entries[0].url).toContain("delete-note.md");
    expect(entries[1].title).toBe("List Tags");
  });

  it("parses Cyware endpoint JSON from pre text", () => {
    const pre = `Deletes a note by ID.\n{"endpoints":{"method":"DELETE","path":"ingestion/notes/{note_id}/"},"request":{"path":[{"name":"note_id","isRequired":true}]}}`;
    const ep = parseCywareEndpointPre(pre);
    expect(ep?.method).toBe("DELETE");
    expect(ep?.path).toBe("/ingestion/notes/{note_id}/");
  });
});

describe("Theneo page extraction", () => {
  it("extracts pre block content from HTML export", () => {
    const html = `<html><body><pre>GET /v3/ping\nHealth check</pre></body></html>`;
    expect(extractTheneoPage(html)).toContain("GET /v3/ping");
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
