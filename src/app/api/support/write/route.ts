import { NextResponse } from "next/server";
import { resolveRepoRef, ticketConnectorForRef } from "@/lib/support/connectors";
import { getConfig } from "@/lib/support/config";
import { audit } from "@/lib/support/audit";

export const runtime = "nodejs";

/**
 * Approval-gated write endpoint. The ONLY supported write is posting a comment.
 * Never deletes/closes anything. Requires `approved: true` in the request body,
 * which the UI sets only after the user confirms in a modal. Honors the global
 * SUPPORT_AGENT_READ_ONLY kill switch.
 */
interface WriteBody {
  action: "comment";
  ref: string;
  repoUrl?: string;
  body: string;
  approved: boolean;
}

export async function POST(req: Request) {
  let parsed: WriteBody;
  try {
    parsed = (await req.json()) as WriteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cfg = getConfig();

  if (cfg.readOnly) {
    await audit({ action: `write:${parsed.action}`, target: parsed.ref, approved: false, details: "blocked: read-only mode" });
    return NextResponse.json(
      { error: "Read-only mode is enabled (SUPPORT_AGENT_READ_ONLY=true). Writes are disabled." },
      { status: 403 }
    );
  }

  if (parsed.action !== "comment") {
    return NextResponse.json(
      { error: `Unsupported write action: ${parsed.action}. Only "comment" is allowed.` },
      { status: 400 }
    );
  }

  if (!parsed.approved) {
    await audit({ action: "write:comment", target: parsed.ref, approved: false, details: "rejected: not approved" });
    return NextResponse.json(
      { error: "Write not approved. Explicit user approval is required." },
      { status: 403 }
    );
  }

  if (!parsed.ref?.trim() || !parsed.body?.trim()) {
    return NextResponse.json({ error: "Missing ref or body." }, { status: 400 });
  }

  try {
    const { ref: repoRef } = resolveRepoRef(parsed.repoUrl);
    const { connector, mock } = ticketConnectorForRef(parsed.ref.trim(), repoRef);
    const result = await connector.addComment(parsed.ref.trim(), parsed.body);
    await audit({
      action: "write:comment",
      target: parsed.ref,
      approved: true,
      details: `${mock ? "MOCK " : ""}posted to ${connector.id}: ${result.url ?? "ok"}`,
    });
    return NextResponse.json({ ok: result.ok, url: result.url, mock: result.mock ?? mock, source: connector.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Write failed";
    await audit({ action: "write:comment", target: parsed.ref, approved: true, details: `failed: ${message}` });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
