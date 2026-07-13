import "server-only";

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ControlPlaneRepository, StoredCredential } from "./control-plane-repository";
import { ControlPlaneError, type ApiCredentialMetadata, type ControlPlaneActor } from "./control-plane-types";
import type { SecretVault } from "./secret-vault";
import type { EnterpriseEnvironment } from "./types";

const metadata = ({ keyHash: _keyHash, ...value }: StoredCredential): ApiCredentialMetadata => value;

function ensureCredentialManager(actor: ControlPlaneActor) {
  if ((actor.role !== "admin" && actor.role !== "owner") || !actor.recentMfa) {
    throw new ControlPlaneError(
      "forbidden",
      "Credential management requires an administrator with recent MFA"
    );
  }
}

export class ApiKeyService {
  constructor(
    private readonly repository: ControlPlaneRepository,
    private readonly vault: SecretVault,
    private readonly hashSecret =
      process.env.API_KEY_HASH_SECRET?.trim() || process.env.AUTH0_SECRET?.trim()
  ) {
    if (!hashSecret || hashSecret.length < 32) {
      throw new Error("API_KEY_HASH_SECRET or AUTH0_SECRET must be at least 32 characters");
    }
  }

  private hash(plaintext: string) {
    return createHmac("sha256", this.hashSecret!).update(plaintext).digest("hex");
  }

  async list(actor: ControlPlaneActor) {
    return (await this.repository.listCredentials(actor.organizationId)).map(metadata);
  }

  async issue(
    actor: ControlPlaneActor,
    input: {
      name: string;
      scopes: string[];
      environment: EnterpriseEnvironment;
      expiresAt?: string | null;
      rotatedFromId?: string | null;
    }
  ) {
    ensureCredentialManager(actor);
    const id = randomUUID();
    const plaintext = `esa_${randomBytes(32).toString("base64url")}`;
    const at = new Date().toISOString();
    const vaultRef = await this.vault.put({
      organizationId: actor.organizationId,
      secretId: id,
      value: plaintext,
      actorUserId: actor.userId,
    });
    const stored: StoredCredential = {
      id,
      organizationId: actor.organizationId,
      name: input.name,
      keyHash: this.hash(plaintext),
      last4: plaintext.slice(-4),
      scopes: [...new Set(input.scopes)].sort(),
      environment: input.environment,
      vaultRef,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      rotatedFromId: input.rotatedFromId ?? null,
      createdByUserId: actor.userId,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    try {
      await this.repository.insertCredential(stored);
    } catch (error) {
      await this.vault.delete(actor.organizationId, vaultRef);
      throw error;
    }
    await this.repository.appendAudit({
      id: randomUUID(),
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: input.rotatedFromId ? "credential.rotated" : "credential.issued",
      severity: input.environment === "production" ? "high" : "warning",
      targetType: "api_credential",
      targetId: id,
      outcome: "success",
      details: { name: input.name, scopes: stored.scopes, environment: input.environment, last4: stored.last4 },
      createdAt: at,
    });
    return { credential: metadata(stored), plaintext };
  }

  async revoke(actor: ControlPlaneActor, id: string, expectedVersion: number) {
    ensureCredentialManager(actor);
    const current = await this.repository.getCredential(actor.organizationId, id);
    if (!current) throw new ControlPlaneError("not_found", "Credential not found");
    const updated = {
      ...current,
      revokedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: current.version + 1,
    };
    if (!(await this.repository.updateCredential(updated, expectedVersion))) {
      throw new ControlPlaneError("conflict", "Credential was modified by another request");
    }
    await this.vault.delete(actor.organizationId, current.vaultRef);
    await this.repository.appendAudit({
      id: randomUUID(),
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "credential.revoked",
      severity: "high",
      targetType: "api_credential",
      targetId: id,
      outcome: "success",
      details: { last4: current.last4 },
      createdAt: new Date().toISOString(),
    });
    return metadata(updated);
  }

  async rotate(actor: ControlPlaneActor, id: string, expectedVersion: number) {
    ensureCredentialManager(actor);
    const current = await this.repository.getCredential(actor.organizationId, id);
    if (!current) throw new ControlPlaneError("not_found", "Credential not found");
    if (current.version !== expectedVersion) {
      throw new ControlPlaneError("conflict", "Credential was modified by another request");
    }
    const issued = await this.issue(actor, {
      name: current.name,
      scopes: current.scopes,
      environment: current.environment,
      expiresAt: current.expiresAt,
      rotatedFromId: current.id,
    });
    await this.revoke(actor, id, expectedVersion);
    return issued;
  }

  async verify(organizationId: string, plaintext: string): Promise<ApiCredentialMetadata | null> {
    const digest = Buffer.from(this.hash(plaintext), "hex");
    for (const current of await this.repository.listCredentials(organizationId)) {
      const candidate = Buffer.from(current.keyHash, "hex");
      if (candidate.length !== digest.length || !timingSafeEqual(candidate, digest)) continue;
      if (current.revokedAt || (current.expiresAt && Date.parse(current.expiresAt) <= Date.now())) return null;
      return metadata(current);
    }
    return null;
  }
}
