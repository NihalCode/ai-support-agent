import { describe, it, expect } from "vitest";
import { htmlToText, discoverCqlPagePaths, CQL_DOC_PAGES } from "../cql/ingest-docs";
import { validateCqlStructure } from "../cql/validate";
import { generateCql } from "../cql/generate";

describe("CQL doc HTML → text", () => {
  it("strips tags, scripts, nav, and decodes entities", () => {
    const html = `<html><head><style>.x{}</style><script>var a=1;</script></head>
      <body><nav>skip</nav><h1>CQL</h1><p>Use field &amp; value &lt;op&gt;</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("CQL");
    expect(text).toContain("field & value <op>");
    expect(text).not.toContain("var a=1");
    expect(text).not.toMatch(/skip/i);
  });

  it("discovers all known CQL pages from landing HTML", () => {
    const html = CQL_DOC_PAGES.map((p) => `<a href="${p}">link</a>`).join(" ");
    const paths = discoverCqlPagePaths(html);
    expect(paths.length).toBeGreaterThanOrEqual(CQL_DOC_PAGES.length);
    expect(paths).toContain("understand-cql-grammar.html");
    expect(paths).toContain("apply-conditions-based-on-operators.html");
  });
});

describe("CQL structural validation", () => {
  it("accepts a balanced query with operators", () => {
    const v = validateCqlStructure('type = "ipv4" AND confidence > 80');
    expect(v.valid).toBe(true);
  });
  it("flags unbalanced quotes/parens", () => {
    expect(validateCqlStructure('type = "ipv4').valid).toBe(false);
    expect(validateCqlStructure("(a = 1").valid).toBe(false);
  });
  it("flags dangling boolean operators", () => {
    expect(validateCqlStructure("a = 1 AND").issues.join(" ")).toMatch(/dangling/i);
  });
});

describe("generateCql — anti-hallucination", () => {
  it("returns missingInfo (no invented CQL) when docs are not indexed", async () => {
    const result = await generateCql("find malicious indicators from the last 30 days");
    // With no CQL docs indexed in the test env, cql must be null and missingInfo set.
    expect(result.cql).toBeNull();
    expect(result.missingInfo?.length).toBeGreaterThan(0);
    expect(result.intent).toContain("malicious indicators");
    expect(result.effect).toBe("read");
  });

  it("classifies tag/add intents as write requiring approval", async () => {
    const result = await generateCql("find matching indicators and add a tag");
    expect(result.effect).toBe("write");
    expect(result.requiresApproval).toBe(true);
  });
});
