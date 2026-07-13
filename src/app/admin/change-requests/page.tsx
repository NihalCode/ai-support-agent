"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { ChangesSection } from "@/components/admin/sections/ChangesSection";

function ChangeRequestsContent() {
  return (
    <AdminPageLayout
      title="Change requests"
      description="Review, approve, deploy, and roll back versioned configuration changes."
    >
      <ChangesSection />
    </AdminPageLayout>
  );
}

export default function ChangeRequestsPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <ChangeRequestsContent />
      </Suspense>
    </AdminShellPage>
  );
}
