"use client";

import { useMemo, useState } from "react";

import { AdminActionButton } from "@/components/admin/AdminButtons";
import { useAdminContext } from "@/components/admin/AdminContextProvider";
import {
  AdminEmptyState,
  AdminMetric,
  AdminMetricGrid,
  AdminPanel,
  AdminStatusBadge,
} from "@/components/admin/primitives";
import { adminButton, adminInput } from "@/components/admin/tokens";
import {
  formatAdminDate,
  type ControlPlaneResource,
  type ControlPlaneVersion,
} from "@/lib/admin/control-plane-client";

export function SecurityContextPanel() {
  const { context, data } = useAdminContext();
  if (!context) return null;

  return (
    <AdminPanel
      id="overview"
      title="Overview and security context"
      description="The server layout and every API authorize independently. Client capability checks only hide unavailable affordances."
    >
      <AdminMetricGrid>
        <AdminMetric label="Organization" value={context.organization.id} />
        <AdminMetric label="Role" value={context.role} />
        <AdminMetric
          label="Recent MFA"
          value={
            context.assurance.mfaVerified
              ? "Verified"
              : "Required for sensitive actions"
          }
        />
        <AdminMetric
          label="Configured resources"
          value={String(data.resources.length)}
        />
      </AdminMetricGrid>
    </AdminPanel>
  );
}

export function ResourcesSection({
  filterType,
  filterEnvironment,
}: {
  filterType?: string;
  filterEnvironment?: string;
}) {
  const { context, data, busy, can, runAction, mutate } = useAdminContext();
  const [versions, setVersions] = useState<Record<string, ControlPlaneVersion[]>>({});

  const filtered = useMemo(() => {
    return data.resources.filter((resource) => {
      if (filterType && resource.resourceType !== filterType) return false;
      if (filterEnvironment && resource.environment !== filterEnvironment) return false;
      return true;
    });
  }, [data.resources, filterEnvironment, filterType]);

  const byEnvironment = useMemo(
    () =>
      (["development", "staging", "production"] as const).map((environment) => ({
        environment,
        resources: filtered.filter((resource) => resource.environment === environment),
      })),
    [filtered]
  );

  async function loadVersions(resourceId: string) {
    try {
      const result = await fetch(
        `/api/admin/control-plane/resources/${resourceId}/versions`,
        { cache: "no-store" }
      ).then((response) => response.json());
      setVersions((current) => ({
        ...current,
        [resourceId]: result.versions ?? [],
      }));
    } catch {
      /* version history optional */
    }
  }

  if (!context) return null;

  return (
    <AdminPanel
      id="resources"
      title="API and configuration resources"
      description="Resource categories support APIs, integrations, webhooks, domains, and rate limits without storing secret values in dashboard payloads."
    >
      {can("resources.write") && (
        <ResourceForm
          busy={busy}
          allowProduction={
            can("resources.write_production") && context.assurance.mfaVerified
          }
          defaultType={filterType}
          defaultEnvironment={filterEnvironment}
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
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  busy={busy}
                  canCreateChange={can("changes.create")}
                  versions={versions[resource.id]}
                  onLoadVersions={() => void loadVersions(resource.id)}
                  onCreateDraft={(configuration, summary) =>
                    runAction("Create draft", async () => {
                      await mutate(`resources/${resource.id}/changes`, {
                        configuration,
                        summary,
                      });
                    })
                  }
                />
              ))}
              {items.length === 0 && (
                <li className="text-sm text-slate-500">No resources configured.</li>
              )}
            </ul>
          </section>
        ))}
      </div>
      {filtered.length === 0 && (
        <AdminEmptyState message="No resources match the current filters." />
      )}
    </AdminPanel>
  );
}

function ResourceCard({
  resource,
  busy,
  canCreateChange,
  versions,
  onLoadVersions,
  onCreateDraft,
}: {
  resource: ControlPlaneResource;
  busy: boolean;
  canCreateChange: boolean;
  versions?: ControlPlaneVersion[];
  onLoadVersions: () => void;
  onCreateDraft: (
    configuration: Record<string, unknown>,
    summary: string
  ) => void;
}) {
  return (
    <li className="rounded-lg border border-slate-800 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{resource.name}</p>
          <p className="text-xs text-slate-400">{resource.resourceType}</p>
        </div>
        <span className="text-xs text-slate-400">v{resource.version}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Active: {resource.activeVersionId ? "Yes" : "No"} · Updated{" "}
        {formatAdminDate(resource.updatedAt)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={adminButton} onClick={onLoadVersions}>
          Version history
        </button>
        {canCreateChange && (
          <DraftChangeButton
            resource={resource}
            busy={busy}
            onCreate={onCreateDraft}
          />
        )}
      </div>
      {versions && <VersionHistory versions={versions} />}
    </li>
  );
}

function ResourceForm({
  busy,
  allowProduction,
  defaultType,
  defaultEnvironment,
  onSubmit,
}: {
  busy: boolean;
  allowProduction: boolean;
  defaultType?: string;
  defaultEnvironment?: string;
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
      <label className="text-sm">
        Name
        <input className={`${adminInput} mt-1`} name="name" required maxLength={200} />
      </label>
      <label className="text-sm">
        Category
        <select
          className={`${adminInput} mt-1`}
          name="resourceType"
          defaultValue={defaultType ?? "api"}
        >
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
        <select
          className={`${adminInput} mt-1`}
          name="environment"
          defaultValue={defaultEnvironment ?? "development"}
        >
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          {allowProduction && <option value="production">Production</option>}
        </select>
      </label>
      <label className="text-sm">
        Summary
        <input className={`${adminInput} mt-1`} name="summary" required maxLength={1000} />
      </label>
      <label className="text-sm md:col-span-2">
        Configuration JSON
        <textarea
          className={`${adminInput} mt-1 min-h-28 font-mono`}
          name="configuration"
          defaultValue={'{\n  "enabled": true\n}'}
          onInput={(event) => event.currentTarget.setCustomValidity("")}
          required
        />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className={adminButton} disabled={busy}>
          Create draft resource
        </button>
      </div>
    </form>
  );
}

function DraftChangeButton({
  resource,
  busy,
  onCreate,
}: {
  resource: ControlPlaneResource;
  busy: boolean;
  onCreate: (configuration: Record<string, unknown>, summary: string) => void;
}) {
  return (
    <button
      type="button"
      className={adminButton}
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

function VersionHistory({ versions }: { versions: ControlPlaneVersion[] }) {
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <h4 className="text-sm font-semibold">Sanitized version history</h4>
      <ol className="mt-2 space-y-2">
        {versions.map((version) => (
          <li key={version.id} className="text-xs text-slate-300">
            <div>
              v{version.versionNumber} · {version.approvalStatus} ·{" "}
              {formatAdminDate(version.createdAt)}
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

export { AdminStatusBadge };
