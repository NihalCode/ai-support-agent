import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { redactEnterpriseValue } from "./observability";
import type { ControlPlaneRepository } from "./control-plane-repository";
import {
  ControlPlaneError,
  type ConfigurationChange,
  type ControlPlaneActor,
  type ControlPlaneResource,
  type EnterpriseAuditEvent,
  type ResourceVersion,
} from "./control-plane-types";
import type { EnterpriseEnvironment } from "./types";

const now = () => new Date().toISOString();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function ensureWriter(actor: ControlPlaneActor, environment: EnterpriseEnvironment) {
  if (actor.role === "developer" && environment === "production") {
    throw new ControlPlaneError("forbidden", "Production resources require an approved change");
  }
}

export class ControlPlaneService {
  constructor(private readonly repository: ControlPlaneRepository) {}

  private async audit(
    actor: ControlPlaneActor,
    input: Omit<EnterpriseAuditEvent, "id" | "organizationId" | "actorUserId" | "createdAt">
  ) {
    await this.repository.appendAudit({
      ...input,
      id: randomUUID(),
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      details: redactEnterpriseValue(input.details),
      createdAt: now(),
    });
  }

  listResources(actor: ControlPlaneActor) {
    return this.repository.listResources(actor.organizationId);
  }

  async createResource(
    actor: ControlPlaneActor,
    input: {
      resourceType: string;
      name: string;
      environment: EnterpriseEnvironment;
      configuration: Record<string, unknown>;
      summary: string;
    }
  ) {
    ensureWriter(actor, input.environment);
    const at = now();
    const resource: ControlPlaneResource = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      resourceType: input.resourceType,
      name: input.name,
      environment: input.environment,
      activeVersionId: null,
      version: 1,
      createdByUserId: actor.userId,
      createdAt: at,
      updatedAt: at,
    };
    const version: ResourceVersion = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      resourceId: resource.id,
      versionNumber: 1,
      configuration: structuredClone(input.configuration),
      configurationHash: hash(input.configuration),
      sanitizedDiff: redactEnterpriseValue({ added: input.configuration }),
      approvalStatus: "unapproved",
      createdByUserId: actor.userId,
      createdAt: at,
    };
    const change: ConfigurationChange = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      resourceId: resource.id,
      proposedVersionId: version.id,
      rollbackFromVersionId: null,
      state: "DRAFT",
      summary: input.summary,
      requestedByUserId: actor.userId,
      scheduledFor: null,
      emergencyOverride: false,
      emergencyReason: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
      activatedAt: null,
    };
    await this.repository.insertResource(resource);
    await this.repository.insertVersion(version);
    await this.repository.insertChange(change);
    await this.audit(actor, {
      action: "resource.created",
      severity: "info",
      targetType: "resource",
      targetId: resource.id,
      outcome: "success",
      details: { environment: resource.environment, changeId: change.id },
    });
    return { resource, version, change };
  }

  async createChange(
    actor: ControlPlaneActor,
    resourceId: string,
    input: { configuration: Record<string, unknown>; summary: string }
  ) {
    const resource = await this.repository.getResource(actor.organizationId, resourceId);
    if (!resource) throw new ControlPlaneError("not_found", "Resource not found");
    const versions = await this.repository.listVersions(actor.organizationId, resourceId);
    const previous = resource.activeVersionId
      ? await this.repository.getVersion(actor.organizationId, resource.activeVersionId)
      : versions[0] ?? null;
    const at = now();
    const version: ResourceVersion = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      resourceId,
      versionNumber: Math.max(0, ...versions.map((v) => v.versionNumber)) + 1,
      configuration: structuredClone(input.configuration),
      configurationHash: hash(input.configuration),
      sanitizedDiff: redactEnterpriseValue({
        beforeHash: previous?.configurationHash ?? null,
        after: input.configuration,
      }),
      approvalStatus: "unapproved",
      createdByUserId: actor.userId,
      createdAt: at,
    };
    const change: ConfigurationChange = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      resourceId,
      proposedVersionId: version.id,
      rollbackFromVersionId: null,
      state: "DRAFT",
      summary: input.summary,
      requestedByUserId: actor.userId,
      scheduledFor: null,
      emergencyOverride: false,
      emergencyReason: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
      activatedAt: null,
    };
    await this.repository.insertVersion(version);
    await this.repository.insertChange(change);
    await this.audit(actor, {
      action: "change.created",
      severity: "info",
      targetType: "change",
      targetId: change.id,
      outcome: "success",
      details: { resourceId, versionNumber: version.versionNumber },
    });
    return { version, change };
  }

  async transition(
    actor: ControlPlaneActor,
    changeId: string,
    action: "submit" | "approve" | "reject" | "schedule" | "deploy" | "activate",
    input: { expectedVersion: number; reason?: string; scheduledFor?: string }
  ) {
    const current = await this.repository.getChange(actor.organizationId, changeId);
    if (!current) throw new ControlPlaneError("not_found", "Change not found");
    const resource = await this.repository.getResource(actor.organizationId, current.resourceId);
    if (!resource) throw new ControlPlaneError("not_found", "Change not found");
    const allowed: Record<typeof action, ConfigurationChange["state"][]> = {
      submit: ["DRAFT"],
      approve: ["PENDING_REVIEW"],
      reject: ["PENDING_REVIEW"],
      schedule: ["APPROVED"],
      deploy: ["APPROVED", "SCHEDULED"],
      activate: ["DEPLOYING"],
    };
    if (!allowed[action].includes(current.state)) {
      throw new ControlPlaneError("invalid_state", `Cannot ${action} from ${current.state}`);
    }
    if ((action === "approve" || action === "reject") && current.requestedByUserId === actor.userId) {
      throw new ControlPlaneError("forbidden", "A requester cannot review their own change");
    }
    if ((action === "approve" || action === "reject" || action === "deploy" || action === "activate") &&
        actor.role !== "admin" && actor.role !== "owner") {
      throw new ControlPlaneError("forbidden", "Administrator approval is required");
    }
    const nextState = {
      submit: "PENDING_REVIEW",
      approve: "APPROVED",
      reject: "REJECTED",
      schedule: "SCHEDULED",
      deploy: "DEPLOYING",
      activate: "ACTIVE",
    }[action] as ConfigurationChange["state"];
    const updated: ConfigurationChange = {
      ...current,
      state: nextState,
      scheduledFor: action === "schedule" ? input.scheduledFor ?? null : current.scheduledFor,
      version: current.version + 1,
      updatedAt: now(),
      activatedAt: action === "activate" ? now() : current.activatedAt,
    };
    if (action === "schedule" && !updated.scheduledFor) {
      throw new ControlPlaneError("validation_failed", "scheduledFor is required");
    }
    if (!(await this.repository.updateChange(updated, input.expectedVersion))) {
      throw new ControlPlaneError("conflict", "Change was modified by another request");
    }
    if (action === "approve" || action === "reject") {
      await this.repository.insertApproval({
        id: randomUUID(),
        organizationId: actor.organizationId,
        changeRequestId: current.id,
        reviewerUserId: actor.userId,
        decision: action === "approve" ? "APPROVED" : "REJECTED",
        reason: input.reason ?? null,
        createdAt: now(),
      });
    }
    if (action === "approve") {
      const version = await this.repository.getVersion(actor.organizationId, current.proposedVersionId);
      if (version) await this.repository.updateVersion({ ...version, approvalStatus: "approved" });
    }
    if (action === "activate") {
      const ok = await this.repository.updateResource(
        {
          ...resource,
          activeVersionId: current.proposedVersionId,
          version: resource.version + 1,
          updatedAt: now(),
        },
        resource.version
      );
      if (!ok) throw new ControlPlaneError("conflict", "Resource was modified by another request");
    }
    await this.audit(actor, {
      action: `change.${action}`,
      severity: action === "activate" && resource.environment === "production" ? "warning" : "info",
      targetType: "change",
      targetId: changeId,
      outcome: "success",
      details: { from: current.state, to: updated.state, reason: input.reason },
    });
    return updated;
  }

  async emergencyActivate(
    actor: ControlPlaneActor,
    changeId: string,
    input: { expectedVersion: number; reason: string }
  ) {
    if (actor.role !== "admin" && actor.role !== "owner") {
      throw new ControlPlaneError("forbidden", "Emergency override requires an administrator");
    }
    if (!actor.recentMfa || input.reason.trim().length < 10) {
      throw new ControlPlaneError("forbidden", "Emergency override requires recent MFA and a written reason");
    }
    const current = await this.repository.getChange(actor.organizationId, changeId);
    if (!current) throw new ControlPlaneError("not_found", "Change not found");
    const resource = await this.repository.getResource(actor.organizationId, current.resourceId);
    if (!resource) throw new ControlPlaneError("not_found", "Change not found");
    const updated = {
      ...current,
      state: "ACTIVE" as const,
      emergencyOverride: true,
      emergencyReason: input.reason.trim(),
      version: current.version + 1,
      updatedAt: now(),
      activatedAt: now(),
    };
    if (!(await this.repository.updateChange(updated, input.expectedVersion))) {
      throw new ControlPlaneError("conflict", "Change was modified by another request");
    }
    if (!(await this.repository.updateResource(
      { ...resource, activeVersionId: current.proposedVersionId, version: resource.version + 1, updatedAt: now() },
      resource.version
    ))) throw new ControlPlaneError("conflict", "Resource was modified by another request");
    await this.audit(actor, {
      action: "change.emergency_activate",
      severity: "high",
      targetType: "change",
      targetId: changeId,
      outcome: "success",
      details: { reason: input.reason },
    });
    return updated;
  }

  async rollback(actor: ControlPlaneActor, changeId: string, expectedVersion: number) {
    if (actor.role !== "admin" && actor.role !== "owner") {
      throw new ControlPlaneError("forbidden", "Rollback requires an administrator");
    }
    const current = await this.repository.getChange(actor.organizationId, changeId);
    if (!current || current.state !== "ACTIVE") {
      throw new ControlPlaneError("not_found", "Active change not found");
    }
    const resource = await this.repository.getResource(actor.organizationId, current.resourceId);
    if (!resource) throw new ControlPlaneError("not_found", "Active change not found");
    const approved = (await this.repository.listVersions(actor.organizationId, resource.id))
      .filter((v) => v.approvalStatus === "approved" && v.id !== current.proposedVersionId)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (!approved) throw new ControlPlaneError("invalid_state", "No approved rollback version exists");
    const updated = {
      ...current,
      state: "ROLLED_BACK" as const,
      rollbackFromVersionId: current.proposedVersionId,
      version: current.version + 1,
      updatedAt: now(),
    };
    if (!(await this.repository.updateChange(updated, expectedVersion)) ||
        !(await this.repository.updateResource(
          { ...resource, activeVersionId: approved.id, version: resource.version + 1, updatedAt: now() },
          resource.version
        ))) {
      throw new ControlPlaneError("conflict", "Rollback target was modified");
    }
    await this.audit(actor, {
      action: "change.rollback",
      severity: "warning",
      targetType: "change",
      targetId: changeId,
      outcome: "success",
      details: { restoredVersionId: approved.id },
    });
    return updated;
  }
}
