# Enterprise Control Plane Security Foundation

Phase 0 established authorization and request-security primitives. The backend
control-plane phase adds durable configuration/version/change state, API-key
metadata and vault references, immutable audit events, idempotency, and
job/lock/checkpoint primitives. The protected Support Agent dashboard now
exposes those workflows without moving authorization decisions into the client.

## Trust boundaries

The authenticated Auth0 identity is linked to an `app_users` row. The server
session takes `id`, `role`, `orgId`, and `status` from that row. Enterprise
organization context is derived only from `session.user.orgId`; no tenant ID is
accepted from browser headers, query parameters, route payloads, or local
storage.

`owner`, `admin`, and `developer` are the only roles mapped into the enterprise
control plane. Unknown roles and unknown permissions are denied by default.
Disabled users are denied before authorization.

## Role and permission matrix

- Owner: all Phase 0 enterprise permissions.
- Admin: all Phase 0 enterprise permissions.
- Developer: dashboard access, resource reads, non-production resource writes,
  change creation/submission, credential metadata reads, non-sensitive audit
  reads, and job reads.
- Support agent and viewer: no enterprise permissions.

Developers cannot write production resources, approve/activate/rollback
changes, manage credentials, manage security settings, read sensitive audit
data, or manage jobs.

The defined permissions are:

- `admin_dashboard.access`
- `resources.read`, `resources.write`, `resources.write_production`
- `changes.create`, `changes.submit`, `changes.approve`,
  `changes.activate`, `changes.rollback`
- `credentials.read_metadata`, `credentials.manage`
- `security_settings.manage`
- `audit.read`, `audit.read_sensitive`
- `jobs.read`, `jobs.manage`

Client-reported capabilities are for display only. Every page and API must
enforce the central server policy independently.

## Authentication assurance

Normal dashboard access requires an active privileged role but not MFA.
Production and security-sensitive operations require:

1. an Auth0 `amr` or `acr` claim proving MFA; and
2. a recent `auth_time` (10-minute default).

Absent claims mean assurance is unavailable and sensitive operations are
denied. The application does not infer MFA from a successful login. Test mode
may supply `x-test-mfa: true`; that path is reachable only through the existing
`TEST_MODE` convention. Auth-disabled local sessions do not receive a
production assurance bypass.

Auth0 must be configured to perform step-up and return new claims before later
phases expose sensitive mutations.

## Request security

Cookie-authenticated mutations must apply all of these controls:

1. enterprise permission and tenant guard;
2. signed double-submit CSRF token plus exact same-origin validation;
3. strict `application/json` parsing with an incremental byte limit;
4. exact payload-key validation;
5. privileged mutation rate limiting keyed by trusted organization and user;
6. sanitized audit/observability events.

CSRF signing uses `CSRF_SIGNING_SECRET`, falling back to `AUTH0_SECRET`, and
requires at least 32 characters. The CSRF cookie is `Secure` in production,
`SameSite=Strict`, and cannot authenticate a request by itself.

The current rate-limit adapter reuses the existing in-process limiter. This is
not a distributed production guarantee.

## Configuration workflow

Existing support-agent operational approvals authorize individual support
actions. They do not authorize control-plane configuration changes.

Production configuration changes use a workflow separate from operational
ticket approvals:

`DRAFT -> PENDING_REVIEW -> APPROVED -> SCHEDULED -> DEPLOYING -> ACTIVE`

`REJECTED` terminates review. `ROLLED_BACK` records reversal of an active change
to the newest previously approved version. Every draft creates an immutable
resource version and sanitized diff. Change and resource `version` columns are
used for compare-and-swap optimistic locking.

Developers may write development and staging resources and may draft/submit a
production proposal. They cannot directly write or activate production,
approve any change, or review their own change. Owners/admins approve and
activate. Emergency activation requires owner/admin, a written reason, and
recent MFA; it emits a high-severity audit event.

## Secret and API-key design

Future credentials must never be stored as plaintext application records.
Recommended design:

- opaque secret material stored in an external vault;
- database stores only a vault reference, version, purpose, last four
  characters where useful, creator, timestamps, and rotation state;
- plaintext returned only once where key generation requires it;
- no secrets in browser storage, logs, audit metadata, exports, or error text;
- rotation and revocation require sensitive permissions and step-up.

API keys are generated with `crypto.randomBytes`, returned in plaintext exactly
once, HMAC-SHA256 hashed for verification, and represented later by metadata:
last four characters, scopes, environment, expiry/revocation/rotation links,
and `vault_ref`. The database has no plaintext secret column. The current vault
adapter reuses the encrypted `CredentialStore`; production should replace the
`SecretVault` implementation with a managed external vault.

