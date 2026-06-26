import "server-only";

import { getConfig, hasVercel } from "../config";
import { redact } from "../redact";
import type { EvidenceItem } from "../investigation/types";

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  statusCode?: number;
  requestId?: string;
  deploymentId?: string;
  path?: string;
}

export interface DeploymentRecord {
  id: string;
  url: string;
  createdAt: string;
  state: string;
  gitSha?: string;
  gitMessage?: string;
}

const MOCK_LOGS: LogEntry[] = [
  {
    timestamp: "2026-06-21T10:31:02Z",
    level: "error",
    message: "POST /v3/indicators/search/ 500 Internal Server Error — TypeError: Cannot read properties of undefined",
    statusCode: 500,
    requestId: "req_8f2a91",
    deploymentId: "dpl_prev123",
    path: "/v3/indicators/search/",
  },
  {
    timestamp: "2026-06-21T10:30:58Z",
    level: "warn",
    message: "Slow query on indicator_search took 4200ms",
    requestId: "req_8f2a91",
    path: "/v3/indicators/search/",
  },
  {
    timestamp: "2026-06-21T09:15:00Z",
    level: "error",
    message: "401 Unauthorized — invalid AccessID on GET /ping/",
    statusCode: 401,
    path: "/ping/",
  },
];

const MOCK_DEPLOYMENTS: DeploymentRecord[] = [
  {
    id: "dpl_latest456",
    url: "https://ai-support-agent-ecru.vercel.app",
    createdAt: "2026-06-21T08:00:00Z",
    state: "READY",
    gitSha: "abc1234",
    gitMessage: "feat: indicator search pagination",
  },
  {
    id: "dpl_prev123",
    url: "https://ai-support-agent-ecru.vercel.app",
    createdAt: "2026-06-20T14:00:00Z",
    state: "READY",
    gitSha: "def5678",
    gitMessage: "fix: auth header validation",
  },
];

export function vercelMode(): "live" | "mock" {
  return hasVercel(getConfig()) ? "live" : "mock";
}

