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
import { SECURITY_PLACEHOLDER } from "@/lib/admin/placeholder-data";

function SecurityRolesContent() {
  return (
    <AdminPageLayout
      title="Roles"
      description="Enterprise role assignments and effective permissions."
      requireContext={false}
    >
      <AdminPlaceholderBanner detail="PLACEHOLDER: Role management requires Auth0 Organizations and membership APIs. Display-only preview until backend is wired." />
      <AdminTable
        caption="Enterprise roles"
        columns={["Role", "Members", "Effective permissions"]}
      >
        {SECURITY_PLACEHOLDER.roles.map((role) => (
          <tr key={role.id} className="border-b border-slate-800">
            <td className="p-2 font-medium">{role.name}</td>
            <td className="p-2">{role.members}</td>
            <td className="p-2 text-slate-300">{role.permissions}</td>
          </tr>
        ))}
      </AdminTable>
    </AdminPageLayout>
  );
}

export default function SecurityRolesPage() {
  return (
    <AdminShellPage withControlPlane={false}>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SecurityRolesContent />
      </Suspense>
    </AdminShellPage>
  );
}