`redactEnterpriseValue` removes sensitive keys and common bearer/private-key
patterns from structured telemetry and exports. Redaction is defense in depth,
not permission to log request bodies.

## Tenant isolation

Every repository method requires an organization ID and every SQL read/update
includes `organization_id`. Route payloads and paths cannot select a tenant;
the trusted session supplies it. Cross-tenant identifiers therefore receive
the same 404 response as unknown identifiers.

RLS is intentionally not enabled in this phase. The current `pgQuery` helper
uses independent Neon HTTP queries and cannot safely hold `SET LOCAL` tenant
context across a transaction. Adding policies without transaction-bound
context would either deny legitimate requests or invite unsafe global session
state. External hardening must first add a transaction API that sets a
validated tenant context, then enable FORCE ROW LEVEL SECURITY policies and
tests using a non-owner application database role.

Auth0 Organizations are required before one identity can safely select among
multiple organizations. An Auth0 organization claim must be validated and
mapped server-side to an allowed `app_users` membership; it must never replace
the database authorization check.

## Audit and observability

Requests receive sanitized correlation, request, and trace IDs. Supplied IDs
are accepted only in a restricted format; malformed IDs are replaced.
Enterprise events include action, outcome, organization, actor, and IDs.

`enterprise_audit_events` stores actor, tenant, target, action, severity,
outcome, request identifiers, redacted details, and time. A PostgreSQL trigger
rejects UPDATE and DELETE. The repository exposes append/list only.

The current Neon helper cannot atomically combine arbitrary repository calls;
optimistic compare-and-swap prevents lost updates, but audit/state atomicity is
a remaining database-layer hardening item. Activation workers should use
`enterprise_jobs`, fencing locks, and checkpoints once deployment execution is
connected.

## Threat model

Phase 0 addresses:

- unauthorized dashboard/API access through server layouts and API guards;
- privilege escalation through centralized deny-by-default policy;
- cross-tenant input substitution by deriving tenant context from the session;
- CSRF through signed double-submit and exact-origin checks;
- oversized or content-type-confused mutation bodies;
- brute-force mutation abuse through a rate-limit adapter;
- secret leakage in telemetry through structured redaction;
- stale or weak sessions for sensitive actions through MFA/recent-auth checks;
- indexing or framing of administrative responses through security metadata
  and response headers.

It does not yet address compromise of external identity, database, vault, or
deployment systems.

## External production requirements

- Auth0: hardened tenant, callback allowlist, secure cookie secret, breached
  password protection, and session lifetime policy.
- MFA: Actions/policies that require step-up for sensitive control-plane
  operations and preserve `amr`, `acr`, and `auth_time` in the application
  session.
- Auth0 Organizations: validated organization claims mapped to server-side
  application memberships for multi-tenant operation.
- PostgreSQL: durable `app_users`, organization/membership records,
  control-plane state, append-only audit tables, migrations, backups, and RLS.
- External vault: AWS Secrets Manager, HashiCorp Vault, or equivalent with
  workload identity, rotation, and access logs.
- Redis: distributed rate limits, replay/idempotency records, and short-lived
  workflow coordination for multi-instance deployments.
- Central telemetry: protected log transport, retention, alerting, and trace
  propagation.

Production readiness should fail when Auth0, a 32-character CSRF signing secret,
or durable Postgres is absent.

## Current endpoints

- `/admin/support-agent/apis`: protected Support Agent administration dashboard.
- `/api/admin/control-plane/context`: protected tenant, role, safe capabilities,
  assurance summary, and CSRF bootstrap.
- `/api/admin/control-plane/resources`: list/create resources and initial draft.
- `/api/admin/control-plane/resources/:id/versions`: immutable version history.
- `/api/admin/control-plane/resources/:id/changes`: create a versioned change.
- `/api/admin/control-plane/changes`: list changes.
- `/api/admin/control-plane/changes/:id/{submit,approve,reject,schedule,deploy,activate,rollback,emergency-activate}`:
  state transitions with optimistic locking.
- `/api/admin/control-plane/credentials`: metadata only.
- `/api/admin/control-plane/credentials/issue` and
  `/api/admin/control-plane/credentials/:id/{revoke,rotate}`: one-time issuance
  and lifecycle actions.
- `/api/admin/control-plane/audit`: tenant audit query.
- `/api/admin/control-plane/export`: redacted JSON export without vault refs or
  resource configuration payloads.
- `/api/admin/control-plane/zendesk/diagnostics`: sanitized connection, sync,
  storage, indexing, freshness, and operation-availability metadata.
