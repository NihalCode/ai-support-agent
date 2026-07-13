import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";

import {
  findZendeskExportRoot,
  parseZendeskExportFolder,
} from "../enterprise/zendesk-export-parser";

describe("zendesk export parser", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeMinimalExport(root: string) {
    const ticketsDir = path.join(root, "tickets");
    const commentsDir = path.join(root, "comments");
    await mkdir(ticketsDir, { recursive: true });
    await mkdir(commentsDir, { recursive: true });

    await writeFile(
      path.join(ticketsDir, "1001.json"),
      JSON.stringify({
        id: 1001,
        url: "https://example.zendesk.com/api/v2/tickets/1001.json",
        subject: "CTIX sync failure after tag filter",
        description: "Customer cannot sync indicators.",
        status: "open",
        tags: ["ctix", "sync"],
        priority: "high",
        requester_id: "USER_001",
        assignee_id: "USER_002",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-02-01T12:00:00Z",
      })
    );

    await writeFile(
      path.join(ticketsDir, "1002.json"),
      JSON.stringify({
        id: 1002,
        subject: "Password reset help",
        description: "User forgot password.",
        status: "pending",
        tags: [],
        created_at: "2024-03-01T08:00:00Z",
        updated_at: "2024-03-02T09:00:00Z",
      })
    );

    await writeFile(
      path.join(commentsDir, "1001.json"),
      JSON.stringify({
        comments: [
          {
            author_id: "USER_001",
            body: "Request ID req-1001",
            plain_body: "Request ID req-1001",
            created_at: "2024-01-16T11:00:00Z",
            public: true,
          },
        ],
      })
    );
  }

  it("finds export root nested under base dir", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "zd-export-find-"));
    const nested = path.join(tmpDir, "redacted", "zendesk");
    await writeMinimalExport(nested);

    expect(findZendeskExportRoot(tmpDir)).toBe(nested);
  });

  it("returns null when no tickets folder exists", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "zd-export-miss-"));
    expect(findZendeskExportRoot(tmpDir)).toBeNull();
  });

  it("parses tickets and comments into NormalizedIssue", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "zd-export-parse-"));
    await writeMinimalExport(tmpDir);

    const result = parseZendeskExportFolder(tmpDir, {
      agentBaseUrl: "https://acme.zendesk.com",
    });

    expect(result.errors).toEqual([]);
    expect(result.stats.ticketFilesFound).toBe(2);
    expect(result.stats.ticketsParsed).toBe(2);
    expect(result.stats.commentsLoaded).toBe(1);

    const first = result.tickets.find((t) => t.key === "ZD-1001");
    expect(first).toBeDefined();
    expect(first!.title).toBe("CTIX sync failure after tag filter");
    expect(first!.body).toContain("sync indicators");
    expect(first!.state).toBe("open");
    expect(first!.labels).toEqual(["ctix", "sync"]);
    expect(first!.url).toBe("https://acme.zendesk.com/agent/tickets/1001");
    expect(first!.comments).toHaveLength(1);
    expect(first!.comments[0]?.author).toBe("USER_001");
    expect(first!.comments[0]?.body).toContain("req-1001");

    const second = result.tickets.find((t) => t.key === "ZD-1002");
    expect(second!.url).toBe("https://acme.zendesk.com/agent/tickets/1002");
    expect(second!.comments).toEqual([]);
  });

  it("respects limit and records skipped count", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "zd-export-limit-"));
    await writeMinimalExport(tmpDir);

    const result = parseZendeskExportFolder(tmpDir, { limit: 1 });
    expect(result.tickets).toHaveLength(1);
    expect(result.stats.skipped).toBe(1);
  });

  it("collects parse errors for invalid ticket files", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "zd-export-err-"));
    const ticketsDir = path.join(tmpDir, "tickets");
    await mkdir(ticketsDir, { recursive: true });
    await writeFile(path.join(ticketsDir, "bad.json"), "{ not json");
    await writeFile(path.join(ticketsDir, "empty.json"), JSON.stringify({ subject: "no id" }));

    const result = parseZendeskExportFolder(tmpDir);
    expect(result.tickets).toHaveLength(0);
    expect(result.errors.length).toBe(2);
    expect(result.stats.skipped).toBe(2);
  });
});
