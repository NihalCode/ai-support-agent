import { describe, it, expect } from "vitest";
import { chunkFile, chunkIssue, chunkCommit } from "../chunk";
import type { RepoFile, NormalizedIssue, CommitInfo, RepoRef } from "../types";

const ref: RepoRef = { owner: "acme", name: "checkout-service", branch: "main" };

describe("chunkFile", () => {
  it("splits code by symbols with line ranges + metadata", () => {
    const file: RepoFile = {
      path: "src/api/charge.ts",
      language: "typescript",
      size: 200,
      content: [
        "import { config } from '../config/env';",
        "",
        "export async function charge(id: string) {",
        "  return fetch(config.paymentApiBase);",
        "}",
        "",
        "export function helper() {",
        "  return 1;",
        "}",
      ].join("\n"),
    };
    const chunks = chunkFile(file, ref);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.metadata.repo).toBe("acme/checkout-service");
      expect(c.metadata.filePath).toBe("src/api/charge.ts");
      expect(c.metadata.sourceType).toBe("code");
      expect(c.metadata.lineStart).toBeGreaterThan(0);
    }
    const symbols = chunks.map((c) => c.metadata.symbol).filter(Boolean);
    expect(symbols).toContain("charge");
    expect(symbols).toContain("helper");
  });

  it("keeps config files whole", () => {
    const file: RepoFile = {
      path: "package.json",
      language: "json",
      size: 50,
      content: '{ "name": "x" }',
    };
    const chunks = chunkFile(file, ref);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.symbol).toBe("config");
  });

  it("splits docs by markdown headings", () => {
    const file: RepoFile = {
      path: "README.md",
      language: "markdown",
      size: 80,
      content: "# Title\n\nintro\n\n## Setup\n\nsteps\n\n## Errors\n\nstuff",
    };
    const chunks = chunkFile(file, ref);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.every((c) => c.metadata.sourceType === "docs")).toBe(true);
  });

  it("produces stable ids and non-empty text", () => {
    const file: RepoFile = { path: "a.ts", language: "typescript", size: 10, content: "const x = 1;" };
    const a = chunkFile(file, ref);
    const b = chunkFile(file, ref);
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].text.length).toBeGreaterThan(0);
  });
});

describe("chunkIssue / chunkCommit", () => {
  it("normalizes an issue into one chunk with ticket metadata", () => {
    const issue: NormalizedIssue = {
      id: "gh#41",
      source: "github",
      number: 41,
      title: "404 after upgrade",
      body: "charge returns 404",
      state: "closed",
      labels: ["bug"],
      comments: [{ author: "dev", body: "migrate to /v2" }],
      url: "https://example.com/41",
    };
    const c = chunkIssue(issue, ref);
    expect(c.metadata.sourceType).toBe("issue");
    expect(c.metadata.title).toBe("404 after upgrade");
    expect(c.text).toContain("migrate to /v2");
  });

  it("marks merged PRs as pr source type", () => {
    const pr: NormalizedIssue = {
      id: "gh#42",
      source: "github",
      title: "fix",
      body: "",
      state: "merged",
      labels: [],
      comments: [],
      url: "https://example.com/42",
    };
    expect(chunkIssue(pr, ref).metadata.sourceType).toBe("pr");
  });

  it("chunks a commit", () => {
    const commit: CommitInfo = { sha: "abc1234", message: "fix things", files: ["a.ts"] };
    const c = chunkCommit(commit, ref);
    expect(c.metadata.sourceType).toBe("commit");
    expect(c.text).toContain("fix things");
  });
});