- `/api/admin/control-plane/zendesk/test-search`: sanitized test-search counts,
  duration, and trace ID; ticket content and query text are never returned.
- `/api/admin/control-plane/zendesk/incremental-sync`: bounded incremental sync
  for administrators with CSRF, rate limiting, idempotency, tenant scoping, and
  immutable audit.
- `/api/health/live`: process liveness.
- `/api/health/ready`: production dependency readiness.

All mutation POST routes require the enterprise guard, same-origin signed CSRF,
`application/json`, a 32 KiB body limit, exact payload keys, tenant/user rate
limiting, and an `Idempotency-Key` header. Sensitive actions require recent MFA.
The POST-based sanitized test search also requires CSRF, strict JSON, and rate
limiting, but does not create an idempotency record because it is read-only.

## Operator workflows

### Developer

1. Open `/admin/support-agent/apis` and confirm the trusted organization and
   `developer` role in Overview.
2. Create or edit development and staging resources. Production is represented
   only through a versioned draft against an existing production resource.
3. Inspect sanitized version diffs, then submit the draft for review.
4. Use Zendesk diagnostics and sanitized test search to verify retrieval. A test
   search returns counts, duration, and a trace ID, never ticket content.
5. Developers cannot approve, activate, roll back, synchronize integrations,
   manage credentials, or change security settings. Those controls are absent
   from the UI and independently denied by the API.

### Administrator or owner

1. Complete Auth0 step-up MFA before production, approval, rollback, or
   credential operations.
2. Review pending changes and their sanitized immutable version diff. A
   requester cannot approve or reject their own change.
3. Approve or reject, then start deployment and mark it active only after the
   external deployment completed. Rollback selects the newest previously
   approved version.
4. Issue credentials only when the one-time secret can be copied directly into
   the managed vault. The dashboard cannot re-read an existing secret. Rotation
   returns a new value once and revokes the predecessor.
5. Run a bounded Zendesk incremental sync when diagnostics report it available.
   Full sync and index rebuild remain visibly unavailable because the current
   backend lacks a distributed lock, durable resumable worker, and rollback-safe
   index swap.
6. Download the redacted export and use the immutable audit timeline for change
   review. Neither contains vault references, plaintext secrets, or resource
   configuration bodies.

All admin pages and APIs send `X-Robots-Tag: noindex, nofollow`,
`Cache-Control: no-store`, and frame-denial headers. The server admin layout
authorizes before rendering; navigation visibility is not a security boundary.

## Product route boundary

`/admin/documentation-agent/apis` is intentionally not included. This repository
owns the Support Agent product and its integration/runtime model. A
Documentation Agent control plane would need product-specific resources,
deployment targets, and operator policy; adding a shell here would imply support
that the backend does not provide. The shared resource model can be extracted
into a separate product package when those requirements exist, without
duplicating this dashboard.

## Schema and migration

Run `npm run db:migrate`. The durable migration is
`migrations/20260713_enterprise_control_plane.sql`; the migration runner applies
it transactionally after the existing bootstrap. It creates organizations and
memberships (backfilled from `app_users`), resources, immutable versions,
configuration changes and approvals, API credential metadata, immutable audit,
idempotency records, and durable jobs/locks/checkpoints. Constraints validate
roles, environments, states, scopes, versions, and emergency reasons.

## Explicit remaining limitations

- Membership tables exist and are backfilled, but session selection still uses
  `app_users.org_id`; validated Auth0 Organization switching is future work.
- PostgreSQL RLS awaits transaction-bound tenant context and a restricted DB
  role as described above.
- Deployment execution is not connected; `SCHEDULED`/`DEPLOYING` and job tables
  are durable orchestration primitives for a future worker.
- The encrypted CredentialStore vault adapter must be replaced by managed
  secrets infrastructure for production.
- Cross-table state/audit operations need a shared Neon transaction abstraction
  before they can be fully atomic.
- Rate limiting is process-local until Redis is integrated.
- Zendesk incremental sync uses a process-local lock. Full sync and index
  rebuild are disabled until durable jobs, distributed locks, resumable
  checkpoints, and rollback-safe index swaps are available.
- CSRF tokens are signed but not server-side single-use tokens.
- Step-up failure returns a forbidden result; a dedicated Auth0 step-up redirect
  flow is not implemented.
- Health readiness checks configuration presence, not live database/Auth0/vault
  connectivity.
- Middleware authenticates broad routes, while authorization remains in each
  enterprise layout and handler. New enterprise handlers must use the guard.
