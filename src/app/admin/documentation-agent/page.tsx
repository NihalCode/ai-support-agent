"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminQuickLinks,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { AdminPlaceholderBanner } from "@/components/admin/primitives";

function DocumentationAgentOverviewContent() {
  return (
    <AdminPageLayout
      title="Documentation Agent"
      description="Administration for the runnable documentation and agent-planning product. Backend control-plane routes for this product are not yet connected in this repository."
      requireContext={false}
    >
      <AdminPlaceholderBanner
        detail="Routes and tables below use structured placeholder data until Documentation Agent resources are registered in the shared control plane."
      />
      <AdminQuickLinks
        links={[
          {
            href: "/admin/documentation-agent/apis",
            label: "APIs",
            description: "OpenAPI surfaces, agent endpoints, and deployment targets.",
          },
          {
            href: "/admin/documentation-agent/integrations",
            label: "Integrations",
            description: "Pinecone, Theneo, and content sync pipelines.",
          },
          {
            href: "/admin/documentation-agent/keys",
            label: "API keys",
            description: "Issuance and rotation for documentation automation.",
          },
        ]}
      />
    </AdminPageLayout>
  );
}

export default function DocumentationAgentOverviewPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <DocumentationAgentOverviewContent />
      </Suspense>
    </AdminShellPage>
  );
}
