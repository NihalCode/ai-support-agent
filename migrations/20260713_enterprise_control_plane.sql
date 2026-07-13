BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO organizations (id, name)
SELECT DISTINCT org_id, org_id FROM app_users
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES app_users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'support_agent', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id, status);
INSERT INTO organization_memberships (organization_id, user_id, role, status)
SELECT org_id, id, role, status
FROM app_users
WHERE role IN ('owner', 'admin', 'developer', 'support_agent', 'viewer')
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = NOW();

CREATE TABLE IF NOT EXISTS control_plane_resources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  resource_type TEXT NOT NULL,
  name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  active_version_id TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, resource_type, environment, name)
);
CREATE INDEX IF NOT EXISTS idx_cp_resources_org_env ON control_plane_resources(organization_id, environment, resource_type);

CREATE TABLE IF NOT EXISTS control_plane_resource_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  resource_id TEXT NOT NULL REFERENCES control_plane_resources(id),
  version_number BIGINT NOT NULL CHECK (version_number > 0),
  configuration JSONB NOT NULL,
  configuration_hash TEXT NOT NULL,
  sanitized_diff JSONB NOT NULL DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'unapproved' CHECK (approval_status IN ('unapproved', 'approved', 'superseded')),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, resource_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_cp_versions_resource ON control_plane_resource_versions(organization_id, resource_id, version_number DESC);

CREATE TABLE IF NOT EXISTS configuration_change_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  resource_id TEXT NOT NULL REFERENCES control_plane_resources(id),
  proposed_version_id TEXT NOT NULL REFERENCES control_plane_resource_versions(id),
  rollback_from_version_id TEXT REFERENCES control_plane_resource_versions(id),
  state TEXT NOT NULL CHECK (state IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','SCHEDULED','DEPLOYING','ACTIVE','ROLLED_BACK')),
  summary TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  emergency_override BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_reason TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  CHECK (NOT emergency_override OR NULLIF(BTRIM(emergency_reason), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_cp_changes_org_state ON configuration_change_requests(organization_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_changes_resource ON configuration_change_requests(organization_id, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS configuration_change_approvals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  change_request_id TEXT NOT NULL REFERENCES configuration_change_requests(id),
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (change_request_id, reviewer_user_id)
);
CREATE INDEX IF NOT EXISTS idx_cp_approvals_change ON configuration_change_approvals(organization_id, change_request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS enterprise_api_credentials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last4 TEXT NOT NULL CHECK (char_length(last4) = 4),
  scopes JSONB NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  vault_ref TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  rotated_from_id TEXT REFERENCES enterprise_api_credentials(id),
  created_by_user_id TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(scopes) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_cp_credentials_org ON enterprise_api_credentials(organization_id, environment, created_at DESC);

CREATE TABLE IF NOT EXISTS enterprise_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  target_type TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  correlation_id TEXT,
  request_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_org_at ON enterprise_audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_target ON enterprise_audit_events(organization_id, target_type, target_id, created_at DESC);

CREATE OR REPLACE FUNCTION enterprise_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'enterprise_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS enterprise_audit_no_update_delete ON enterprise_audit_events;
CREATE TRIGGER enterprise_audit_no_update_delete
BEFORE UPDATE OR DELETE ON enterprise_audit_events
FOR EACH ROW EXECUTE FUNCTION enterprise_audit_append_only();

CREATE TABLE IF NOT EXISTS enterprise_idempotency_records (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (organization_id, actor_user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_enterprise_idempotency_expiry ON enterprise_idempotency_records(expires_at);

CREATE TABLE IF NOT EXISTS enterprise_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  job_type TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  locked_until TIMESTAMPTZ,
  checkpoint JSONB NOT NULL DEFAULT '{}',
  last_error TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_jobs_claim ON enterprise_jobs(state, run_after, locked_until);
CREATE INDEX IF NOT EXISTS idx_enterprise_jobs_org ON enterprise_jobs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS enterprise_locks (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  lock_key TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  fence_token BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, lock_key)
);

ALTER TABLE control_plane_resources
  DROP CONSTRAINT IF EXISTS control_plane_resources_active_version_fk;
ALTER TABLE control_plane_resources
  ADD CONSTRAINT control_plane_resources_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES control_plane_resource_versions(id)
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;
