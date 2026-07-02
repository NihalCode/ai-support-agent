import { describe, expect, it } from "vitest";

import { resolveApiDocUrl, theneoMdToBrowseUrl } from "../cyware-doc-url";
import { formatEvidenceLinksMarkdown, formatEvidenceLinksSlack } from "../investigation/evidence-links";
import type { InvestigationContext } from "../investigation/types";

describe("theneoMdToBrowseUrl", () => {
  it("converts .md export URL to browsable SPA path", () => {
    expect(
      theneoMdToBrowseUrl(
        "https://ctixapiv3.cyware.com/intel-exchange-api-reference/tags/list-tags.md"
      )
    ).toBe(
      "https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference/tags/list-tags"
    );
  });
});

describe("resolveApiDocUrl", () => {
  it("prefers endpoint docUrl over spec landing page", () => {
    const url = resolveApiDocUrl({
      docUrl: "https://ctixapiv3.cyware.com/intel-exchange-api-reference/rest-auth/get-auth-config.md",
      sourceName: "Cyware Intel Exchange (CTIX)",
      title: "Get Authentication Configuration",
      method: "GET",
      path: "/rest-auth/auth-config/",
    });
    expect(url).toContain("/rest-auth/get-auth-config");
    expect(url).not.toContain(".md");
  });

  it("guesses deep link from endpoint path when docUrl is missing", () => {
    const url = resolveApiDocUrl({
      sourceName: "Cyware Intel Exchange (CTIX)",
      title: "Get Authentication Configuration",
      method: "GET",
      path: "/rest-auth/auth-config/",
    });
    expect(url).toContain("intel-exchange-api-reference/rest-auth/get-authentication-configuration");
  });
});

describe("evidence link formatting", () => {
  const ctx: Partial<InvestigationContext> = {
    docs: {
      docs: [
        {
          id: "1",
          sourceType: "docs",
          title: "List Tags",
          summary: "List tags",
          url: "https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference/tags/list-tags",
          metadata: { method: "GET", path: "/v3/tags/" },
        },
      ],
      summary: "Found 1 API doc endpoint(s) relevant to the query.",
      mock: false,
    },
    cql: {
      queries: [],
      docsSnippets: [
        {
          title: "Apply conditions based on operators",
          summary: "Operators",
          url: "https://techdocs.cyware.com/ctix/en/apply-conditions-based-on-operators.html#apply-conditions-based-on-operators",
        },
      ],
      summary: "Found 1 CQL doc snippet(s)",
      mock: false,
    },
  };

  it("adds markdown links for API and CQL docs", () => {
    const md = formatEvidenceLinksMarkdown(ctx);
    expect(md).toContain("[List Tags](");
    expect(md).toContain("/tags/list-tags");
    expect(md).toContain("[Apply conditions based on operators](");
  });

  it("adds Slack mrkdwn links", () => {
    const slack = formatEvidenceLinksSlack(ctx);
    expect(slack).toContain("<https://");
    expect(slack).toContain("|List Tags>");
  });
});
