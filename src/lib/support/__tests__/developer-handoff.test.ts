import { describe, it, expect } from "vitest";
import {
  formatDeveloperHandoff,
  userExplicitlyAskedForCommits,
} from "../developer-handoff";
import type { IntentEntities } from "../intent/types";

describe("developer handoff", () => {
  it("includes required sections focused on error context", () => {
    const entities: IntentEntities = {
      supportIssue: "POST /v3/indicators/search returns 404 after upgrade",
      httpMethod: "POST",
      endpoint: "/v3/indicators/search",
      statusCode: "404",
      errorCode: "404",
      event: "after upgrading",
      repo: "acme/checkout-service",
    };
    const md = formatDeveloperHandoff({
      message: "After upgrading, POST /v3/indicators/search returns 404. Repo acme/checkout-service if needed.",
      entities,
    });
    expect(md).toContain("# Developer Handoff");
    expect(md).toContain("## Error / Symptom");
    expect(md).toContain("POST /v3/indicators/search");
    expect(md).toContain("404");
    expect(md).toContain("## Recommended Fix");
    expect(md).not.toContain("## Related Commits");
  });

  it("includes Related Commits only when explicitly requested", () => {
    const entities: IntentEntities = { supportIssue: "API error" };
    const withCommits = formatDeveloperHandoff({
      message: "Check latest commits for this error",
      entities,
      includeCommits: true,
      commitsSummary: "abc123 — fix routing",
    });
    expect(withCommits).toContain("## Related Commits");
    expect(withCommits).toContain("abc123");
  });

  it("userExplicitlyAskedForCommits guard", () => {
    expect(userExplicitlyAskedForCommits("Repo acme/foo if needed")).toBe(false);
    expect(userExplicitlyAskedForCommits("Did a recent commit cause this?")).toBe(true);
    expect(userExplicitlyAskedForCommits("check git log for regressions")).toBe(true);
  });
});
