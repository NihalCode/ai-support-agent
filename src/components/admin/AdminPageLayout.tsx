"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AdminButton } from "@/components/admin/AdminButtons";
import {
  useAdminContext,
  useAdminContextOptional,
} from "@/components/admin/AdminContextProvider";
import {
  AdminNotice,
  AdminPageHeader,
} from "@/components/admin/primitives";
import {
  AdminPageContainer,
  AdminShell,
} from "@/components/admin/AdminShell";

export function AdminPageLayout({
  title,
  description,
  children,
  actions,
  requireContext = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  requireContext?: boolean;
}) {
  const admin = useAdminContextOptional();

  if (requireContext) {
    if (!admin) {
      throw new Error("AdminPageLayout requires AdminContextProvider");
    }
    if (!admin.context) {
      return (
        <>
          <AdminPageHeader title={title} description={description} />
          <AdminNotice message={admin.notice} />
        </>
      );
    }
  }

  return (
    <>
      <AdminPageHeader
        title={title}
        description={description}
        actions={
          actions ??
          (admin ? (
            <AdminButton disabled={admin.busy} onClick={() => void admin.refresh()}>
              Refresh data
            </AdminButton>
          ) : undefined)
        }
      />
      {admin && <AdminNotice message={admin.notice} />}
      {children}
    </>
  );
}

export function AdminQuickLinks({
  links,
}: {
  links: Array<{ href: string; label: string; description: string }>;
}) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 outline-none transition hover:border-violet-400/40 hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <p className="font-semibold text-slate-100">{link.label}</p>
          <p className="mt-1 text-sm text-slate-400">{link.description}</p>
        </Link>
      ))}
    </div>
  );
}

export function AdminShellPage({
  children,
  withControlPlane = true,
}: {
  children: ReactNode;
  withControlPlane?: boolean;
}) {
  return (
    <AdminShell withControlPlane={withControlPlane}>
      <AdminPageContainer>{children}</AdminPageContainer>
    </AdminShell>
  );
}