async function vercelFetch(path: string): Promise<Response> {
  const cfg = getConfig();
  const token = cfg.vercel.token!;
  const url = new URL(`https://api.vercel.com${path}`);
  if (cfg.vercel.teamId) url.searchParams.set("teamId", cfg.vercel.teamId);
  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/** Query logs — live deployment events when configured, else mock data. */
export async function queryLogs(opts: {
  endpoint?: string;
  statusCode?: number;
  requestId?: string;
  traceId?: string;
  since?: string;
  limit?: number;
}): Promise<{ entries: LogEntry[]; mock: boolean; note?: string }> {
  const cfg = getConfig();
  if (!hasVercel(cfg) || !cfg.vercel.token || !cfg.vercel.projectId) {
    return { ...filterMockLogs(opts), note: "Set VERCEL_TOKEN + VERCEL_PROJECT_ID for live data." };
  }

  try {
    const deployRes = await vercelFetch(
      `/v6/deployments?projectId=${encodeURIComponent(cfg.vercel.projectId)}&limit=3&target=production`
    );
    if (!deployRes.ok) {
      return {
        ...filterMockLogs(opts),
        note: `Vercel deployments API HTTP ${deployRes.status} — using mock logs.`,
      };
    }
    const deployData = (await deployRes.json()) as {
      deployments?: { uid?: string; created?: number }[];
    };
    const latestId = deployData.deployments?.[0]?.uid;
    if (!latestId) {
      return { entries: [], mock: false, note: "No deployments found for project." };
    }

    const eventsRes = await vercelFetch(`/v2/deployments/${latestId}/events?limit=50&direction=backward`);
    if (!eventsRes.ok) {
      return {
        ...filterMockLogs(opts),
        note: `Vercel events API HTTP ${eventsRes.status} — using mock logs.`,
      };
    }
    const eventsData = (await eventsRes.json()) as Array<{
      type?: string;
      created?: number;
      payload?: { text?: string; message?: string; statusCode?: number; requestId?: string; path?: string };
    }>;

    let entries = eventsData
      .map((ev): LogEntry | null => {
        const text = ev.payload?.text ?? ev.payload?.message ?? ev.type ?? "";
        if (!text.trim()) return null;
        const level = /error|fail|500|exception/i.test(text)
          ? "error"
          : /warn/i.test(text)
            ? "warn"
            : "info";
        return {
          timestamp: ev.created ? new Date(ev.created).toISOString() : new Date().toISOString(),
          level,
          message: text.slice(0, 500),
          statusCode: ev.payload?.statusCode,
          requestId: ev.payload?.requestId,
          deploymentId: latestId,
          path: ev.payload?.path,
        };
      })
      .filter((e): e is LogEntry => e !== null);

    const unfiltered = entries;
    if (opts.endpoint) {
      const ep = opts.endpoint.toLowerCase();
      entries = entries.filter(
        (r) => r.path?.toLowerCase().includes(ep) || r.message.toLowerCase().includes(ep)
      );
    }
    if (opts.statusCode) entries = entries.filter((r) => r.statusCode === opts.statusCode);
    if (opts.requestId) entries = entries.filter((r) => r.requestId === opts.requestId);

    const limit = opts.limit ?? 20;
    const hasStructuredQuery = Boolean(opts.endpoint || opts.statusCode || opts.requestId);
    if (entries.length === 0 && unfiltered.length > 0 && hasStructuredQuery) {
      const related = unfiltered.filter((r) => r.level === "error" || r.level === "warn").slice(0, limit);
      if (related.length > 0) {
        return {
          entries: related,
          mock: false,
          note: "No exact filter match — showing recent deployment error/warn events. CTIX API runtime logs require tenant log integration.",
        };
      }
    }

    if (entries.length === 0) {
      if (hasStructuredQuery) {
        return {
          entries: [],
          mock: false,
          note: "No matching deployment events for the provided filters. CTIX API logs are not captured in Vercel build/deploy output.",
        };
      }
      return {
        entries: filterMockLogs(opts).entries,
        mock: true,
        note: "No matching live deployment events — showing sample logs. Runtime log drains give richer data.",
      };
    }
    return { entries: entries.slice(0, limit), mock: false };
  } catch (err) {
    return {
      ...filterMockLogs(opts),
      note: err instanceof Error ? err.message : "Vercel logs fetch failed",
    };
  }
}

function filterMockLogs(opts: {
  endpoint?: string;
  statusCode?: number;
  requestId?: string;
  limit?: number;
}): { entries: LogEntry[]; mock: boolean } {
  let rows = [...MOCK_LOGS];
  if (opts.endpoint) {
    const ep = opts.endpoint.toLowerCase();
    rows = rows.filter((r) => r.path?.toLowerCase().includes(ep) || r.message.toLowerCase().includes(ep));
  }
  if (opts.statusCode) rows = rows.filter((r) => r.statusCode === opts.statusCode);
  if (opts.requestId) rows = rows.filter((r) => r.requestId === opts.requestId);
  const limit = opts.limit ?? 20;
  return { entries: rows.slice(0, limit), mock: true };
}

export async function listDeployments(
  limit = 5
): Promise<{ deployments: DeploymentRecord[]; mock: boolean; note?: string }> {
  const cfg = getConfig();
  if (!hasVercel(cfg) || !cfg.vercel.token || !cfg.vercel.projectId) {
    return { deployments: MOCK_DEPLOYMENTS.slice(0, limit), mock: true };
  }

  try {
    const res = await vercelFetch(
      `/v6/deployments?projectId=${encodeURIComponent(cfg.vercel.projectId)}&limit=${limit}`
    );
    if (!res.ok) {
      return {
        deployments: MOCK_DEPLOYMENTS.slice(0, limit),
        mock: true,
        note: `Vercel API HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      deployments?: Array<{
        uid?: string;
        url?: string;
        created?: number;
        state?: string;
        meta?: { githubCommitSha?: string; githubCommitMessage?: string };
      }>;
    };
    const deployments: DeploymentRecord[] = (data.deployments ?? []).map((d) => ({
      id: d.uid ?? "unknown",
      url: d.url ? `https://${d.url}` : "",
      createdAt: d.created ? new Date(d.created).toISOString() : "",
      state: d.state ?? "UNKNOWN",
      gitSha: d.meta?.githubCommitSha,
      gitMessage: d.meta?.githubCommitMessage,
    }));
    return { deployments, mock: false };
  } catch (err) {
    return {
      deployments: MOCK_DEPLOYMENTS.slice(0, limit),
      mock: true,
      note: err instanceof Error ? err.message : "Vercel fetch failed",
    };
  }
}

export function logsToEvidence(entries: LogEntry[]): EvidenceItem[] {
  return entries.map((e, i) => ({
    id: `log-${i}`,
    sourceType: "logs" as const,
    title: `${e.level.toUpperCase()} ${e.statusCode ?? ""} ${e.path ?? ""}`.trim(),
    summary: redact(e.message),
    metadata: {
      timestamp: e.timestamp,
      requestId: e.requestId,
      deploymentId: e.deploymentId,
    },
    redacted: true,
  }));
}

export function deploymentsToEvidence(deployments: DeploymentRecord[]): EvidenceItem[] {
  return deployments.map((d, i) => ({
    id: `dpl-${i}`,
    sourceType: "deployment" as const,
    title: `Deployment ${d.id}`,
    summary: `${d.state} — ${d.gitMessage ?? "no message"} (${d.createdAt})`,
    url: d.url,
    metadata: { gitSha: d.gitSha, deploymentId: d.id },
  }));
}
