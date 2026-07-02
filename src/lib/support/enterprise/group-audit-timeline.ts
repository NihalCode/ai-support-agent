import type { EnterpriseAuditLog } from "@/lib/support/enterprise/types";

export interface AuditTimelineGroup {
  id: string;
  kind: "slack_thread" | "investigation" | "build_app" | "approval" | "general";
  title: string;
  subtitle?: string;
  threadKey?: string;
  entries: EnterpriseAuditLog[];
  startedAt: string;
  lastAt: string;
}

const SLACK_TARGET = /^[CDG][A-Z0-9]+:[0-9.]+$/;

function parseSlackTarget(targetId?: string): { channel?: string; threadTs?: string } {
  if (!targetId || !SLACK_TARGET.test(targetId)) return {};
  const [channel, threadTs] = targetId.split(":");
  return { channel, threadTs };
}

function groupKind(entry: EnterpriseAuditLog): AuditTimelineGroup["kind"] {
  if (entry.targetSystem === "slack" || entry.action.startsWith("slack:")) return "slack_thread";
  if (entry.action.includes("investigation") || entry.action.includes("investigate")) return "investigation";
  if (entry.action.includes("build-app") || entry.targetSystem === "vercel") return "build_app";
  if (entry.action.includes("approval")) return "approval";
  return "general";
}

function groupKey(entry: EnterpriseAuditLog): string {
  const slack = parseSlackTarget(entry.targetId);
  if (slack.channel && slack.threadTs) return `slack:${slack.channel}:${slack.threadTs}`;
  if (entry.targetId && groupKind(entry) !== "general") {
    return `${groupKind(entry)}:${entry.targetId}`;
  }
  if (entry.metadata?.sessionId && typeof entry.metadata.sessionId === "string") {
    return `session:${entry.metadata.sessionId}`;
  }
  const day = entry.createdAt.slice(0, 10);
  return `day:${day}:${entry.action.split(":")[0] ?? "event"}`;
}

function groupTitle(kind: AuditTimelineGroup["kind"], entry: EnterpriseAuditLog): string {
  const slack = parseSlackTarget(entry.targetId);
  switch (kind) {
    case "slack_thread":
      return slack.channel ? `Slack thread ${slack.channel}` : "Slack conversation";
    case "investigation":
      return "Investigation activity";
    case "build_app":
      return "Build App";
    case "approval":
      return "Approval workflow";
    default:
      return entry.action.split(":")[0] ?? "Activity";
  }
}

/** Groups audit entries into unified timeline threads (Slack threads, investigations, etc.). */
export function groupAuditTimeline(entries: EnterpriseAuditLog[]): AuditTimelineGroup[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const map = new Map<string, AuditTimelineGroup>();

  for (const entry of sorted) {
    const kind = groupKind(entry);
    const key = groupKey(entry);
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.lastAt = entry.createdAt;
      continue;
    }
    const slack = parseSlackTarget(entry.targetId);
    map.set(key, {
      id: key,
      kind,
      title: groupTitle(kind, entry),
      subtitle: slack.threadTs ? `Thread ${slack.threadTs}` : entry.targetId,
      threadKey: slack.channel && slack.threadTs ? `${slack.channel}:${slack.threadTs}` : undefined,
      entries: [entry],
      startedAt: entry.createdAt,
      lastAt: entry.createdAt,
    });
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  );
}
