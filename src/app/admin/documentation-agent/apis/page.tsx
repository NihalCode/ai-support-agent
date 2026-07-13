"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import {
  AdminPlaceholderBanner,
  AdminStatusBadge,
  AdminTable,
} from "@/components/admin/primitives";
import { formatAdminDate } from "@/lib/admin/control-plane-client";
import { DOCUMENTATION_AGENT_PLACEHOLDER } from "@/lib/admin/placeholder-data";

function DocumentationAgentApisContent() {
  return (
    <AdminPageLayout
      title="Documentation Agent APIs"
      description="API registry and deployment configuration for the documentation agent product."
      requireContext={false}
    >
      <AdminPlaceholderBanner detail="PLACEHOLDER: Wire to control-plane resources filtered by product=documentation-agent when backend is available." />
      <AdminTable
        caption="Documentation agent API resources"
        columns={["Name", "Environment", "Status", "Updated"]}
      >
        {DOCUMENTATION_AGENT_PLACEHOLDER.apis.map((api) => (
          <tr key={api.id} className="border-b border-slate-800">
            <td className="p-2">{api.name}</td>
            <td className="p-2 capitalize">{api.environment}</td>
            <td className="p-2">
              <AdminStatusBadge value={api.status} />
            </td>
            <td className="p-2">{formatAdminDate(api.updatedAt)}</td>
          </tr>
        ))}
      </AdminTable>
    </AdminPageLayout>
  );
}

export default function DocumentationAgentApisPage() {
  return (
    <AdminShellPage withControlPlane={false}>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <DocumentationAgentApisContent />
      </Suspense>
    </AdminShellPage>
  );
}
