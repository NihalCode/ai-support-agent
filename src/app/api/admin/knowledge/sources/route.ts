import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/roles";
import { listKnowledgeSources } from "@/knowledge/sources/SourceRegistry";
import {
  listKnowledgeDocumentStates,
  listKnowledgeSyncRuns,
} from "@/knowledge/stores/knowledge-sync-store";
import type { KnowledgeDocumentState, KnowledgeSyncRun } from "@/knowledge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface KnowledgeSourceView {
  id: string;
  name: string;
  product: string;
  type: string;
  url?: string;
  enabled: boolean;
  syncIntervalHours: number;
  documentState?: KnowledgeDocumentState;
  lastRun?: {
    runId: string;
    status: KnowledgeSyncRun["status"];
    startedAt: string;
    completedAt?: string;
    errorSummary?: string;
  };
  chunkCount: number;
  status: "active" | "stale" | "failed" | "pending" | "disabled";
  error?: string;
}

function sourceStatus(
  enabled: boolean,
  doc?: KnowledgeDocumentState,
  lastRun?: KnowledgeSourceView["lastRun"]
): KnowledgeSourceView["status"] {
  if (!enabled) return "disabled";
  if (lastRun?.status === "failed") return "failed";
  if (doc?.status === "stale") return "stale";
  if (doc?.status === "failed") return "failed";
  if (doc?.status === "active") return "active";
  return "pending";
}

/** List configured knowledge sources with sync state and recent runs. */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  if (
    !roleHasPermission(session.user.role, "users:read") &&
    !roleHasPermission(session.user.role, "users:write")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [sources, documentStates, recentRuns] = await Promise.all([
    Promise.resolve(listKnowledgeSources()),
    listKnowledgeDocumentStates(),
    listKnowledgeSyncRuns(10),
  ]);

  const docBySource = new Map(documentStates.map((d) => [d.sourceId, d]));

  const views: KnowledgeSourceView[] = sources.map((source) => {
    const documentState = docBySource.get(source.id);
    const lastRun = recentRuns.find((r) => r.sourceIds.includes(source.id));
    const lastRunView = lastRun
      ? {
          runId: lastRun.id,
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          errorSummary: lastRun.errorSummary,
        }
      : undefined;

    return {
      id: source.id,
      name: source.name,
      product: source.product,
      type: source.type,
      url: source.url,
      enabled: source.enabled,
      syncIntervalHours: source.syncIntervalHours,
      documentState,
      lastRun: lastRunView,
      chunkCount: documentState?.chunkCount ?? 0,
      status: sourceStatus(source.enabled, documentState, lastRunView),
      error: lastRunView?.errorSummary,
    };
  });

  return NextResponse.json({
    sources: views,
    recentRuns,
  });
}
