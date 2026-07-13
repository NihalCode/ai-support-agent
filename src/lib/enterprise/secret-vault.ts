import "server-only";

import { CredentialStore } from "@/integrations/core/CredentialStore";
import type { IntegrationId } from "@/integrations/core/IntegrationTypes";

export interface SecretVault {
  put(input: {
    organizationId: string;
    secretId: string;
    value: string;
    actorUserId: string;
  }): Promise<string>;
  delete(organizationId: string, vaultRef: string): Promise<void>;
}

export class CredentialStoreSecretVault implements SecretVault {
  async put(input: {
    organizationId: string;
    secretId: string;
    value: string;
    actorUserId: string;
  }): Promise<string> {
    const ref = `enterprise-api-key:${input.secretId}`;
    await CredentialStore.save(
      ref as IntegrationId,
      { apiKey: input.value },
      input.organizationId,
      input.actorUserId
    );
    return ref;
  }

  async delete(organizationId: string, vaultRef: string): Promise<void> {
    await CredentialStore.delete(vaultRef as IntegrationId, organizationId);
  }
}

export class MemorySecretVault implements SecretVault {
  private values = new Map<string, string>();

  async put(input: {
    organizationId: string;
    secretId: string;
    value: string;
    actorUserId: string;
  }) {
    const ref = `memory://${input.organizationId}/${input.secretId}`;
    this.values.set(ref, input.value);
    return ref;
  }

  async delete(_organizationId: string, vaultRef: string) {
    this.values.delete(vaultRef);
  }

  has(vaultRef: string) {
    return this.values.has(vaultRef);
  }
}
