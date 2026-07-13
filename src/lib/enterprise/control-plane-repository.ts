import "server-only";

import {
  type ApiCredentialMetadata,
  type ChangeApproval,
  type ConfigurationChange,
  type ControlPlaneResource,
  type EnterpriseAuditEvent,
  type ResourceVersion,
} from "./control-plane-types";

export interface StoredCredential extends ApiCredentialMetadata {
  keyHash: string;
}

export interface IdempotencyRecord {
  organizationId: string;
  actorUserId: string;
  key: string;
  operation: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: string;
}

export interface ControlPlaneRepository {
  listResources(organizationId: string): Promise<ControlPlaneResource[]>;
  getResource(organizationId: string, id: string): Promise<ControlPlaneResource | null>;
  insertResource(resource: ControlPlaneResource): Promise<void>;
  updateResource(resource: ControlPlaneResource, expectedVersion: number): Promise<boolean>;
  listVersions(organizationId: string, resourceId: string): Promise<ResourceVersion[]>;
  getVersion(organizationId: string, id: string): Promise<ResourceVersion | null>;
  insertVersion(version: ResourceVersion): Promise<void>;
  updateVersion(version: ResourceVersion): Promise<void>;
  listChanges(organizationId: string): Promise<ConfigurationChange[]>;
  getChange(organizationId: string, id: string): Promise<ConfigurationChange | null>;
  insertChange(change: ConfigurationChange): Promise<void>;
  updateChange(change: ConfigurationChange, expectedVersion: number): Promise<boolean>;
  insertApproval(approval: ChangeApproval): Promise<void>;
  listCredentials(organizationId: string): Promise<StoredCredential[]>;
  getCredential(organizationId: string, id: string): Promise<StoredCredential | null>;
  insertCredential(credential: StoredCredential): Promise<void>;
  updateCredential(credential: StoredCredential, expectedVersion: number): Promise<boolean>;
  appendAudit(event: EnterpriseAuditEvent): Promise<void>;
  listAudit(organizationId: string): Promise<EnterpriseAuditEvent[]>;
  getIdempotency(
    organizationId: string,
    actorUserId: string,
    key: string
  ): Promise<IdempotencyRecord | null>;
  putIdempotency(record: IdempotencyRecord): Promise<boolean>;
}

export class MemoryControlPlaneRepository implements ControlPlaneRepository {
  private resources = new Map<string, ControlPlaneResource>();
  private versions = new Map<string, ResourceVersion>();
  private changes = new Map<string, ConfigurationChange>();
  private approvals: ChangeApproval[] = [];
  private credentials = new Map<string, StoredCredential>();
  private audit: EnterpriseAuditEvent[] = [];
  private idempotency = new Map<string, IdempotencyRecord>();

  private key(org: string, id: string) {
    return `${org}\0${id}`;
  }

  async listResources(org: string) {
    return [...this.resources.values()]
      .filter((v) => v.organizationId === org)
      .map((value) => structuredClone(value));
  }
  async getResource(org: string, id: string) {
    return structuredClone(this.resources.get(this.key(org, id)) ?? null);
  }
  async insertResource(value: ControlPlaneResource) {
    this.resources.set(this.key(value.organizationId, value.id), structuredClone(value));
  }
  async updateResource(value: ControlPlaneResource, expectedVersion: number) {
    const key = this.key(value.organizationId, value.id);
    const current = this.resources.get(key);
    if (!current || current.version !== expectedVersion) return false;
    this.resources.set(key, structuredClone(value));
    return true;
  }
  async listVersions(org: string, resourceId: string) {
    return [...this.versions.values()]
      .filter((v) => v.organizationId === org && v.resourceId === resourceId)
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((value) => structuredClone(value));
  }
  async getVersion(org: string, id: string) {
    return structuredClone(this.versions.get(this.key(org, id)) ?? null);
  }
  async insertVersion(value: ResourceVersion) {
    this.versions.set(this.key(value.organizationId, value.id), structuredClone(value));
  }
  async updateVersion(value: ResourceVersion) {
    this.versions.set(this.key(value.organizationId, value.id), structuredClone(value));
  }
  async listChanges(org: string) {
    return [...this.changes.values()]
      .filter((v) => v.organizationId === org)
      .map((value) => structuredClone(value));
  }
  async getChange(org: string, id: string) {
    return structuredClone(this.changes.get(this.key(org, id)) ?? null);
  }
  async insertChange(value: ConfigurationChange) {
    this.changes.set(this.key(value.organizationId, value.id), structuredClone(value));
  }
  async updateChange(value: ConfigurationChange, expectedVersion: number) {
    const key = this.key(value.organizationId, value.id);
    const current = this.changes.get(key);
    if (!current || current.version !== expectedVersion) return false;
    this.changes.set(key, structuredClone(value));
    return true;
  }
  async insertApproval(value: ChangeApproval) {
    this.approvals.push(structuredClone(value));
  }
  async listCredentials(org: string) {
    return [...this.credentials.values()]
      .filter((v) => v.organizationId === org)
      .map((value) => structuredClone(value));
  }
  async getCredential(org: string, id: string) {
    return structuredClone(this.credentials.get(this.key(org, id)) ?? null);
  }
  async insertCredential(value: StoredCredential) {
    this.credentials.set(this.key(value.organizationId, value.id), structuredClone(value));
  }
  async updateCredential(value: StoredCredential, expectedVersion: number) {
    const key = this.key(value.organizationId, value.id);
    const current = this.credentials.get(key);
    if (!current || current.version !== expectedVersion) return false;
    this.credentials.set(key, structuredClone(value));
    return true;
  }
  async appendAudit(value: EnterpriseAuditEvent) {
    this.audit.push(structuredClone(value));
  }
  async listAudit(org: string) {
    return this.audit
      .filter((v) => v.organizationId === org)
      .map((value) => structuredClone(value));
  }
  async getIdempotency(org: string, actor: string, key: string) {
    const value = this.idempotency.get(`${org}\0${actor}\0${key}`);
    if (!value || Date.parse(value.expiresAt) <= Date.now()) return null;
    return structuredClone(value);
  }
  async putIdempotency(value: IdempotencyRecord) {
    const key = `${value.organizationId}\0${value.actorUserId}\0${value.key}`;
    if (this.idempotency.has(key)) return false;
    this.idempotency.set(key, structuredClone(value));
    return true;
  }
}
