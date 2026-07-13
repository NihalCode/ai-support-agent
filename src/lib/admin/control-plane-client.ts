export type ControlPlaneEnvironment = "development" | "staging" | "production";

export type ControlPlaneCapability =
  | "resources.read"
  | "resources.write"
  | "resources.write_production"
  | "changes.create"
  | "changes.submit"
  | "changes.approve"
  | "changes.activate"
  | "changes.rollback"
  | "credentials.read_metadata"
  | "credentials.manage"
  | "security_settings.manage"
  | "audit.read"
  | "audit.read_sensitive"
  | "jobs.read"
  | "jobs.manage";

export interface ControlPlaneContext {
  organization: { id: string };
  actor: { id: string };
  role: string;
  capabilities: ControlPlaneCapability[];
  assurance: { mfaVerified: boolean; authTimeAvailable: boolean };
  csrfToken: string;
}

export interface ControlPlaneResource {
  id: string;
  name: string;
  resourceType: string;
  environment: ControlPlaneEnvironment;
  activeVersionId: string | null;
  version: number;
  updatedAt: string;
}

export interface ControlPlaneVersion {
  id: string;
  versionNumber: number;
  configurationHash: string;
  sanitizedDiff: Record<string, unknown>;
  approvalStatus: string;
  createdByUserId: string;
  createdAt: string;
}

export interface ControlPlaneChange {
  id: string;
  resourceId: string;
  state: string;
  summary: string;
  requestedByUserId: string;
  scheduledFor: string | null;
  version: number;
  updatedAt: string;
}

export interface ControlPlaneCredential {
  id: string;
  name: string;
  last4: string;
  scopes: string[];
  environment: ControlPlaneEnvironment;
  expiresAt: string | null;
  revokedAt: string | null;
  version: number;
  createdAt: string;
}

export interface ControlPlaneAuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  severity: string;
  targetType: string;
  outcome: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ZendeskDiagnostics {
  status: {
    connected: boolean;
    authorized: boolean;
    enabled: boolean;
    syncState: string;
    lastSuccessfulSyncAt?: string;
    lastIndexedAt?: string;
    ticketsDiscovered: number;
    ticketsStored: number;
    ticketsIndexed: number;
    commentsIndexed: number;
    freshness: string;
    lagSeconds: number | null;
    sanitizedLastError?: string;
  };
  stages: Array<{ id: string; label: string; state: string }>;
  operations: {
    incrementalSync: { available: boolean; reason?: string };
    fullSync: { available: false; reason: string };
    rebuildIndex: { available: false; reason: string };
    testSearch: { available: true };
  };
}

export const CONTROL_PLANE_API = "/api/admin/control-plane";

export function formatAdminDate(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not available";
}

export async function controlPlaneJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

export function canCapability(
  context: ControlPlaneContext | null,
  capability: ControlPlaneCapability
): boolean {
  return context?.capabilities.includes(capability) ?? false;
}
