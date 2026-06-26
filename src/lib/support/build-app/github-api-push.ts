import "server-only";

import { parseRepoUrl } from "../connectors/github";
import { collectProjectDeployFiles } from "./collect-files";

async function ghJson<T>(token: string, apiPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    throw new Error(`GitHub API ${res.status} on ${apiPath}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export async function pushProjectToGitHub(opts: {
  token: string;
  repo: string;
  rootDir: string;
  message: string;
  branch?: string;
}): Promise<{ commitSha: string; branch: string; url: string }> {
  const ref = parseRepoUrl(opts.repo);
  if (!ref) {
    throw new Error("Invalid GitHub repo — use owner/name or https://github.com/owner/repo");
  }

  const files = collectProjectDeployFiles(opts.rootDir);
  if (!files.length) throw new Error("No files to commit — scaffold the app first.");

  const repoMeta = await ghJson<{ default_branch: string }>(
    opts.token,
    `/repos/${ref.owner}/${ref.name}`
  );
  const defaultBranch = repoMeta.default_branch || "main";
  const branch = opts.branch?.trim() || `build-app/${Date.now()}`;

  let parentSha: string | null = null;
  try {
    const existing = await ghJson<{ object: { sha: string } }>(
      opts.token,
      `/repos/${ref.owner}/${ref.name}/git/ref/heads/${encodeURIComponent(branch)}`
    );
    parentSha = existing.object.sha;
  } catch {
    try {
      const base = await ghJson<{ object: { sha: string } }>(
        opts.token,
        `/repos/${ref.owner}/${ref.name}/git/ref/heads/${encodeURIComponent(defaultBranch)}`
      );
      parentSha = base.object.sha;
    } catch {
      parentSha = null;
    }
  }

  const tree = await ghJson<{ sha: string }>(opts.token, `/repos/${ref.owner}/${ref.name}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parentSha ?? undefined,
      tree: files.map((f) => ({
        path: f.file,
        mode: "100644",
        type: "blob",
        content: f.data,
      })),
    }),
  });

  const commit = await ghJson<{ sha: string }>(
    opts.token,
    `/repos/${ref.owner}/${ref.name}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: opts.message,
        tree: tree.sha,
        parents: parentSha ? [parentSha] : [],
      }),
    }
  );

  try {
    await ghJson(opts.token, `/repos/${ref.owner}/${ref.name}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } catch {
    await ghJson(opts.token, `/repos/${ref.owner}/${ref.name}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  return {
    commitSha: commit.sha,
    branch,
    url: `https://github.com/${ref.owner}/${ref.name}/tree/${branch}`,
  };
}
