"use client";

import { Suspense, useMemo } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import {
  AdminEmptyState,
  AdminPlaceholderBanner,
  AdminStatusBadge,
  AdminTable,
} from "@/components/admin/primitives";
import { useAdminContext } from "@/components/admin/AdminContextProvider";
import { RATE_LIMITS_PLACEHOLDER } from "@/lib/admin/placeholder-data";

function RateLimitsContent() {
  const { data } = useAdminContext();

  const apiResources = useMemo(
    () => data.resources.filter((resource) => resource.resourceType === "rate_limit"),
    [data.resources]
  );

  const hasLiveData = apiResources.length > 0;

  return (
    <AdminPageLayout
      title="Rate limits"
      description="Mutation and search rate policies scoped to your organization."
    >
      {!hasLiveData && (
        <AdminPlaceholderBanner
          detail="PLACEHOLDER: Showing sample policies until rate_limit resources exist in the control plane. Live resources appear automatically when configured."
        />
      )}
      <AdminTable
        caption="Rate limit policies"
        columns={["Name", "Limit", "Environment", "Source"]}
      >
        {(hasLiveData ? apiResources : RATE_LIMITS_PLACEHOLDER).map((item) => (
          <tr key={item.id} className="border-b border-slate-800">
            <td className="p-2">{item.name}</td>
            <td className="p-2">
              {"limit" in item ? item.limit : "Configured in resource body"}
            </td>
            <td className="p-2 capitalize">{item.environment}</td>
            <td className="p-2">
              <AdminStatusBadge value={hasLiveData ? "Live" : "Preview"} />
            </td>
          </tr>
        ))}
      </AdminTable>
      {hasLiveData && apiResources.length === 0 && (
        <AdminEmptyState message="No rate limit resources configured." />
      )}
    </AdminPageLayout>
  );
}

export default function RateLimitsPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <RateLimitsContent />
      </Suspense>
    </AdminShellPage>
  );
}
