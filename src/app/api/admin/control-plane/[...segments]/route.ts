import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  controlPlaneRepository,
  controlPlaneService,
  getApiKeyService,
} from "@/lib/enterprise/control-plane-runtime";
import { hasPrivilegedMfa } from "@/lib/enterprise/auth-assurance";
import { ControlPlaneError, type ControlPlaneActor } from "@/lib/enterprise/control-plane-types";
import {
  evaluateEnterpriseAccess,
  guardEnterpriseApi,
  type EnterpriseAccess,
} from "@/lib/enterprise/guard";
import {
  ApiInputError,
  controlPlaneJson,
  exactKeys,
  readStrictJson,
  requireEnterpriseMutationRateLimit,
  requireMutationCsrf,
} from "@/lib/enterprise/http";
import { redactEnterpriseValue } from "@/lib/enterprise/observability";
import { mapEnterpriseRole } from "@/lib/enterprise/policy";
import type { EnterpriseEnvironment, EnterprisePermission } from "@/lib/enterprise/types";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ segments: string[] }> };
const ENVIRONMENTS = new Set(["development", "staging", "production"]);

function actor(access: EnterpriseAccess): ControlPlaneActor {
  const role = mapEnterpriseRole(access.context.principal.role);
  if (!role) throw new ControlPlaneError("forbidden", "Forbidden");
  return {
    userId: access.session.user.id,
    organizationId: access.context.organization.id,
    role,
    recentMfa: hasPrivilegedMfa(access.session),
  };
}

function environment(value: unknown): EnterpriseEnvironment {
  if (typeof value !== "string" || !ENVIRONMENTS.has(value)) {
    throw new ApiInputError("Invalid environment");
  }
  return value as EnterpriseEnvironment;
}

function text(value: unknown, name: string, min = 1, max = 200): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new ApiInputError(`${name} is invalid`);
  }
  return value.trim();
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiInputError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ApiInputError(`${name} is invalid`);
  return Number(value);
}

function optionalDate(value: unknown, name: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ApiInputError(`${name} is invalid`);
  }
  return new Date(value).toISOString();
}

function safeCredential<T extends { vaultRef: string }>(
  value: T
): Omit<T, "vaultRef"> {
  const { vaultRef: _vaultRef, ...safe } = value;
  return safe;
}

function permissionForGet(parts: string[]): EnterprisePermission {
  if (parts[0] === "credentials") return "credentials.read_metadata";
  if (parts[0] === "audit" || parts[0] === "export") return "audit.read";
  return "resources.read";
}

function permissionForPost(parts: string[]): EnterprisePermission {
  if (parts[0] === "credentials") return "credentials.manage";
  if (parts[0] === "resources" && parts.length === 1) return "resources.write";
  if (parts[0] === "resources") return "changes.create";
  const action = parts[2];
  if (action === "submit") return "changes.submit";
  if (action === "approve" || action === "reject") return "changes.approve";
  if (action === "rollback") return "changes.rollback";
  return "changes.activate";
}

