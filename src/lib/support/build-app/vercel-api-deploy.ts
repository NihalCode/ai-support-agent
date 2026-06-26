import "server-only";

import { collectProjectDeployFiles } from "./collect-files";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function vercelApiUrl(path: string, teamId?: string | null): string {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  return url.toString();
}

async function fetchDeploymentBuildError(
  deploymentId: string,
  token: string,
  teamId?: string | null
): Promise<string> {
  try {
    const res = await fetch(vercelApiUrl(`/v2/deployments/${deploymentId}/events?limit=40&direction=backward`, teamId), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return "";
    const events = (await res.json()) as Array<{ type?: string; payload?: { text?: string; message?: string } }>;
    const lines = events
      .map((e) => e.payload?.text ?? e.payload?.message ?? "")
      .filter((t) => /error|failed|Type error|exit(ed)? with/i.test(t))
      .slice(0, 8);
    return lines.join("\n");
  } catch {
    return "";
  }
}

export async function deployToVercelApi(opts: {
  token: string;
  teamId?: string | null;
  projectName: string;
  rootDir: string;
  target: "preview" | "production";
}): Promise<{ url: string; deploymentId: string; logs: string }> {
  const files = collectProjectDeployFiles(opts.rootDir);
  if (!files.length) {
    throw new Error("No deployable files found — scaffold the app first.");
  }

  const safeName = opts.projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 52) || "cyware-app";

  const createRes = await fetch(vercelApiUrl("/v13/deployments", opts.teamId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: safeName,
      files,
      projectSettings: { framework: "nextjs" },
      target: opts.target === "production" ? "production" : undefined,
    }),
  });

  const created = (await createRes.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
    message?: string;
  };

  if (!createRes.ok) {
    const msg = created.error?.message ?? created.message ?? JSON.stringify(created).slice(0, 400);
    throw new Error(`Vercel deploy API HTTP ${createRes.status}: ${msg}`);
  }

  const deploymentId = created.id;
  if (!deploymentId) throw new Error("Vercel API did not return a deployment id.");

  let url = created.url ? `https://${created.url}` : "";
  const logLines = [`Created deployment ${deploymentId}`, `Uploaded ${files.length} file(s)`];

  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(attempt === 0 ? 2000 : 3000);
    const statusRes = await fetch(vercelApiUrl(`/v13/deployments/${deploymentId}`, opts.teamId), {
      headers: { Authorization: `Bearer ${opts.token}`, Accept: "application/json" },
    });
    const status = (await statusRes.json()) as {
      readyState?: string;
      url?: string;
      alias?: string[];
      errorMessage?: string;
    };

    if (status.url) url = `https://${status.url}`;
    if (status.readyState === "READY") {
      logLines.push(`State: READY`, `URL: ${url}`);
      return { url, deploymentId, logs: logLines.join("\n") };
    }
    if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
      const buildLog = await fetchDeploymentBuildError(deploymentId, opts.token, opts.teamId);
      const detail = [status.errorMessage, buildLog].filter(Boolean).join("\n");
      throw new Error(detail || `Vercel deployment ${status.readyState}`);
    }
    logLines.push(`Poll ${attempt + 1}: ${status.readyState ?? "BUILDING"}`);
  }

  throw new Error("Vercel deployment timed out — check the Vercel dashboard for build logs.");
}
