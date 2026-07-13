import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  releaseZendeskSyncLock,
  tryAcquireZendeskSyncLock,
} from "@/integrations/zendesk/sync-lock";
import { controlPlaneRepository } from "@/lib/enterprise/control-plane-runtime";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  ApiInputError,
  controlPlaneJson,
  exactKeys,
  readStrictJson,
  requireEnterpriseMutationRateLimit,
  requireMutationCsrf,
} from "@/lib/enterprise/http";
import { redactEnterpriseValue } from "@/lib/enterprise/observability";
import { buildZendeskDiagnostics } from "@/lib/enterprise/zendesk-diagnostics";
import { ingestZendeskTickets } from "@/lib/support/enterprise/zendesk-ticket-ingest";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "jobs.manage");
  if (access instanceof NextResponse) return access;
  const csrf = requireMutationCsrf(request);
  if (csrf) return csrf;
  const limited = requireEnterpriseMutationRateLimit(access);
  if (limited) return limited;

  const organizationId = access.context.organization.id;
  const actorUserId = access.session.user.id;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return controlPlaneJson(
      { error: "A valid Idempotency-Key header is required" },
      { status: 400 }
    );
  }

  try {
    const body = await readStrictJson(request, 1024);
    exactKeys(body, []);
    const operation = "zendesk/incremental-sync";
    const requestHash = createHash("sha256").update("{}").digest("hex");
    const replay = await controlPlaneRepository.getIdempotency(
      organizationId,
      actorUserId,
      idempotencyKey
    );
    if (replay) {
      if (replay.operation !== operation || replay.requestHash !== requestHash) {
        return controlPlaneJson(
          { error: "Idempotency key was used for another request" },
          { status: 409 }
        );
      }
      return controlPlaneJson(replay.responseBody, {
        status: replay.responseStatus,
      });
    }

    const diagnostics = await buildZendeskDiagnostics(organizationId, false);
    if (!diagnostics.operations.incrementalSync.available) {
      return controlPlaneJson(
        {
          error:
            diagnostics.operations.incrementalSync.reason ??
            "Incremental synchronization is unavailable.",
          code: "sync_unavailable",
        },
        { status: 409 }
      );
    }
    if (!tryAcquireZendeskSyncLock()) {
      return controlPlaneJson(
        { error: "A Zendesk synchronization is already running.", code: "sync_in_progress" },
        { status: 409 }
      );
    }

    let result;
    try {
      result = await ingestZendeskTickets({
        force: false,
        organizationId,
      });
    } finally {
      releaseZendeskSyncLock();
    }

    const responseBody = redactEnterpriseValue({
      status: "completed",
      ticketsFetched: result.ticketsFetched,
      ticketsStored: result.ticketsStored,
      recordsIndexed: result.upserted,
      warnings: result.warnings,
    });
    await controlPlaneRepository.appendAudit({
      id: randomUUID(),
      organizationId,
      actorUserId,
      action: "zendesk.incremental_sync",
      severity: "info",
      targetType: "integration",
      targetId: diagnostics.status.integrationId,
      outcome: "success",
      details: responseBody as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    });
    await controlPlaneRepository.putIdempotency({
      organizationId,
      actorUserId,
      key: idempotencyKey,
      operation,
      requestHash,
      responseStatus: 200,
      responseBody,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    return controlPlaneJson(responseBody);
  } catch (error) {
    if (error instanceof ApiInputError) {
      return controlPlaneJson({ error: error.message }, { status: error.status });
    }
    console.error("Zendesk incremental synchronization failed", error);
    return controlPlaneJson(
      {
        error: "Zendesk incremental synchronization failed.",
        code: "sync_failed",
      },
      { status: 503 }
    );
  }
}
