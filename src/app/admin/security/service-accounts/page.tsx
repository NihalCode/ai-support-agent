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
import { formatAdminDate } from "@/lib/admin/control-plane-client";
import { SECURITY_PLACEHOLDER } from "@/lib/admin/placeholder-data";

function SecurityServiceAccountsContent() {
  return (
    <AdminPageLayout
      title="Service accounts"
      description="Non-interactive principals for deployment workers and automation."
      requireContext={false}
    >
      <AdminPlaceholderBanner detail="PLACEHOLDER: Service account lifecycle will use control-plane credentials with automation scopes when backend is available." />
      <AdminTable
        caption="Service accounts"
        columns={["Name", "Scopes", "Last used"]}
      >
        {SECURITY_PLACEHOLDER.serviceAccounts.map((account) => (
          <tr key={account.id} className="border-b border-slate-800">
            <td className="p-2">{account.name}</td>
            <td className="p-2 font-mono text-xs">{account.scopes.join(", ")}</td>
            <td className="p-2">{formatAdminDate(account.lastUsed)}</td>
          </tr>
        ))}
      </AdminTable>
    </AdminPageLayout>
  );
}

export default function SecurityServiceAccountsPage() {
  return (
    <AdminShellPage withControlPlane={false}>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SecurityServiceAccountsContent />
      </Suspense>
    </AdminShellPage>
  );
}
