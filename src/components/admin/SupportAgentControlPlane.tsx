"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Environment = "development" | "staging" | "production";
type Capability =
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
  | "audit.read"
  | "jobs.manage";

interface Context {
  organization: { id: string };
  actor: { id: string };
  role: string;
  capabilities: Capability[];
  assurance: { mfaVerified: boolean; authTimeAvailable: boolean };
  csrfToken: string;
}

interface Resource {
  id: string;
  name: string;
  resourceType: string;
  environment: Environment;
  activeVersionId: string | null;
  version: number;
  updatedAt: string;
}

interface Version {
  id: string;
  versionNumber: number;
  configurationHash: string;
  sanitizedDiff: Record<string, unknown>;
  approvalStatus: string;
  createdByUserId: string;
  createdAt: string;
}

interface Change {
  id: string;
  resourceId: string;
  state: string;
  summary: string;
  requestedByUserId: string;
  scheduledFor: string | null;
  version: number;
  updatedAt: string;
}

interface Credential {
  id: string;
  name: string;
  last4: string;
  scopes: string[];
  environment: Environment;
  expiresAt: string | null;
  revokedAt: string | null;
  version: number;
  createdAt: string;
}

interface AuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  severity: string;
  targetType: string;
  outcome: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface ZendeskDiagnostics {
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

const API = "/api/admin/control-plane";
const panel =
  "rounded-2xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-xl shadow-black/10";
const input =
  "w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-violet-400";
const button =
  "rounded-lg border border-violet-400/50 bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-100 outline-none hover:bg-violet-500/25 focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-45";
const dangerButton =
  "rounded-lg border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 outline-none hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45";

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function statusText(value: boolean, positive: string, negative: string) {
  return value ? positive : negative;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export default function SupportAgentControlPlane() {
  const [context, setContext] = useState<Context | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<ZendeskDiagnostics | null>(null);
  const [versions, setVersions] = useState<Record<string, Version[]>>({});
  const [notice, setNotice] = useState("Loading protected control-plane data…");
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const secretDialog = useRef<HTMLDialogElement>(null);

  const can = useCallback(
    (capability: Capability) => context?.capabilities.includes(capability) ?? false,
    [context]
  );

  const refresh = useCallback(async () => {
    setNotice("Refreshing protected control-plane data…");
    try {
      const nextContext = await json<Context>(`${API}/context`);
      setContext(nextContext);
      const requests = await Promise.allSettled([
        json<{ resources: Resource[] }>(`${API}/resources`),
        json<{ changes: Change[] }>(`${API}/changes`),
        json<{ credentials: Credential[] }>(`${API}/credentials`),
        json<{ events: AuditEvent[] }>(`${API}/audit`),
        json<{ diagnostics: ZendeskDiagnostics }>(`${API}/zendesk/diagnostics`),
      ]);
      if (requests[0].status === "fulfilled") setResources(requests[0].value.resources);
      if (requests[1].status === "fulfilled") setChanges(requests[1].value.changes);
      if (requests[2].status === "fulfilled") setCredentials(requests[2].value.credentials);
      if (requests[3].status === "fulfilled") setAudit(requests[3].value.events);
      if (requests[4].status === "fulfilled") setDiagnostics(requests[4].value.diagnostics);
      const failures = requests.filter((result) => result.status === "rejected").length;
      setNotice(
        failures
          ? `${failures} dashboard data source${failures === 1 ? "" : "s"} unavailable. Available data is shown.`
          : "Dashboard data is current."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Dashboard could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const mutate = useCallback(
    async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
      if (!context) throw new Error("Security context is not ready.");
      return json<T>(`${API}/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": context.csrfToken,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
    },
    [context]
  );

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(true);
    setNotice(`${label} in progress…`);
    try {
      await action();
      setNotice(`${label} completed.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setBusy(false);
    }
  }

  async function loadVersions(resourceId: string) {
    try {
      const result = await json<{ versions: Version[] }>(
        `${API}/resources/${resourceId}/versions`
      );
      setVersions((current) => ({ ...current, [resourceId]: result.versions }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Version history failed.");
    }
  }

  const byEnvironment = useMemo(
    () =>
      (["development", "staging", "production"] as const).map((environment) => ({
        environment,
        resources: resources.filter((resource) => resource.environment === environment),
      })),
    [resources]
  );

  if (!context) {
    return (
      <main className="min-h-screen bg-[#07090d] px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-7xl" role="status" aria-live="polite">
          <h1 className="text-3xl font-semibold">Support Agent API control plane</h1>
          <p className="mt-4 text-slate-300">{notice}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-800 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">
            Enterprise control plane
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold sm:text-4xl">Support Agent APIs</h1>
              <p className="mt-2 max-w-3xl text-slate-300">
                Tenant-scoped configuration, approvals, credentials, deployment state,
                diagnostics, and immutable audit history.
              </p>
            </div>
            <button className={button} onClick={() => void refresh()} disabled={busy}>
              Refresh data
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-400" role="status" aria-live="polite">
            {notice}
          </p>
        </header>

        <nav aria-label="Dashboard sections" className="my-6 flex flex-wrap gap-2">
          {[
            ["overview", "Overview"],
            ["resources", "Resources"],
            ["changes", "Changes"],
            ["zendesk", "Zendesk"],
            ["credentials", "Credentials"],
            ["audit", "Audit"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-200 outline-none hover:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              {label}
            </a>
          ))}
        </nav>

        <section id="overview" aria-labelledby="overview-heading" className={panel}>
          <h2 id="overview-heading" className="text-xl font-semibold">
            Overview and security context
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Organization" value={context.organization.id} />
            <Metric label="Role" value={context.role} />
            <Metric
              label="Recent MFA"
              value={statusText(
                context.assurance.mfaVerified,
                "Verified",
                "Required for sensitive actions"
              )}
            />
            <Metric label="Configured resources" value={String(resources.length)} />
          </dl>
          <p className="mt-4 text-sm text-slate-400">
            The server layout and every API authorize independently. Client capability
            checks only hide unavailable affordances.
          </p>
        </section>

        <section id="resources" aria-labelledby="resources-heading" className={`${panel} mt-6`}>
          <h2 id="resources-heading" className="text-xl font-semibold">
            API and configuration resources
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Resource categories support APIs, integrations, webhooks, domains, and rate
            limits without storing secret values in dashboard payloads.
          </p>
          {can("resources.write") && (
            <ResourceForm
              busy={busy}
              allowProduction={
                can("resources.write_production") && context.assurance.mfaVerified
              }
              onSubmit={(payload) =>
                runAction("Create resource", async () => {
                  await mutate("resources", payload);
                })
              }
            />
          )}
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {byEnvironment.map(({ environment, resources: items }) => (
              <section
                key={environment}
                aria-labelledby={`environment-${environment}`}
                className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"
              >
                <h3 id={`environment-${environment}`} className="font-semibold capitalize">
                  {environment}
                </h3>
                <p className="mt-1 text-xs text-slate-500">{items.length} resources</p>
                <ul className="mt-4 space-y-3">
                  {items.map((resource) => (
                    <li key={resource.id} className="rounded-lg border border-slate-800 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{resource.name}</p>
                          <p className="text-xs text-slate-400">{resource.resourceType}</p>
                        </div>
                        <span className="text-xs text-slate-400">v{resource.version}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Active: {resource.activeVersionId ? "Yes" : "No"} · Updated{" "}
                        {formatDate(resource.updatedAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className={button}
                          onClick={() => void loadVersions(resource.id)}
                        >
                          Version history
                        </button>
                        {can("changes.create") && (
                          <DraftChangeButton
                            resource={resource}
                            busy={busy}
                            onCreate={(configuration, summary) =>
                              runAction("Create draft", async () => {
                                await mutate(`resources/${resource.id}/changes`, {
                                  configuration,
                                  summary,
                                });
                              })
                            }
                          />
                        )}
                      </div>
                      {versions[resource.id] && (
                        <VersionHistory versions={versions[resource.id]} />
                      )}
                    </li>
                  ))}
                  {items.length === 0 && (
                    <li className="text-sm text-slate-500">No resources configured.</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section id="changes" aria-labelledby="changes-heading" className={`${panel} mt-6`}>
          <h2 id="changes-heading" className="text-xl font-semibold">
            Change, approval, and deployment history
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">
                Versioned changes with deployment and review actions
              </caption>
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th scope="col" className="p-2">Summary</th>
                  <th scope="col" className="p-2">State</th>
                  <th scope="col" className="p-2">Requester</th>
                  <th scope="col" className="p-2">Updated</th>
                  <th scope="col" className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => {
                  const selfReview = change.requestedByUserId === context.actor.id;
                  return (
                    <tr key={change.id} className="border-b border-slate-800 align-top">
                      <td className="p-2">{change.summary}</td>
                      <td className="p-2"><Status value={change.state} /></td>
                      <td className="p-2 font-mono text-xs">{change.requestedByUserId}</td>
                      <td className="p-2">{formatDate(change.updatedAt)}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          {change.state === "DRAFT" && can("changes.submit") && (
                            <ActionButton
                              label="Submit"
                              busy={busy}
                              onClick={() =>
                                runAction("Submit change", async () => {
                                  await mutate(`changes/${change.id}/submit`, {
                                    expectedVersion: change.version,
                                  });
                                })
                              }
                            />
                          )}
                          {change.state === "PENDING_REVIEW" &&
                            can("changes.approve") &&
                            context.assurance.mfaVerified &&
                            !selfReview && (
                              <>
                                <ActionButton
                                  label="Approve"
                                  busy={busy}
                                  confirm="Approve this change for deployment?"
                                  onClick={() =>
                                    runAction("Approve change", async () => {
                                      await mutate(`changes/${change.id}/approve`, {
                                        expectedVersion: change.version,
                                        reason: "Approved in control-plane dashboard",
                                      });
                                    })
                                  }
                                />
                                <ActionButton
                                  label="Reject"
                                  busy={busy}
                                  danger
                                  confirm="Reject this change?"
                                  onClick={() =>
                                    runAction("Reject change", async () => {
                                      await mutate(`changes/${change.id}/reject`, {
                                        expectedVersion: change.version,
                                        reason: "Rejected in control-plane dashboard",
                                      });
                                    })
                                  }
                                />
                              </>
                            )}
                          {change.state === "PENDING_REVIEW" && selfReview && (
                            <span className="text-xs text-amber-200">
                              Self-approval prohibited
                            </span>
                          )}
                          {["APPROVED", "SCHEDULED"].includes(change.state) &&
                            can("changes.activate") &&
                            context.assurance.mfaVerified && (
                              <ActionButton
                                label="Start deployment"
                                busy={busy}
                                confirm="Start deployment for this approved change?"
                                onClick={() =>
                                  runAction("Start deployment", async () => {
                                    await mutate(`changes/${change.id}/deploy`, {
                                      expectedVersion: change.version,
                                    });
                                  })
                                }
                              />
                            )}
                          {change.state === "DEPLOYING" &&
                            can("changes.activate") &&
                            context.assurance.mfaVerified && (
                            <ActionButton
                              label="Mark active"
                              busy={busy}
                              confirm="Confirm this deployment is active?"
                              onClick={() =>
                                runAction("Activate deployment", async () => {
                                  await mutate(`changes/${change.id}/activate`, {
                                    expectedVersion: change.version,
                                  });
                                })
                              }
                            />
                          )}
                          {change.state === "ACTIVE" &&
                            can("changes.rollback") &&
                            context.assurance.mfaVerified && (
                            <ActionButton
                              label="Rollback"
                              busy={busy}
                              danger
                              confirm="Rollback to the newest previously approved version?"
                              onClick={() =>
                                runAction("Rollback deployment", async () => {
                                  await mutate(`changes/${change.id}/rollback`, {
                                    expectedVersion: change.version,
                                  });
                                })
                              }
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {changes.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">No changes are available.</p>
          )}
        </section>

        <ZendeskPanel
          diagnostics={diagnostics}
          busy={busy}
          canSync={can("jobs.manage")}
          searchResult={searchResult}
          onSearch={(query) =>
            runAction("Zendesk test search", async () => {
              const result = await mutate<{
                result: {
                  resultCount: number;
                  indexedResultCount: number;
                  durationMs: number;
                  traceId: string;
                };
              }>("zendesk/test-search", { query });
              setSearchResult(
                `Search returned ${result.result.resultCount} sanitized matches (${result.result.indexedResultCount} indexed) in ${result.result.durationMs} ms. Trace ${result.result.traceId}.`
              );
            })
          }
          onSync={() =>
            runAction("Zendesk incremental sync", async () => {
              await mutate("zendesk/incremental-sync", {});
            })
          }
        />

        <section id="credentials" aria-labelledby="credentials-heading" className={`${panel} mt-6`}>
          <h2 id="credentials-heading" className="text-xl font-semibold">
            API credentials
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Existing secret values are never returned. New and rotated secrets are shown
            once and must be stored immediately.
          </p>
          {can("credentials.manage") && (
            <CredentialForm
              busy={busy}
              mfaVerified={context.assurance.mfaVerified}
              onIssue={(payload) =>
                runAction("Issue credential", async () => {
                  const result = await mutate<{ plaintext: string }>(
                    "credentials/issue",
                    payload
                  );
                  setSecret(result.plaintext);
                  secretDialog.current?.showModal();
                })
              }
            />
          )}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <caption className="sr-only">Credential metadata without secret values</caption>
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th scope="col" className="p-2">Name</th>
                  <th scope="col" className="p-2">Environment</th>
                  <th scope="col" className="p-2">Last four</th>
                  <th scope="col" className="p-2">Scopes</th>
                  <th scope="col" className="p-2">Status</th>
                  <th scope="col" className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((credential) => (
                  <tr key={credential.id} className="border-b border-slate-800">
                    <td className="p-2">{credential.name}</td>
                    <td className="p-2 capitalize">{credential.environment}</td>
                    <td className="p-2 font-mono">••••{credential.last4}</td>
                    <td className="p-2">{credential.scopes.join(", ")}</td>
                    <td className="p-2">
                      {credential.revokedAt ? "Revoked" : "Active"}
                    </td>
                    <td className="p-2">
                      {can("credentials.manage") &&
                        context.assurance.mfaVerified &&
                        !credential.revokedAt && (
                          <div className="flex gap-2">
                            <ActionButton
                              label="Rotate"
                              busy={busy}
                              confirm="Rotate this credential? The current key will be revoked."
                              onClick={() =>
                                runAction("Rotate credential", async () => {
                                  const result = await mutate<{ plaintext: string }>(
                                    `credentials/${credential.id}/rotate`,
                                    { expectedVersion: credential.version }
                                  );
                                  setSecret(result.plaintext);
                                  secretDialog.current?.showModal();
                                })
                              }
                            />
                            <ActionButton
                              label="Revoke"
                              busy={busy}
                              danger
                              confirm="Permanently revoke this credential?"
                              onClick={() =>
                                runAction("Revoke credential", async () => {
                                  await mutate(`credentials/${credential.id}/revoke`, {
                                    expectedVersion: credential.version,
                                  });
                                })
                              }
                            />
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="audit" aria-labelledby="audit-heading" className={`${panel} mt-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="audit-heading" className="text-xl font-semibold">
                Immutable audit timeline
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Append-only, tenant-scoped events with redacted details.
              </p>
            </div>
            <button
              className={button}
              onClick={() => {
                window.location.href = `${API}/export`;
              }}
            >
              Download redacted export
            </button>
          </div>
          <ol className="mt-5 space-y-3">
            {audit.map((event) => (
              <li key={event.id} className="rounded-lg border border-slate-800 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Status value={`${event.outcome}: ${event.action}`} />
                  <span className="text-xs uppercase text-slate-500">{event.severity}</span>
                  <time className="ml-auto text-xs text-slate-400" dateTime={event.createdAt}>
                    {formatDate(event.createdAt)}
                  </time>
                </div>
                <p className="mt-2 font-mono text-xs text-slate-400">
                  {event.targetType} · actor {event.actorUserId}
                </p>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
                  {JSON.stringify(event.details, null, 2)}
                </pre>
              </li>
            ))}
          </ol>
          {audit.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">No audit events are available.</p>
          )}
        </section>
      </div>

      <dialog
        ref={secretDialog}
        aria-labelledby="secret-title"
        onClose={() => setSecret(null)}
        className="m-auto max-w-lg rounded-2xl border border-violet-400/40 bg-slate-950 p-0 text-slate-100 backdrop:bg-black/75"
      >
        <div className="p-6">
          <h2 id="secret-title" className="text-xl font-semibold">Copy this secret now</h2>
          <p className="mt-2 text-sm text-amber-200">
            This is the only time the secret can be viewed.
          </p>
          <code className="mt-4 block overflow-auto rounded-lg bg-black p-3 text-sm">
            {secret}
          </code>
          <form method="dialog" className="mt-5 text-right">
            <button className={button}>I have stored it securely</button>
          </form>
        </div>
      </dialog>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-2 break-all font-semibold">{value}</dd>
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100">
      {value.replaceAll("_", " ")}
    </span>
  );
}

function ActionButton({
  label,
  busy,
  danger,
  confirm,
  onClick,
}: {
  label: string;
  busy: boolean;
  danger?: boolean;
  confirm?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={danger ? dangerButton : button}
      disabled={busy}
      onClick={() => {
        if (!confirm || window.confirm(confirm)) onClick();
      }}
    >
      {label}
    </button>
  );
}

function ResourceForm({
  busy,
  allowProduction,
  onSubmit,
}: {
  busy: boolean;
  allowProduction: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mt-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          onSubmit({
            name: String(form.get("name")),
            resourceType: String(form.get("resourceType")),
            environment: String(form.get("environment")),
            summary: String(form.get("summary")),
            configuration: JSON.parse(String(form.get("configuration"))),
          });
        } catch {
          event.currentTarget
            .querySelector<HTMLTextAreaElement>("[name=configuration]")
            ?.setCustomValidity("Configuration must be valid JSON.");
          event.currentTarget.reportValidity();
        }
      }}
    >
      <label className="text-sm">Name<input className={`${input} mt-1`} name="name" required maxLength={200} /></label>
      <label className="text-sm">
        Category
        <select className={`${input} mt-1`} name="resourceType" defaultValue="api">
          <option value="api">API</option>
          <option value="integration">Integration</option>
          <option value="webhook">Webhook</option>
          <option value="domain">Domain</option>
          <option value="rate_limit">Rate limit</option>
          <option value="configuration">Configuration</option>
        </select>
      </label>
      <label className="text-sm">
        Environment
        <select className={`${input} mt-1`} name="environment" defaultValue="development">
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          {allowProduction && <option value="production">Production</option>}
        </select>
      </label>
      <label className="text-sm">Summary<input className={`${input} mt-1`} name="summary" required maxLength={1000} /></label>
      <label className="text-sm md:col-span-2">
        Configuration JSON
        <textarea
          className={`${input} mt-1 min-h-28 font-mono`}
          name="configuration"
          defaultValue={'{\n  "enabled": true\n}'}
          onInput={(event) => event.currentTarget.setCustomValidity("")}
          required
        />
      </label>
      <div className="md:col-span-2">
        <button className={button} disabled={busy}>Create draft resource</button>
      </div>
    </form>
  );
}

function DraftChangeButton({
  resource,
  busy,
  onCreate,
}: {
  resource: Resource;
  busy: boolean;
  onCreate: (configuration: Record<string, unknown>, summary: string) => void;
}) {
  return (
    <button
      className={button}
      disabled={busy}
      onClick={() => {
        const summary = window.prompt(`Summary for ${resource.name}`);
        if (!summary) return;
        const raw = window.prompt("New configuration JSON", '{\n  "enabled": true\n}');
        if (!raw) return;
        try {
          onCreate(JSON.parse(raw) as Record<string, unknown>, summary);
        } catch {
          window.alert("Configuration must be valid JSON.");
        }
      }}
    >
      Create draft
    </button>
  );
}

function VersionHistory({ versions }: { versions: Version[] }) {
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <h4 className="text-sm font-semibold">Sanitized version history</h4>
      <ol className="mt-2 space-y-2">
        {versions.map((version) => (
          <li key={version.id} className="text-xs text-slate-300">
            <div>
              v{version.versionNumber} · {version.approvalStatus} ·{" "}
              {formatDate(version.createdAt)}
            </div>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2">
              {JSON.stringify(version.sanitizedDiff, null, 2)}
            </pre>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CredentialForm({
  busy,
  mfaVerified,
  onIssue,
}: {
  busy: boolean;
  mfaVerified: boolean;
  onIssue: (payload: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mt-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 md:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onIssue({
          name: String(form.get("name")),
          environment: String(form.get("environment")),
          scopes: String(form.get("scopes")).split(",").map((scope) => scope.trim()).filter(Boolean),
          expiresAt: form.get("expiresAt")
            ? new Date(String(form.get("expiresAt"))).toISOString()
            : null,
        });
      }}
    >
      <label className="text-sm">Name<input className={`${input} mt-1`} name="name" required /></label>
      <label className="text-sm">
        Environment
        <select className={`${input} mt-1`} name="environment">
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
      </label>
      <label className="text-sm">Scopes<input className={`${input} mt-1`} name="scopes" placeholder="resources:read" required /></label>
      <label className="text-sm">Expires<input className={`${input} mt-1`} name="expiresAt" type="datetime-local" /></label>
      <div className="md:col-span-4">
        <button className={button} disabled={busy || !mfaVerified}>Issue one-time secret</button>
        {!mfaVerified && (
          <p className="mt-2 text-xs text-amber-200">Recent MFA is required.</p>
        )}
      </div>
    </form>
  );
}

function ZendeskPanel({
  diagnostics,
  busy,
  canSync,
  searchResult,
  onSearch,
  onSync,
}: {
  diagnostics: ZendeskDiagnostics | null;
  busy: boolean;
  canSync: boolean;
  searchResult: string | null;
  onSearch: (query: string) => void;
  onSync: () => void;
}) {
  return (
    <section id="zendesk" aria-labelledby="zendesk-heading" className={`${panel} mt-6`}>
      <h2 id="zendesk-heading" className="text-xl font-semibold">Zendesk diagnostics</h2>
      {!diagnostics ? (
        <p className="mt-3 text-sm text-slate-400">Diagnostics are unavailable.</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Connection" value={statusText(diagnostics.status.connected, "Connected", "Not connected")} />
            <Metric label="Authorization" value={statusText(diagnostics.status.authorized, "Authorized", "Not authorized")} />
            <Metric label="Sync state" value={diagnostics.status.syncState} />
            <Metric label="Freshness" value={diagnostics.status.freshness} />
            <Metric label="Tickets stored" value={String(diagnostics.status.ticketsStored)} />
            <Metric label="Tickets indexed" value={String(diagnostics.status.ticketsIndexed)} />
            <Metric label="Comments indexed" value={String(diagnostics.status.commentsIndexed)} />
            <Metric label="Index lag" value={diagnostics.status.lagSeconds == null ? "Unknown" : `${diagnostics.status.lagSeconds}s`} />
          </dl>
          <h3 className="mt-5 font-semibold">Synchronization stages</h3>
          <ol className="mt-2 grid gap-2 md:grid-cols-3">
            {diagnostics.stages.map((stage) => (
              <li key={stage.id} className="rounded-lg border border-slate-700 p-3 text-sm">
                <Status value={stage.state} /> <span className="ml-1">{stage.label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-slate-400">
            Last sync: {formatDate(diagnostics.status.lastSuccessfulSyncAt)} · Last index:{" "}
            {formatDate(diagnostics.status.lastIndexedAt)}
          </p>
          {diagnostics.status.sanitizedLastError && (
            <p className="mt-2 text-sm text-rose-200" role="alert">
              {diagnostics.status.sanitizedLastError}
            </p>
          )}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form
              aria-label="Test Zendesk search"
              onSubmit={(event) => {
                event.preventDefault();
                const query = String(new FormData(event.currentTarget).get("query"));
                onSearch(query);
              }}
            >
              <label className="text-sm">
                Sanitized test search
                <input className={`${input} mt-1`} name="query" minLength={2} maxLength={200} required />
              </label>
              <button className={`${button} mt-2`} disabled={busy}>Run test search</button>
              <p className="mt-2 text-xs text-slate-500">
                Only counts, duration, and trace ID are returned.
              </p>
              {searchResult && (
                <p className="mt-3 text-sm text-emerald-200" role="status" aria-live="polite">
                  {searchResult}
                </p>
              )}
            </form>
            <div>
              {canSync && diagnostics.operations.incrementalSync.available ? (
                <ActionButton
                  label="Run incremental sync"
                  busy={busy}
                  confirm="Run a bounded incremental Zendesk synchronization?"
                  onClick={onSync}
                />
              ) : (
                <p className="text-sm text-slate-400">
                  Incremental sync unavailable:{" "}
                  {canSync
                    ? diagnostics.operations.incrementalSync.reason
                    : "Administrator permission is required."}
                </p>
              )}
              <p className="mt-3 text-sm text-slate-400">
                Full sync: unavailable — {diagnostics.operations.fullSync.reason}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Index rebuild: unavailable — {diagnostics.operations.rebuildIndex.reason}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
