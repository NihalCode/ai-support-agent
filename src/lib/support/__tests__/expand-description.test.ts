import { describe, it, expect } from "vitest";
import { expandClientDescription, isLowInfoDescription } from "../expand-description";

describe("expandClientDescription", () => {
  const issue = {
    id: "gh#1024",
    source: "github" as const,
    number: 1024,
    title: "fix: handle escaped backslash before n/r in double-quoted values",
    body: "In parse(), double-quoted values with \\\\n misfire.",
    state: "open",
    labels: ["bug"],
    comments: [{ author: "dev", body: "Reproduced with FOO=\"\\\\nbar\"" }],
    url: "https://github.com/motdotla/dotenv/issues/1024",
  };

  it("uses ticket text when description is empty", () => {
    const out = expandClientDescription("", issue);
    expect(out).toContain("parse()");
    expect(out).toContain("escaped backslash");
  });

  it("uses ticket text when description is a short non-technical line", () => {
    const out = expandClientDescription("it broke", issue);
    expect(out).toContain("escaped backslash");
  });

  it("keeps a detailed description and appends ticket", () => {
    const long =
      "The parser mishandles double quoted env values with backslashes before n and r characters in production.";
    const out = expandClientDescription(long, issue);
    expect(out.startsWith(long)).toBe(true);
    expect(out).toContain("linked ticket");
  });

  it("flags low-info one-liners", () => {
    expect(isLowInfoDescription("it broke")).toBe(true);
    expect(isLowInfoDescription("gh#1024")).toBe(false); // issue ref in text counts as a signal
    expect(isLowInfoDescription("Charge endpoint returns 404 after upgrade today")).toBe(false);
  });
});
