import { NextResponse } from "next/server";
import { getConfig } from "@/lib/support/config";
import { audit } from "@/lib/support/audit";
import { executeAction } from "@/lib/support/executor";

export const runtime = "nodejs";

/**
 * Approval-gated write endpoint (back-compat). The supported write is posting a
 * comment; it now flows through the shared `executeAction` executor so all
 * writes share one read-only/approval/audit path. Requires `approved: true`,
 * which the UI sets only after the user confirms in a modal.
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
    const result = await executeAction(
      {
        type: "ticket-comment",
        provider: /^[A-Z][A-Z0-9]+-\d+$/.test(parsed.ref.trim()) ? "jira" : "github",
        ref: parsed.ref.trim(),
        body: parsed.body,
        repoUrl: parsed.repoUrl,
      },
      { approved: true }
    );
    return NextResponse.json({ ok: result.ok, url: result.url, mock: result.mock, detail: result.detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
