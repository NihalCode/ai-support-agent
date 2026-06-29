import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { getVectorStore } from "@/lib/support/vector-store";
import { addKnowledge, type KnowledgeKind } from "@/lib/support/knowledge";
import { audit } from "@/lib/support/audit";
import { redact } from "@/lib/support/redact";

export const runtime = "nodejs";

/**
 * RAG source manager.
 *   GET                          → list indexed namespaces + vector counts
 *   POST {intent:"add-knowledge", kind, title, text, url?}  → index KB entry
 *   POST {intent:"delete", namespace}  → drop a namespace from the index
 */
function categorize(ns: string): string {
  if (ns.startsWith("apispec:")) return "api-spec";
  if (ns.includes("cql-docs")) return "cql-docs";
  if (ns.includes("knowledge")) return "knowledge";
  return "repo";
}

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  try {
    const store = getVectorStore();
    const namespaces = await store.listNamespaces();
    const sources = namespaces.map((n) => ({ ...n, category: categorize(n.namespace) }));
    return NextResponse.json({ vectorStore: store.isMock ? "memory" : "pinecone", sources });
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : "failed") }, { status: 500 });
  }
}

interface SourcesBody {
  intent: "add-knowledge" | "delete";
  kind?: KnowledgeKind;
  title?: string;
  text?: string;
  url?: string;
  namespace?: string;
}

export async function POST(req: Request) {
  let body: SourcesBody;
  try {
    body = (await req.json()) as SourcesBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const perm =
    body.intent === "delete" ? SupportApiPermission.developer : SupportApiPermission.investigate;
  const auth = await requireSupportApi(perm, req);
  if (auth instanceof NextResponse) return auth;

  if (body.intent === "add-knowledge") {
    if (!body.kind || !body.title?.trim() || !body.text?.trim()) {
      return NextResponse.json({ error: "kind, title, and text are required" }, { status: 400 });
    }
    try {
      const result = await addKnowledge({ kind: body.kind, title: body.title, text: body.text, url: body.url });
      await audit({ action: "rag:add-knowledge", target: body.title, approved: true, provider: body.kind, details: `indexed into ${result.namespace}` });
      return NextResponse.json({ result });
    } catch (err) {
      return NextResponse.json({ error: redact(err instanceof Error ? err.message : "failed") }, { status: 500 });
    }
  }

  if (body.intent === "delete") {
    if (!body.namespace?.trim()) return NextResponse.json({ error: "namespace required" }, { status: 400 });
    try {
      await getVectorStore().deleteNamespace(body.namespace);
      await audit({ action: "rag:delete-namespace", target: body.namespace, approved: true, details: "dropped" });
      return NextResponse.json({ ok: true, namespace: body.namespace });
    } catch (err) {
      return NextResponse.json({ error: redact(err instanceof Error ? err.message : "failed") }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown intent" }, { status: 400 });
}
