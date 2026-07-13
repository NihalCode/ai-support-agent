"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminQuickLinks,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { SecurityContextPanel } from "@/components/admin/sections/ResourcesSection";
import { AdminMetric, AdminMetricGrid, AdminPanel } from "@/components/admin/primitives";
import { useAdminContext } from "@/components/admin/AdminContextProvider";

function AdminOverviewContent() {
  const { data, context } = useAdminContext();
  const pendingChanges = data.changes.filter((c) =>
    ["DRAFT", "PENDING_REVIEW", "APPROVED", "SCHEDULED", "DEPLOYING"].includes(c.state)
  ).length;

  return (
    <AdminPageLayout
      title="Administration"
      description="Tenant-scoped configuration, approvals, credentials, integrations, and immutable audit history for Cyware AI agents."
    >
      <SecurityContextPanel />
      {context && (
        <AdminPanel
          className="mt-6"
          title="Operational summary"
          description="High-level counts across the shared control plane."
        >
          <AdminMetricGrid>
            <AdminMetric label="Resources" value={String(data.resources.length)} />
            <AdminMetric label="Open changes" value={String(pendingChanges)} />
            <AdminMetric label="Credentials" value={String(data.credentials.length)} />
            <AdminMetric
              label="Zendesk sync"
              value={data.diagnostics?.status.syncState ?? "Unknown"}
            />
          </AdminMetricGrid>
        </AdminPanel>
      )}
      <AdminPanel
        className="mt-6"
        title="Quick navigation"
        description="Jump to product-specific or shared configuration areas."
      >
        <AdminQuickLinks
          links={[
            {
              href: "/admin/support-agent/apis",
              label: "Support Agent APIs",
              description: "Manage support integration resources and versions.",
            },
            {
              href: "/admin/change-requests",
              label: "Change requests",
              description: "Review, approve, and deploy configuration changes.",
            },
            {
              href: "/admin/audit-logs",
              label: "Audit logs",
              description: "Immutable tenant-scoped event timeline.",
            },
            {
              href: "/admin/documentation-agent",
              label: "Documentation Agent",
              description: "Preview documentation agent administration (placeholder).",
            },
          ]}
        />
      </AdminPanel>
    </AdminPageLayout>
  );
}

export default function AdminOverviewPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <AdminOverviewContent />
      </Suspense>
    </AdminShellPage>
  );
}
