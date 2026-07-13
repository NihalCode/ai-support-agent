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

function DocumentationAgentIntegrationsContent() {
  return (
    <AdminPageLayout
      title="Documentation Agent integrations"
      description="Content ingestion, vector retrieval, and publishing integrations."
      requireContext={false}
    >
      <AdminPlaceholderBanner detail="PLACEHOLDER: Connect to documentation-agent integration health endpoints when implemented." />
      <AdminTable
        caption="Documentation agent integrations"
        columns={["Integration", "Status", "Last sync"]}
      >
        {DOCUMENTATION_AGENT_PLACEHOLDER.integrations.map((item) => (
          <tr key={item.id} className="border-b border-slate-800">
            <td className="p-2">{item.name}</td>
            <td className="p-2">
              <AdminStatusBadge value={item.status} />
            </td>
            <td className="p-2">{formatAdminDate(item.lastSync)}</td>
          </tr>
        ))}
      </AdminTable>
    </AdminPageLayout>
  );
}

export default function DocumentationAgentIntegrationsPage() {
  return (
    <AdminShellPage withControlPlane={false}>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <DocumentationAgentIntegrationsContent />
      </Suspense>
    </AdminShellPage>
  );
}
