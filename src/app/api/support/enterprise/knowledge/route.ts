import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { ingestEnterpriseKnowledge } from "@/lib/support/enterprise/knowledge-ingest";
import {
  deleteKnowledgeSource,
  listKnowledgeSources,
  upsertKnowledgeSource,
} from "@/lib/support/enterprise/stores/knowledge-source-store";
import { recordSystemHealthEvent } from "@/lib/support/enterprise/stores/system-health-store";
import { audit } from "@/lib/support/enterprise/audit-log";
import { getConfig, hasConfluence } from "@/lib/support/config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const sources = await listKnowledgeSources();
  return NextResponse.json({ sources });
}

export async function POST(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.approve, req);
  if (auth instanceof NextResponse) return auth;

  let body:
    | { intent: "sync_confluence"; name?: string; spaceKey?: string }
    | { intent: "delete"; id: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.intent === "sync_confluence") {
    const cfg = getConfig();
    const name = body.name ?? `Confluence ${cfg.confluence.spaceKey ?? "default"}`;
    const source = await upsertKnowledgeSource({
      type: "confluence",
      name,
      externalId: body.spaceKey ?? cfg.confluence.spaceKey ?? undefined,
      status: "syncing",
      createdByUserId: auth.user.id,
    });

    try {
      const result = await ingestEnterpriseKnowledge();
      const updated = await upsertKnowledgeSource({
        id: source.id,
        type: "confluence",
        name,
        status: result.upserted > 0 ? "indexed" : "failed",
        lastSyncedAt: new Date().toISOString(),
      });
      await audit({
        action: "knowledge:sync",
        target: source.id,
        approved: true,
        provider: "confluence",
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        details: `upserted ${result.upserted} chunks`,
      });
      if (result.warnings.length) {
        await recordSystemHealthEvent({
          source: "confluence",
          severity: "warning",
          title: "Confluence sync warnings",
          message: result.warnings.join("; "),
        });
      }
      return NextResponse.json({ source: updated, result });
    } catch (err) {
      await upsertKnowledgeSource({ id: source.id, type: "confluence", name, status: "failed" });
      await recordSystemHealthEvent({
        source: "confluence",
        severity: "error",
        title: "Confluence sync failed",
        message: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: "Sync failed" }, { status: 500 });
    }
  }

  if (body.intent === "delete") {
    await deleteKnowledgeSource(body.id);
    await audit({
      action: "knowledge:delete",
      target: body.id,
      approved: true,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    {
      error: hasConfluence(getConfig())
        ? "Unknown intent"
        : "Confluence is not configured",
    },
    { status: 400 }
  );
}
