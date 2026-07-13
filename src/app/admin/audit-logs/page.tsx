"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { AuditSection } from "@/components/admin/sections/AuditSection";

function AuditLogsContent() {
  return (
    <AdminPageLayout
      title="Audit logs"
      description="Immutable, tenant-scoped audit timeline with redacted details."
    >
      <AuditSection />
    </AdminPageLayout>
  );
}

export default function AuditLogsPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <AuditLogsContent />
      </Suspense>
    </AdminShellPage>
  );
}
