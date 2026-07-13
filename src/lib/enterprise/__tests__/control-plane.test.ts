import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ApiKeyService } from "../api-key-service";
import { MemoryControlPlaneRepository } from "../control-plane-repository";
import { ControlPlaneService } from "../control-plane-service";
import type { ControlPlaneActor } from "../control-plane-types";
import { ApiInputError, readStrictJson } from "../http";
import { redactEnterpriseValue } from "../observability";
import { checkEnterpriseMutationRateLimit } from "../rate-limit";
import { MemorySecretVault } from "../secret-vault";

const actor = (
  role: ControlPlaneActor["role"],
  userId: string,
  organizationId = "org-a",
  recentMfa = true
): ControlPlaneActor => ({ role, userId, organizationId, recentMfa });

describe("enterprise configuration workflow", () => {
  it("allows developers to submit production changes but never directly write or approve", async () => {
    const repository = new MemoryControlPlaneRepository();
    const service = new ControlPlaneService(repository);
    await expect(
      service.createResource(actor("developer", "dev"), {
        resourceType: "connector",
        name: "prod",
        environment: "production",
        configuration: {},
        summary: "direct",
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    const seeded = await service.createResource(actor("admin", "admin"), {
      resourceType: "connector",
      name: "prod",
      environment: "production",
      configuration: { endpoint: "https://example.test" },
      summary: "seed",
    });
    const draft = await service.createChange(actor("developer", "dev"), seeded.resource.id, {
      configuration: { endpoint: "https://new.example.test" },
      summary: "safe production proposal",
    });
    const pending = await service.transition(actor("developer", "dev"), draft.change.id, "submit", {
      expectedVersion: 1,
    });
    expect(pending.state).toBe("PENDING_REVIEW");
    await expect(
      service.transition(actor("developer", "dev"), draft.change.id, "approve", {
        expectedVersion: 2,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("enforces no self-approval and optimistic locking", async () => {
    const repository = new MemoryControlPlaneRepository();
    const service = new ControlPlaneService(repository);
    const created = await service.createResource(actor("admin", "requester"), {
      resourceType: "policy",
      name: "staging-policy",
      environment: "staging",
      configuration: { enabled: false },
      summary: "draft",
    });
    await service.transition(actor("admin", "requester"), created.change.id, "submit", {
      expectedVersion: 1,
    });
    await expect(
      service.transition(actor("admin", "requester"), created.change.id, "approve", {
        expectedVersion: 2,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    await service.transition(actor("owner", "reviewer"), created.change.id, "approve", {
      expectedVersion: 2,
    });
    await expect(
      service.transition(actor("owner", "reviewer"), created.change.id, "deploy", {
        expectedVersion: 2,
      })
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rolls back only to a previously approved version", async () => {
    const repository = new MemoryControlPlaneRepository();
    const service = new ControlPlaneService(repository);
    const admin = actor("admin", "admin");
    const reviewer = actor("owner", "owner");
    const first = await service.createResource(admin, {
      resourceType: "policy",
      name: "development-policy",
      environment: "development",
      configuration: { mode: "one" },
      summary: "version one",
    });
    await service.transition(admin, first.change.id, "submit", { expectedVersion: 1 });
    await service.transition(reviewer, first.change.id, "approve", { expectedVersion: 2 });
    await service.transition(reviewer, first.change.id, "deploy", { expectedVersion: 3 });
    await service.transition(reviewer, first.change.id, "activate", { expectedVersion: 4 });

    const second = await service.createChange(admin, first.resource.id, {
      configuration: { mode: "two" },
      summary: "version two",
    });
    await service.transition(admin, second.change.id, "submit", { expectedVersion: 1 });
    await service.transition(reviewer, second.change.id, "approve", { expectedVersion: 2 });
    await service.transition(reviewer, second.change.id, "deploy", { expectedVersion: 3 });
    await service.transition(reviewer, second.change.id, "activate", { expectedVersion: 4 });
    const rolledBack = await service.rollback(reviewer, second.change.id, 5);
    const resource = await repository.getResource("org-a", first.resource.id);
    expect(rolledBack.state).toBe("ROLLED_BACK");
    expect(resource?.activeVersionId).toBe(first.version.id);
  });

  it("uses trusted tenant predicates and non-enumerating not-found errors", async () => {
    const repository = new MemoryControlPlaneRepository();
    const service = new ControlPlaneService(repository);
    const created = await service.createResource(actor("admin", "a", "org-a"), {
      resourceType: "policy",
      name: "private",
      environment: "development",
      configuration: {},
      summary: "private",
    });
    expect(await repository.getResource("org-b", created.resource.id)).toBeNull();
    await expect(
      service.createChange(actor("admin", "b", "org-b"), created.resource.id, {
        configuration: {},
        summary: "probe",
      })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("requires admin, a written reason, and recent MFA for emergency override", async () => {
    const repository = new MemoryControlPlaneRepository();
    const service = new ControlPlaneService(repository);
    const created = await service.createResource(actor("admin", "admin"), {
      resourceType: "policy",
      name: "emergency",
      environment: "staging",
      configuration: {},
      summary: "emergency",
    });
    await expect(
      service.emergencyActivate(actor("admin", "admin", "org-a", false), created.change.id, {
        expectedVersion: 1,
        reason: "documented emergency reason",
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    const active = await service.emergencyActivate(actor("owner", "owner"), created.change.id, {
      expectedVersion: 1,
      reason: "documented emergency reason",
    });
    expect(active.emergencyOverride).toBe(true);
    expect((await repository.listAudit("org-a")).at(-1)).toMatchObject({
      action: "change.emergency_activate",
      severity: "high",
    });
  });
});

describe("enterprise API keys and audit", () => {
  it("returns plaintext once, stores only a hash, and rejects revoked or expired keys", async () => {
    const repository = new MemoryControlPlaneRepository();
    const vault = new MemorySecretVault();
    const service = new ApiKeyService(repository, vault, "x".repeat(32));
    const admin = actor("admin", "admin");
    const issued = await service.issue(admin, {
      name: "automation",
      scopes: ["resources:read", "resources:read"],
      environment: "staging",
    });
    expect(issued.plaintext).toMatch(/^esa_/);
    expect(JSON.stringify(await service.list(admin))).not.toContain(issued.plaintext);
    const stored = (await repository.listCredentials("org-a"))[0]!;
    expect(stored.keyHash).not.toBe(issued.plaintext);
    expect(stored.last4).toBe(issued.plaintext.slice(-4));
    expect(await service.verify("org-a", issued.plaintext)).not.toBeNull();
    await service.revoke(admin, stored.id, 1);
    expect(await service.verify("org-a", issued.plaintext)).toBeNull();

    const expired = await service.issue(admin, {
      name: "expired",
      scopes: ["audit:read"],
      environment: "development",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await service.verify("org-a", expired.plaintext)).toBeNull();
  });

  it("keeps audit append-only in the repository contract and database trigger", () => {
    expect(Object.keys(new MemoryControlPlaneRepository())).not.toContain("deleteAudit");
    const migration = readFileSync(
      path.join(process.cwd(), "migrations", "20260713_enterprise_control_plane.sql"),
      "utf8"
    );
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON enterprise_audit_events");
    expect(migration).not.toMatch(/enterprise_api_credentials[\s\S]*plaintext/i);
  });

  it("redacts secrets from safe exports and audit details", () => {
    const output = redactEnterpriseValue({
      apiKey: "esa_abcdefghijklmnopqrstuvwxyz",
      nested: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz" },
      safe: "visible",
    });
    expect(output).toEqual({
      apiKey: "[REDACTED]",
      nested: { authorization: "[REDACTED]" },
      safe: "visible",
    });
  });

  it("binds idempotency records to tenant, actor, key, operation, and request hash", async () => {
    const repository = new MemoryControlPlaneRepository();
    const record = {
      organizationId: "org-a",
      actorUserId: "admin",
      key: "request-123",
      operation: "credentials/issue",
      requestHash: "abc",
      responseStatus: 201,
      responseBody: { id: "one" },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect(await repository.putIdempotency(record)).toBe(true);
    expect(await repository.putIdempotency(record)).toBe(false);
    expect(await repository.getIdempotency("org-b", "admin", "request-123")).toBeNull();
    expect(await repository.getIdempotency("org-a", "admin", "request-123")).toMatchObject({
      operation: "credentials/issue",
      requestHash: "abc",
    });
  });

  it("enforces strict JSON, body limits, and privileged mutation rate limits", async () => {
    await expect(
      readStrictJson(new Request("https://example.test", { method: "POST", body: "{}" }))
    ).rejects.toBeInstanceOf(ApiInputError);
    await expect(
      readStrictJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: "x".repeat(200) }),
        }),
        32
      )
    ).rejects.toMatchObject({ status: 413 });

    const suffix = crypto.randomUUID();
    for (let index = 0; index < 30; index += 1) {
      expect(checkEnterpriseMutationRateLimit(`org-${suffix}`, `user-${suffix}`)).toBe(true);
    }
    expect(checkEnterpriseMutationRateLimit(`org-${suffix}`, `user-${suffix}`)).toBe(false);
  });
});
