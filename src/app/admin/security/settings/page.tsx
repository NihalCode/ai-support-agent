"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { AdminPlaceholderBanner, AdminPanel } from "@/components/admin/primitives";
import { adminInput } from "@/components/admin/tokens";
import { SECURITY_PLACEHOLDER } from "@/lib/admin/placeholder-data";

function SecuritySettingsContent() {
  const settings = SECURITY_PLACEHOLDER.settings;

  return (
    <AdminPageLayout
      title="Security settings"
      description="Organization-wide authentication and access policies."
      requireContext={false}
    >
      <AdminPlaceholderBanner detail="PLACEHOLDER: Mutations require security_settings.manage and recent MFA once settings API is connected." />
      <AdminPanel title="Authentication policy">
        <form className="mt-4 grid max-w-xl gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              defaultChecked={settings.mfaRequiredForProduction}
              disabled
              aria-label="Require MFA for production changes"
            />
            Require MFA for production and credential operations
          </label>
          <label className="text-sm text-slate-300">
            Session timeout (minutes)
            <input
              className={`${adminInput} mt-1`}
              type="number"
              defaultValue={settings.sessionTimeoutMinutes}
              disabled
              aria-label="Session timeout minutes"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              defaultChecked={settings.ipAllowlistEnabled}
              disabled
              aria-label="Enable IP allowlist"
            />
            Enable IP allowlist (not yet available)
          </label>
        </form>
      </AdminPanel>
    </AdminPageLayout>
  );
}

export default function SecuritySettingsPage() {
  return (
    <AdminShellPage withControlPlane={false}>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SecuritySettingsContent />
      </Suspense>
    </AdminShellPage>
  );
}
