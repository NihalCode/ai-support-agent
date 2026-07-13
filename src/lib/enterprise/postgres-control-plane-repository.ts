import "server-only";

import { pgQuery } from "@/lib/db/postgres";
import type {
  ApiCredentialMetadata,
  ConfigurationChange,
  ControlPlaneResource,
  EnterpriseAuditEvent,
  ResourceVersion,
} from "./control-plane-types";
import type {
  ControlPlaneRepository,
  IdempotencyRecord,
  StoredCredential,
} from "./control-plane-repository";

const text = (row: Record<string, unknown>, key: string) => String(row[key]);
const nullable = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? null : String(row[key]);
const date = (row: Record<string, unknown>, key: string) =>
  new Date(String(row[key])).toISOString();
const json = <T>(value: unknown): T =>
  (typeof value === "string" ? JSON.parse(value) : value) as T;

function resource(row: Record<string, unknown>): ControlPlaneResource {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    resourceType: text(row, "resource_type"),
    name: text(row, "name"),
    environment: text(row, "environment") as ControlPlaneResource["environment"],
    activeVersionId: nullable(row, "active_version_id"),
    version: Number(row.version),
    createdByUserId: text(row, "created_by_user_id"),
    createdAt: date(row, "created_at"),
    updatedAt: date(row, "updated_at"),
  };
}

function resourceVersion(row: Record<string, unknown>): ResourceVersion {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    resourceId: text(row, "resource_id"),
    versionNumber: Number(row.version_number),
    configuration: json(row.configuration),
    configurationHash: text(row, "configuration_hash"),
    sanitizedDiff: json(row.sanitized_diff),
    approvalStatus: text(row, "approval_status") as ResourceVersion["approvalStatus"],
    createdByUserId: text(row, "created_by_user_id"),
    createdAt: date(row, "created_at"),
  };
}

function change(row: Record<string, unknown>): ConfigurationChange {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    resourceId: text(row, "resource_id"),
    proposedVersionId: text(row, "proposed_version_id"),
    rollbackFromVersionId: nullable(row, "rollback_from_version_id"),
    state: text(row, "state") as ConfigurationChange["state"],
    summary: text(row, "summary"),
    requestedByUserId: text(row, "requested_by_user_id"),
    scheduledFor: row.scheduled_for == null ? null : date(row, "scheduled_for"),
    emergencyOverride: Boolean(row.emergency_override),
    emergencyReason: nullable(row, "emergency_reason"),
    version: Number(row.version),
    createdAt: date(row, "created_at"),
    updatedAt: date(row, "updated_at"),
    activatedAt: row.activated_at == null ? null : date(row, "activated_at"),
  };
}

function credential(row: Record<string, unknown>): StoredCredential {
  const metadata: ApiCredentialMetadata = {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    name: text(row, "name"),
    last4: text(row, "last4"),
    scopes: json(row.scopes),
    environment: text(row, "environment") as ApiCredentialMetadata["environment"],
    vaultRef: text(row, "vault_ref"),
    expiresAt: row.expires_at == null ? null : date(row, "expires_at"),
    revokedAt: row.revoked_at == null ? null : date(row, "revoked_at"),
    rotatedFromId: nullable(row, "rotated_from_id"),
    createdByUserId: text(row, "created_by_user_id"),
    version: Number(row.version),
    createdAt: date(row, "created_at"),
    updatedAt: date(row, "updated_at"),
  };
  return { ...metadata, keyHash: text(row, "key_hash") };
}

function audit(row: Record<string, unknown>): EnterpriseAuditEvent {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    actorUserId: text(row, "actor_user_id"),
    action: text(row, "action"),
    severity: text(row, "severity") as EnterpriseAuditEvent["severity"],
    targetType: text(row, "target_type"),
    targetId: nullable(row, "target_id"),
    outcome: text(row, "outcome") as EnterpriseAuditEvent["outcome"],
    correlationId: nullable(row, "correlation_id") ?? undefined,
    requestId: nullable(row, "request_id") ?? undefined,
    details: json(row.details),
    createdAt: date(row, "created_at"),
  };
}