function handleError(error: unknown) {
  if (error instanceof ApiInputError) {
    return controlPlaneJson({ error: error.message }, { status: error.status });
  }
  if (error instanceof ControlPlaneError) {
    const status = error.code === "not_found" ? 404 :
      error.code === "forbidden" ? 403 :
      error.code === "conflict" ? 409 : 400;
    return controlPlaneJson(
      { error: error.code === "not_found" ? "Not found" : error.message, code: error.code },
      { status }
    );
  }
  console.error("control-plane request failed", error);
  return controlPlaneJson({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const parts = (await context.params).segments;
  const access = await guardEnterpriseApi(request, permissionForGet(parts));
  if (access instanceof NextResponse) return access;
  const currentActor = actor(access);
  try {
    if (parts[0] === "resources" && parts.length === 1) {
      return controlPlaneJson({ resources: await controlPlaneService.listResources(currentActor) });
    }
    if (parts[0] === "resources" && parts[2] === "versions") {
      const resource = await controlPlaneRepository.getResource(currentActor.organizationId, parts[1]!);
      if (!resource) throw new ControlPlaneError("not_found", "Resource not found");
      return controlPlaneJson({
        versions: (await controlPlaneRepository.listVersions(
          currentActor.organizationId,
          resource.id
        )).map(({ configuration: _configuration, ...safeVersion }) => safeVersion),
      });
    }
    if (parts[0] === "changes") {
      return controlPlaneJson({ changes: await controlPlaneRepository.listChanges(currentActor.organizationId) });
    }
    if (parts[0] === "credentials") {
      return controlPlaneJson({
        credentials: (await getApiKeyService().list(currentActor)).map(safeCredential),
      });
    }
    if (parts[0] === "audit") {
      return controlPlaneJson({ events: await controlPlaneRepository.listAudit(currentActor.organizationId) });
    }
    if (parts[0] === "export") {
      const [resources, changes, credentials, audit] = await Promise.all([
        controlPlaneRepository.listResources(currentActor.organizationId),
        controlPlaneRepository.listChanges(currentActor.organizationId),
        getApiKeyService().list(currentActor),
        controlPlaneRepository.listAudit(currentActor.organizationId),
      ]);
      return controlPlaneJson(redactEnterpriseValue({
        exportedAt: new Date().toISOString(),
        organizationId: currentActor.organizationId,
        resources,
        changes,
        credentials: credentials.map(({ vaultRef: _vaultRef, ...safe }) => safe),
        audit,
      }), { headers: { "Content-Disposition": 'attachment; filename="control-plane-export.json"' } });
    }
    throw new ControlPlaneError("not_found", "Not found");
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parts = (await context.params).segments;
  const access = await guardEnterpriseApi(request, permissionForPost(parts), {
    requireMfa: parts[0] === "credentials" || parts[0] === "changes" && parts[2] !== "submit",
  });
  if (access instanceof NextResponse) return access;
  const csrf = requireMutationCsrf(request);
  if (csrf) return csrf;
  const limited = requireEnterpriseMutationRateLimit(access);
  if (limited) return limited;
  const currentActor = actor(access);

  try {
    const body = await readStrictJson(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new ApiInputError("A valid Idempotency-Key header is required");
    }
    const operation = parts.join("/");
    const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const replay = await controlPlaneRepository.getIdempotency(
      currentActor.organizationId,
      currentActor.userId,
      idempotencyKey
    );
    if (replay) {
      if (replay.operation !== operation || replay.requestHash !== requestHash) {
        throw new ControlPlaneError("conflict", "Idempotency key was used for another request");
      }
      return controlPlaneJson(replay.responseBody, { status: replay.responseStatus });
    }

    let responseBody: unknown;
    let responseStatus = 200;
    if (parts[0] === "resources" && parts.length === 1) {
      exactKeys(body, ["resourceType", "name", "environment", "configuration", "summary"]);
      const targetEnvironment = environment(body.environment);
      if (targetEnvironment === "production") {
        const productionAccess = evaluateEnterpriseAccess(
          access.session,
          "resources.write_production",
          {
            resource: {
              organizationId: currentActor.organizationId,
              environment: "production",
            },
          }
        );
        if (!productionAccess.ok) {
          return controlPlaneJson(
            {
              error: "Forbidden",
              code: productionAccess.reason,
            },
            { status: productionAccess.status }
          );
        }
      }
      responseBody = await controlPlaneService.createResource(currentActor, {
        resourceType: text(body.resourceType, "resourceType"),
        name: text(body.name, "name"),
        environment: targetEnvironment,
        configuration: object(body.configuration, "configuration"),
        summary: text(body.summary, "summary", 1, 1000),
      });
      responseStatus = 201;
    } else if (parts[0] === "resources" && parts[2] === "changes") {
      exactKeys(body, ["configuration", "summary"]);
      responseBody = await controlPlaneService.createChange(currentActor, parts[1]!, {
        configuration: object(body.configuration, "configuration"),
        summary: text(body.summary, "summary", 1, 1000),
      });
      responseStatus = 201;
    } else if (parts[0] === "changes" && parts[2] === "emergency-activate") {
      exactKeys(body, ["expectedVersion", "reason"]);
      responseBody = await controlPlaneService.emergencyActivate(currentActor, parts[1]!, {
        expectedVersion: integer(body.expectedVersion, "expectedVersion"),
        reason: text(body.reason, "reason", 10, 2000),
      });
    } else if (parts[0] === "changes" && parts[2] === "rollback") {
      exactKeys(body, ["expectedVersion"]);
      responseBody = await controlPlaneService.rollback(
        currentActor,
        parts[1]!,
        integer(body.expectedVersion, "expectedVersion")
      );
    } else if (parts[0] === "changes" && ["submit", "approve", "reject", "schedule", "deploy", "activate"].includes(parts[2]!)) {
      exactKeys(body, ["expectedVersion", "reason", "scheduledFor"]);
      responseBody = await controlPlaneService.transition(
        currentActor,
        parts[1]!,
        parts[2] as "submit" | "approve" | "reject" | "schedule" | "deploy" | "activate",
        {
          expectedVersion: integer(body.expectedVersion, "expectedVersion"),
          reason: typeof body.reason === "string" ? body.reason : undefined,
          scheduledFor: optionalDate(body.scheduledFor, "scheduledFor") ?? undefined,
        }
      );
    } else if (parts[0] === "credentials" && parts[1] === "issue") {
      exactKeys(body, ["name", "scopes", "environment", "expiresAt"]);
      if (!Array.isArray(body.scopes) || body.scopes.some((scope) => typeof scope !== "string")) {
        throw new ApiInputError("scopes must be an array of strings");
      }
      responseBody = await getApiKeyService().issue(currentActor, {
        name: text(body.name, "name"),
        scopes: body.scopes as string[],
        environment: environment(body.environment),
        expiresAt: optionalDate(body.expiresAt, "expiresAt"),
      });
      responseBody = {
        ...(responseBody as { plaintext: string; credential: { vaultRef: string } }),
        credential: safeCredential(
          (responseBody as { credential: { vaultRef: string } }).credential
        ),
      };
      responseStatus = 201;
    } else if (parts[0] === "credentials" && parts[2] === "revoke") {
      exactKeys(body, ["expectedVersion"]);
      responseBody = await getApiKeyService().revoke(currentActor, parts[1]!, integer(body.expectedVersion, "expectedVersion"));
    } else if (parts[0] === "credentials" && parts[2] === "rotate") {
      exactKeys(body, ["expectedVersion"]);
      responseBody = await getApiKeyService().rotate(currentActor, parts[1]!, integer(body.expectedVersion, "expectedVersion"));
      responseBody = {
        ...(responseBody as { plaintext: string; credential: { vaultRef: string } }),
        credential: safeCredential(
          (responseBody as { credential: { vaultRef: string } }).credential
        ),
      };
    } else {
      throw new ControlPlaneError("not_found", "Not found");
    }

    await controlPlaneRepository.putIdempotency({
      organizationId: currentActor.organizationId,
      actorUserId: currentActor.userId,
      key: idempotencyKey,
      operation,
      requestHash,
      responseStatus,
      responseBody,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    return controlPlaneJson(responseBody, { status: responseStatus });
  } catch (error) {
    return handleError(error);
  }
}
