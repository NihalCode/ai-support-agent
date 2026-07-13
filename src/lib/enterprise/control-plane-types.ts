import type { EnterpriseEnvironment, EnterpriseRole } from "./types";

export const CHANGE_STATES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SCHEDULED",
  "DEPLOYING",
  "ACTIVE",
  "ROLLED_BACK",
] as const;

export type ChangeState = (typeof CHANGE_STATES)[number];

export interface ControlPlaneActor {
  userId: string;
  organizationId: string;
  role: EnterpriseRole;
  recentMfa: boolean;
}

export interface ControlPlaneResource {
  id: string;
  organizationId: string;
  resourceType: string;
  name: string;
  environment: EnterpriseEnvironment;
  activeVersionId: string | null;
  version: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceVersion {
  id: string;
  organizationId: string;
  resourceId: string;
  versionNumber: number;
  configuration: Record<string, unknown>;
  configurationHash: string;
  sanitizedDiff: Record<string, unknown>;
  approvalStatus: "unapproved" | "approved" | "superseded";
  createdByUserId: string;
  createdAt: string;
}

export interface ConfigurationChange {
  id: string;
  organizationId: string;
  resourceId: string;
  proposedVersionId: string;
  rollbackFromVersionId: string | null;
  state: ChangeState;
  summary: string;
  requestedByUserId: string;
  scheduledFor: string | null;
  emergencyOverride: boolean;
  emergencyReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export interface ChangeApproval {
  id: string;
  organizationId: string;
  changeRequestId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string | null;
  createdAt: string;
}

export interface ApiCredentialMetadata {
  id: string;
  organizationId: string;
  name: string;
  last4: string;
  scopes: string[];
  environment: EnterpriseEnvironment;
  vaultRef: string;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedFromId: string | null;
  createdByUserId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseAuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string;
  action: string;
  severity: "info" | "warning" | "high" | "critical";
  targetType: string;
  targetId: string | null;
  outcome: "success" | "failure" | "denied";
  correlationId?: string;
  requestId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export class ControlPlaneError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "forbidden"
      | "conflict"
      | "invalid_state"
      | "validation_failed",
    message: string
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}
