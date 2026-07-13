"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileKey2,
  LayoutDashboard,
  Menu,
  Shield,
  Settings2,
  LifeBuoy,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AdminContextProvider, useAdminContextOptional } from "@/components/admin/AdminContextProvider";
import { ProductionBanner } from "@/components/admin/ProductionBanner";
import {
  adminNavLink,
  adminNavLinkActive,
  adminShellBg,
} from "@/components/admin/tokens";
import { filterNavGroups, type AdminNavGroup } from "@/lib/admin/navigation";
import { productConfig } from "@/lib/product-config";

const GROUP_ICONS: Record<string, ReactNode> = {
  overview: <LayoutDashboard className="h-4 w-4 shrink-0 opacity-80" aria-hidden />,
  "documentation-agent": <BookOpen className="h-4 w-4 shrink-0 opacity-80" aria-hidden />,
  "support-agent": <LifeBuoy className="h-4 w-4 shrink-0 opacity-80" aria-hidden />,
  "shared-config": <Settings2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />,
  security: <Shield className="h-4 w-4 shrink-0 opacity-80" aria-hidden />,
};

function NavGroups({ groups, onNavigate }: { groups: AdminNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration" className="space-y-6">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={active ? adminNavLinkActive : adminNavLink}
                    aria-current={active ? "page" : undefined}
                  >
                    {GROUP_ICONS[group.id]}
                    <span className="truncate">{item.label}</span>
                    {item.placeholder && (
                      <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                        Preview
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function AdminShellInner({
  children,
  sidebarFooter,
}: {
  children: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  const admin = useAdminContextOptional();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navGroups = useMemo(
    () => filterNavGroups(admin?.context?.capabilities ?? ["admin_dashboard.access"]),
    [admin?.context?.capabilities]
  );

  const sidebar = (
    <aside
      className={`flex h-full flex-col border-r border-slate-800 bg-[#0b0f17] ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
      aria-label="Admin sidebar"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-4">
        {!collapsed ? (
          <Link
            href="/"
            className="min-w-0 flex items-center gap-3 rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-violet-400/40"
            data-testid="admin-back-to-workspace"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-[0_0_24px_rgba(139,92,246,0.28)]">
              <Sparkles className="h-4 w-4 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{productConfig.appName}</p>
              <p className="text-xs text-slate-400">Administration</p>
            </div>
          </Link>
        ) : (
          <Link
            href="/"
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400"
            aria-label={`Back to ${productConfig.appName}`}
            data-testid="admin-back-to-workspace"
          >
            <Sparkles className="h-4 w-4 text-white" aria-hidden />
          </Link>
        )}
        <button
          type="button"
          className="hidden rounded-lg border border-slate-700 p-1.5 text-slate-300 lg:inline-flex"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-700 p-1.5 text-slate-300 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && (
        <Link
          href="/"
          className="mx-4 mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Back to workspace
        </Link>
      )}

      <div className={`flex-1 overflow-y-auto py-4 ${collapsed ? "hidden" : "block"}`}>
        <NavGroups groups={navGroups} onNavigate={() => setMobileOpen(false)} />
      </div>

      {collapsed && (
        <div className="flex flex-1 flex-col items-center gap-3 py-4">
          <FileKey2 className="h-5 w-5 text-slate-500" aria-hidden />
        </div>
      )}

      {sidebarFooter && !collapsed && (
        <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
          {sidebarFooter}
        </div>
      )}
    </aside>
  );

  return (
    <div className={`${adminShellBg} flex min-h-screen flex-col`}>
      <ProductionBanner />
      <div className="flex flex-1">
        <div className="hidden lg:block">{sidebar}</div>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Close navigation overlay"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-10 h-full">{sidebar}</div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3 lg:hidden">
            <button
              type="button"
              className="rounded-lg border border-slate-700 p-2 text-slate-200"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-slate-200">Administration</span>
          </div>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({
  children,
}: {
  children: ReactNode;
  /** @deprecated Control plane context is always provided; flag ignored. */
  withControlPlane?: boolean;
}) {
  return (
    <AdminContextProvider>
      <AdminShellInner sidebarFooter={<AdminSidebarFooter />}>
        {children}
      </AdminShellInner>
    </AdminContextProvider>
  );
}

function AdminSidebarFooter() {
  const admin = useAdminContextOptional();
  if (!admin?.context) return <span>Loading session…</span>;
  return (
    <>
      <p className="truncate font-mono text-[11px] text-slate-400">
        Org {admin.context.organization.id}
      </p>
      <p className="mt-1 capitalize text-slate-500">Role: {admin.context.role}</p>
    </>
  );
}

export function AdminPageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl">{children}</div>;
}

export function AdminLoadingState({ title }: { title: string }) {
  return (
    <AdminShell>
      <AdminPageContainer>
        <div role="status" aria-live="polite">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="mt-4 text-slate-300">Loading protected control-plane data…</p>
        </div>
      </AdminPageContainer>
    </AdminShell>
  );
}
