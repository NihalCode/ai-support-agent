import "server-only";

import type {
  RepoConnector,
  TicketConnector,
  RepoRef,
  RepoFile,
  CommitInfo,
  NormalizedIssue,
} from "../types";
import { languageFromPath, isProbablyBinary, isIngestableFile } from "../languages";

/**
 * Real GitHub connector using the public REST API v3 with a bearer token.
 * github.com / api.github.com are public hosts, so direct fetch is fine.
 */

const API = "https://api.github.com";

function ghHeaders(token?: string | null) {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ai-support-agent",
  };
  if (token?.trim()) h.Authorization = `Bearer ${token.trim()}`;
  return h;
}

export function parseRepoUrl(input: string): RepoRef | null {
  const trimmed = input.trim();
  // owner/name shorthand
  const short = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) return { owner: short[1], name: short[2].replace(/\.git$/, "") };
  try {
    const u = new URL(trimmed);
    if (!u.hostname.includes("github.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

export class GitHubConnector implements RepoConnector, TicketConnector {
  readonly id = "github";
  readonly isMock = false;
  private token: string | null;
  constructor(token?: string | null) {
    this.token = token?.trim() || null;
  }

  private async json<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, { headers: ghHeaders(this.token) });
    if (!res.ok) {
      throw new Error(`GitHub ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private async defaultBranch(ref: RepoRef): Promise<string> {
    if (ref.branch) return ref.branch;
    const repo = await this.json<{ default_branch: string }>(`/repos/${ref.owner}/${ref.name}`);
    return repo.default_branch || "main";
  }

  async listFiles(ref: RepoRef): Promise<RepoFile[]> {
    const branch = await this.defaultBranch(ref);
    const tree = await this.json<{ tree: { path: string; type: string; size?: number }[] }>(
      `/repos/${ref.owner}/${ref.name}/git/trees/${branch}?recursive=1`
    );
    const wanted = tree.tree
      .filter((t) => t.type === "blob" && isIngestableFile(t.path) && (t.size ?? 0) < 200_000)
      .slice(0, 400); // cap files for ingestion budget
    const files: RepoFile[] = [];
    for (const entry of wanted) {
      try {
        const blob = await this.json<{ content: string; encoding: string }>(
          `/repos/${ref.owner}/${ref.name}/contents/${encodeURIComponent(entry.path)}?ref=${branch}`
        );
        if (blob.encoding !== "base64") continue;
        const content = Buffer.from(blob.content, "base64").toString("utf8");
        if (isProbablyBinary(content)) continue;
        files.push({
          path: entry.path,
          content,
          language: languageFromPath(entry.path),
          size: entry.size ?? content.length,
        });
      } catch {
        // skip unreadable files
      }
    }
    return files;
  }

  async getReadme(ref: RepoRef): Promise<RepoFile | null> {
    try {
      const branch = await this.defaultBranch(ref);
      const readme = await this.json<{ content: string; path: string }>(
        `/repos/${ref.owner}/${ref.name}/readme?ref=${branch}`
      );
      const content = Buffer.from(readme.content, "base64").toString("utf8");
      return { path: readme.path, content, language: "markdown", size: content.length };
    } catch {
      return null;
    }
  }

  async listCommits(ref: RepoRef, limit = 30): Promise<CommitInfo[]> {
    const branch = await this.defaultBranch(ref);
    const commits = await this.json<
      { sha: string; commit: { message: string; author?: { name?: string; date?: string } } }[]
    >(`/repos/${ref.owner}/${ref.name}/commits?sha=${branch}&per_page=${Math.min(limit, 100)}`);
    return commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      author: c.commit.author?.name,
      date: c.commit.author?.date?.slice(0, 10),
    }));
  }

  // --- TicketConnector (GitHub Issues) ---

  private repoFromState: RepoRef | null = null;
  setRepo(ref: RepoRef) {
    this.repoFromState = ref;
  }

  private requireRepo(): RepoRef {
    if (!this.repoFromState) throw new Error("GitHub ticket connector: call setRepo() first");
    return this.repoFromState;
  }

  private normalizeIssue(raw: GitHubIssue): NormalizedIssue {
    const isPr = Boolean(raw.pull_request);
    return {
      id: `gh#${raw.number}`,
      source: "github",
      number: raw.number,
      title: raw.title,
      body: raw.body ?? "",
      state: isPr ? (raw.state === "closed" ? "merged" : "open") : raw.state,
      labels: (raw.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
      assignee: raw.assignee?.login,
      author: raw.user?.login,
      comments: [],
      url: raw.html_url,
      createdAt: raw.created_at?.slice(0, 10),
      updatedAt: raw.updated_at?.slice(0, 10),
    };
  }

  async getIssue(ref: string): Promise<NormalizedIssue | null> {
    const repo = this.requireRepo();
    const num = ref.replace(/[^0-9]/g, "");
    if (!num) return null;
    try {
      const raw = await this.json<GitHubIssue>(`/repos/${repo.owner}/${repo.name}/issues/${num}`);
      const issue = this.normalizeIssue(raw);
      const comments = await this.json<{ user?: { login?: string }; body?: string; created_at?: string }[]>(
        `/repos/${repo.owner}/${repo.name}/issues/${num}/comments?per_page=30`
      );
      issue.comments = comments.map((c) => ({
        author: c.user?.login ?? "unknown",
        body: c.body ?? "",
        createdAt: c.created_at?.slice(0, 10),
      }));
      return issue;
    } catch {
      return null;
    }
  }

  async searchIssues(query: string, limit = 5): Promise<NormalizedIssue[]> {
    const repo = this.requireRepo();
    const q = encodeURIComponent(`repo:${repo.owner}/${repo.name} ${query}`);
    try {
      const res = await this.json<{ items: GitHubIssue[] }>(
        `/search/issues?q=${q}&per_page=${Math.min(limit, 20)}`
      );
      return res.items.map((i) => this.normalizeIssue(i));
    } catch {
      return [];
    }
  }

  async addComment(ref: string, body: string) {
    if (!this.token) {
      throw new Error("GitHub write requires GITHUB_TOKEN — public API is read-only.");
    }
    const repo = this.requireRepo();
    const num = ref.replace(/[^0-9]/g, "");
    const res = await fetch(
      `${API}/repos/${repo.owner}/${repo.name}/issues/${num}/comments`,
      { method: "POST", headers: ghHeaders(this.token), body: JSON.stringify({ body }) }
    );
    if (!res.ok) {
      throw new Error(`GitHub addComment ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { html_url?: string };
    return { ok: true, url: data.html_url };
  }
}

interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: string;
  labels?: (string | { name: string })[];
  assignee?: { login: string };
  user?: { login: string };
  html_url: string;
  created_at?: string;
  updated_at?: string;
  pull_request?: unknown;
}