export class PostgresControlPlaneRepository implements ControlPlaneRepository {
  async listResources(org: string) {
    return (await pgQuery`SELECT * FROM control_plane_resources WHERE organization_id=${org} ORDER BY created_at DESC`).map(resource);
  }
  async getResource(org: string, id: string) {
    const rows = await pgQuery`SELECT * FROM control_plane_resources WHERE organization_id=${org} AND id=${id} LIMIT 1`;
    return rows[0] ? resource(rows[0]) : null;
  }
  async insertResource(v: ControlPlaneResource) {
    await pgQuery`INSERT INTO control_plane_resources (id,organization_id,resource_type,name,environment,active_version_id,version,created_by_user_id,created_at,updated_at) VALUES (${v.id},${v.organizationId},${v.resourceType},${v.name},${v.environment},${v.activeVersionId},${v.version},${v.createdByUserId},${v.createdAt},${v.updatedAt})`;
  }
  async updateResource(v: ControlPlaneResource, expected: number) {
    const rows = await pgQuery`UPDATE control_plane_resources SET active_version_id=${v.activeVersionId},version=${v.version},updated_at=${v.updatedAt} WHERE organization_id=${v.organizationId} AND id=${v.id} AND version=${expected} RETURNING id`;
    return rows.length === 1;
  }
  async listVersions(org: string, resourceId: string) {
    return (await pgQuery`SELECT * FROM control_plane_resource_versions WHERE organization_id=${org} AND resource_id=${resourceId} ORDER BY version_number DESC`).map(resourceVersion);
  }
  async getVersion(org: string, id: string) {
    const rows = await pgQuery`SELECT * FROM control_plane_resource_versions WHERE organization_id=${org} AND id=${id} LIMIT 1`;
    return rows[0] ? resourceVersion(rows[0]) : null;
  }
  async insertVersion(v: ResourceVersion) {
    await pgQuery`INSERT INTO control_plane_resource_versions (id,organization_id,resource_id,version_number,configuration,configuration_hash,sanitized_diff,approval_status,created_by_user_id,created_at) VALUES (${v.id},${v.organizationId},${v.resourceId},${v.versionNumber},${JSON.stringify(v.configuration)},${v.configurationHash},${JSON.stringify(v.sanitizedDiff)},${v.approvalStatus},${v.createdByUserId},${v.createdAt})`;
  }
  async updateVersion(v: ResourceVersion) {
    await pgQuery`UPDATE control_plane_resource_versions SET approval_status=${v.approvalStatus} WHERE organization_id=${v.organizationId} AND id=${v.id}`;
  }
  async listChanges(org: string) {
    return (await pgQuery`SELECT * FROM configuration_change_requests WHERE organization_id=${org} ORDER BY created_at DESC`).map(change);
  }
  async getChange(org: string, id: string) {
    const rows = await pgQuery`SELECT * FROM configuration_change_requests WHERE organization_id=${org} AND id=${id} LIMIT 1`;
    return rows[0] ? change(rows[0]) : null;
  }
  async insertChange(v: ConfigurationChange) {
    await pgQuery`INSERT INTO configuration_change_requests (id,organization_id,resource_id,proposed_version_id,rollback_from_version_id,state,summary,requested_by_user_id,scheduled_for,emergency_override,emergency_reason,version,created_at,updated_at,activated_at) VALUES (${v.id},${v.organizationId},${v.resourceId},${v.proposedVersionId},${v.rollbackFromVersionId},${v.state},${v.summary},${v.requestedByUserId},${v.scheduledFor},${v.emergencyOverride},${v.emergencyReason},${v.version},${v.createdAt},${v.updatedAt},${v.activatedAt})`;
  }
  async updateChange(v: ConfigurationChange, expected: number) {
    const rows = await pgQuery`UPDATE configuration_change_requests SET state=${v.state},scheduled_for=${v.scheduledFor},emergency_override=${v.emergencyOverride},emergency_reason=${v.emergencyReason},version=${v.version},updated_at=${v.updatedAt},activated_at=${v.activatedAt} WHERE organization_id=${v.organizationId} AND id=${v.id} AND version=${expected} RETURNING id`;
    return rows.length === 1;
  }
  async insertApproval(v: Parameters<ControlPlaneRepository["insertApproval"]>[0]) {
    await pgQuery`INSERT INTO configuration_change_approvals (id,organization_id,change_request_id,reviewer_user_id,decision,reason,created_at) VALUES (${v.id},${v.organizationId},${v.changeRequestId},${v.reviewerUserId},${v.decision},${v.reason},${v.createdAt})`;
  }
  async listCredentials(org: string) {
    return (await pgQuery`SELECT * FROM enterprise_api_credentials WHERE organization_id=${org} ORDER BY created_at DESC`).map(credential);
  }
  async getCredential(org: string, id: string) {
    const rows = await pgQuery`SELECT * FROM enterprise_api_credentials WHERE organization_id=${org} AND id=${id} LIMIT 1`;
    return rows[0] ? credential(rows[0]) : null;
  }
  async insertCredential(v: StoredCredential) {
    await pgQuery`INSERT INTO enterprise_api_credentials (id,organization_id,name,key_hash,last4,scopes,environment,vault_ref,expires_at,revoked_at,rotated_from_id,created_by_user_id,version,created_at,updated_at) VALUES (${v.id},${v.organizationId},${v.name},${v.keyHash},${v.last4},${JSON.stringify(v.scopes)},${v.environment},${v.vaultRef},${v.expiresAt},${v.revokedAt},${v.rotatedFromId},${v.createdByUserId},${v.version},${v.createdAt},${v.updatedAt})`;
  }
  async updateCredential(v: StoredCredential, expected: number) {
    const rows = await pgQuery`UPDATE enterprise_api_credentials SET revoked_at=${v.revokedAt},version=${v.version},updated_at=${v.updatedAt} WHERE organization_id=${v.organizationId} AND id=${v.id} AND version=${expected} RETURNING id`;
    return rows.length === 1;
  }
  async appendAudit(v: EnterpriseAuditEvent) {
    await pgQuery`INSERT INTO enterprise_audit_events (id,organization_id,actor_user_id,action,severity,target_type,target_id,outcome,correlation_id,request_id,details,created_at) VALUES (${v.id},${v.organizationId},${v.actorUserId},${v.action},${v.severity},${v.targetType},${v.targetId},${v.outcome},${v.correlationId ?? null},${v.requestId ?? null},${JSON.stringify(v.details)},${v.createdAt})`;
  }
  async listAudit(org: string) {
    return (await pgQuery`SELECT * FROM enterprise_audit_events WHERE organization_id=${org} ORDER BY created_at DESC LIMIT 1000`).map(audit);
  }
  async getIdempotency(org: string, actor: string, key: string) {
    const rows = await pgQuery`SELECT * FROM enterprise_idempotency_records WHERE organization_id=${org} AND actor_user_id=${actor} AND idempotency_key=${key} AND expires_at > NOW() LIMIT 1`;
    const row = rows[0];
    return row ? {
      organizationId: org,
      actorUserId: actor,
      key,
      operation: text(row, "operation"),
      requestHash: text(row, "request_hash"),
      responseStatus: Number(row.response_status),
      responseBody: json(row.response_body),
      expiresAt: date(row, "expires_at"),
    } : null;
  }
  async putIdempotency(v: IdempotencyRecord) {
    const rows = await pgQuery`INSERT INTO enterprise_idempotency_records (organization_id,actor_user_id,idempotency_key,operation,request_hash,response_status,response_body,expires_at) VALUES (${v.organizationId},${v.actorUserId},${v.key},${v.operation},${v.requestHash},${v.responseStatus},${JSON.stringify(v.responseBody)},${v.expiresAt}) ON CONFLICT DO NOTHING RETURNING idempotency_key`;
    return rows.length === 1;
  }
}
