"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { CredentialsSection } from "@/components/admin/sections/CredentialsSection";

function SupportAgentKeysContent() {
  return (
    <AdminPageLayout
      title="Support Agent API keys"
      description="Issue, rotate, and revoke credentials. Plaintext secrets are shown exactly once."
    >
      <CredentialsSection productLabel="Support Agent" />
    </AdminPageLayout>
  );
}

export default function SupportAgentKeysPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SupportAgentKeysContent />
      </Suspense>
    </AdminShellPage>
  );
}
