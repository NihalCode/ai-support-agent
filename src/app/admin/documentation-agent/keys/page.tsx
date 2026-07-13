"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import {
  AdminPlaceholderBanner,
  AdminTable,
} from "@/components/admin/primitives";
import { DOCUMENTATION_AGENT_PLACEHOLDER } from "@/lib/admin/placeholder-data";

function DocumentationAgentKeysContent() {
  return (
    <AdminPageLayout
      title="Documentation Agent API keys"
      description="Credential metadata for documentation automation. Secrets are never stored in the dashboard."
      requireContext={false}
    >
      <AdminPlaceholderBanner detail="PLACEHOLDER: Issue and rotate keys via control-plane credentials scoped to documentation-agent when backend is wired." />
      <AdminTable
        caption="Documentation agent API key metadata"
        columns={["Name", "Environment", "Last four", "Status"]}
      >
        {DOCUMENTATION_AGENT_PLACEHOLDER.keys.map((key) => (
          <tr key={key.id} className="border-b border-slate-800">
            <td className="p-2">{key.name}</td>
            <td className="p-2 capitalize">{key.environment}</td>
            <td className="p-2 font-mono">••••{key.last4}</td>
            <td className="p-2">{key.status}</td>
          </tr>
        ))}
      </AdminTable>
    </AdminPageLayout>
  );
}

export default function DocumentationAgentKeysPage() {
  return (
    <AdminShellPage withControlPlane={false}>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <DocumentationAgentKeysContent />
      </Suspense>
    </AdminShellPage>
  );
}
