import "server-only";

import { ApiKeyService } from "./api-key-service";
import { ControlPlaneService } from "./control-plane-service";
import { PostgresControlPlaneRepository } from "./postgres-control-plane-repository";
import { CredentialStoreSecretVault } from "./secret-vault";

export const controlPlaneRepository = new PostgresControlPlaneRepository();
export const controlPlaneService = new ControlPlaneService(controlPlaneRepository);

let apiKeyService: ApiKeyService | null = null;
export function getApiKeyService(): ApiKeyService {
  apiKeyService ??= new ApiKeyService(
    controlPlaneRepository,
    new CredentialStoreSecretVault()
  );
  return apiKeyService;
}
