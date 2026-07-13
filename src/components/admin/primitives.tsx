"use client";

import type { ReactNode } from "react";

import { adminPanel } from "@/components/admin/tokens";

export function AdminPanel({
  id,
  title,
  description,
  actions,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-heading` : undefined}
      className={`${adminPanel} ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id={id ? `${id}-heading` : undefined}
            className="text-xl font-semibold text-slate-100"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function AdminMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-2 break-all font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

export function AdminMetricGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
  );
}

export function AdminStatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100">
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function AdminPageHeader({
  eyebrow = "Enterprise control plane",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-800 pb-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">
        {eyebrow}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          {description && (
            <p className="mt-2 max-w-3xl text-slate-300">{description}</p>
          )}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function AdminNotice({
  message,
  variant = "info",
}: {
  message: string;
  variant?: "info" | "success" | "warning" | "error";
}) {
  const colors = {
    info: "text-slate-400",
    success: "text-emerald-300",
    warning: "text-amber-200",
    error: "text-rose-200",
  };
  return (
    <p
      className={`mt-4 text-sm ${colors[variant]}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

export function AdminEmptyState({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-500">
      {message}
    </p>
  );
}

export function AdminPlaceholderBanner({
  title = "Preview data",
  detail,
}: {
  title?: string;
  detail: string;
}) {
  return (
    <div
      className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      role="note"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-amber-200/90">{detail}</p>
    </div>
  );
}

export function AdminFilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">{children}</div>
  );
}

export function AdminFilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-[140px] flex-col gap-1 text-xs text-slate-400">
      {label}
      {children}
    </label>
  );
}

export function AdminTable({
  caption,
  columns,
  children,
  minWidth = 640,
}: {
  caption: string;
  columns: string[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table
        className="w-full text-left text-sm"
        style={{ minWidth }}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-slate-700 text-slate-400">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="p-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export {
  AdminButton,
  AdminDangerButton,
  AdminGhostButton,
} from "@/components/admin/AdminButtons";
