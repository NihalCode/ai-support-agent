"use client";

import { Suspense } from "react";

import { useAdminContext } from "@/components/admin/AdminContextProvider";
import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { AdminMetric, AdminMetricGrid, AdminPanel, AdminFilterBar, AdminFilterField } from "@/components/admin/primitives";
import { adminInput } from "@/components/admin/tokens";
import { formatAdminDate } from "@/lib/admin/control-plane-client";
import { useAdminUrlState } from "@/lib/admin/use-admin-url-state";

function EnvironmentsContent() {
  const { data } = useAdminContext();
  const { values, setValues } = useAdminUrlState(["environment"]);

  const environments = (["development", "staging", "production"] as const).map(
    (environment) => ({
      environment,
      resources: data.resources.filter((resource) => {
        if (values.environment && resource.environment !== values.environment) {
          return false;
        }
        return resource.environment === environment;
      }),
    })
  );

  const visible = values.environment
    ? environments.filter((entry) => entry.environment === values.environment)
    : environments;

  return (
    <AdminPageLayout
      title="Environments"
      description="Resources grouped by deployment environment. Production writes require MFA and change approval."
    >
      <AdminFilterBar>
        <AdminFilterField label="Environment">
          <select
            aria-label="Environment"
            className={adminInput}
            value={values.environment}
            onChange={(event) =>
              setValues({ environment: event.target.value || null })
            }
          >
            <option value="">All environments</option>
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </AdminFilterField>
      </AdminFilterBar>
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {visible.map(({ environment, resources }) => (
          <AdminPanel
            key={environment}
            title={environment}
            description={`${resources.length} resource${resources.length === 1 ? "" : "s"}`}
          >
            <ul className="mt-3 space-y-2">
              {resources.map((resource) => (
                <li
                  key={resource.id}
                  className="rounded-lg border border-slate-800 px-3 py-2 text-sm"
                >
                  <p className="font-medium">{resource.name}</p>
                  <p className="text-xs text-slate-400">
                    {resource.resourceType} · updated {formatAdminDate(resource.updatedAt)}
                  </p>
                </li>
              ))}
              {resources.length === 0 && (
                <li className="text-sm text-slate-500">No resources.</li>
              )}
            </ul>
          </AdminPanel>
        ))}
      </div>
      <AdminPanel className="mt-6" title="Environment totals">
        <AdminMetricGrid>
          {(["development", "staging", "production"] as const).map((environment) => (
            <AdminMetric
              key={environment}
              label={environment}
              value={String(
                data.resources.filter((r) => r.environment === environment).length
              )}
            />
          ))}
          <AdminMetric label="Total resources" value={String(data.resources.length)} />
        </AdminMetricGrid>
      </AdminPanel>
    </AdminPageLayout>
  );
}

export default function EnvironmentsPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <EnvironmentsContent />
      </Suspense>
    </AdminShellPage>
  );
}
