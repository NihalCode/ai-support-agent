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

function SupportAgentOverviewContent() {
  const { data } = useAdminContext();

  return (
    <AdminPageLayout
      title="Support Agent"
      description="Configuration, integrations, and credentials for the AI Support Agent product."
    >
      <SecurityContextPanel />
      <AdminPanel
        className="mt-6"
        title="Support Agent summary"
        description="Operational counts for support-specific resources."
      >
        <AdminMetricGrid>
          <AdminMetric
            label="API resources"
            value={String(data.resources.filter((r) => r.resourceType === "api").length)}
          />
          <AdminMetric
            label="Integrations"
            value={String(
              data.resources.filter((r) => r.resourceType === "integration").length
            )}
          />
          <AdminMetric
            label="Zendesk indexed"
            value={String(data.diagnostics?.status.ticketsIndexed ?? 0)}
          />
          <AdminMetric label="Credentials" value={String(data.credentials.length)} />
        </AdminMetricGrid>
      </AdminPanel>
      <AdminPanel className="mt-6" title="Support Agent areas">
        <AdminQuickLinks
          links={[
            {
              href: "/admin/support-agent/apis",
              label: "APIs",
              description: "Support API resources, versions, and drafts.",
            },
            {
              href: "/admin/support-agent/integrations",
              label: "Integrations",
              description: "Zendesk diagnostics, sync, and test search.",
            },
            {
              href: "/admin/support-agent/keys",
              label: "API keys",
              description: "Issue, rotate, and revoke support credentials.",
            },
          ]}
        />
      </AdminPanel>
    </AdminPageLayout>
  );
}

export default function SupportAgentOverviewPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SupportAgentOverviewContent />
      </Suspense>
    </AdminShellPage>
  );
}
