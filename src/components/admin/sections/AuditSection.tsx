"use client";

import { useMemo } from "react";

import { useAdminContext } from "@/components/admin/AdminContextProvider";
import {
  AdminEmptyState,
  AdminFilterBar,
  AdminFilterField,
  AdminPanel,
  AdminStatusBadge,
} from "@/components/admin/primitives";
import { adminInput } from "@/components/admin/tokens";
import { formatAdminDate } from "@/lib/admin/control-plane-client";
import { useAdminUrlState } from "@/lib/admin/use-admin-url-state";

import { AuditExportButton } from "@/components/admin/sections/CredentialsSection";

export function AuditSection() {
  const { data } = useAdminContext();
  const { values, setValues } = useAdminUrlState(["action", "severity"]);

  const filtered = useMemo(() => {
    return data.audit.filter((event) => {
      if (values.action && !event.action.toLowerCase().includes(values.action.toLowerCase())) {
        return false;
      }
      if (values.severity && event.severity !== values.severity) return false;
      return true;
    });
  }, [data.audit, values.action, values.severity]);

  return (
    <AdminPanel
      id="audit"
      title="Immutable audit timeline"
      description="Append-only, tenant-scoped events with redacted details."
      actions={<AuditExportButton />}
    >
      <AdminFilterBar>
        <AdminFilterField label="Action">
          <input
            aria-label="Action filter"
            className={adminInput}
            value={values.action}
            onChange={(event) => setValues({ action: event.target.value || null })}
            placeholder="resource.create…"
          />
        </AdminFilterField>
        <AdminFilterField label="Severity">
          <select
            aria-label="Severity filter"
            className={adminInput}
            value={values.severity}
            onChange={(event) => setValues({ severity: event.target.value || null })}
          >
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </AdminFilterField>
      </AdminFilterBar>
      <ol className="mt-5 space-y-3">
        {filtered.map((event) => (
          <li key={event.id} className="rounded-lg border border-slate-800 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusBadge value={`${event.outcome}: ${event.action}`} />
              <span className="text-xs uppercase text-slate-500">{event.severity}</span>
              <time className="ml-auto text-xs text-slate-400" dateTime={event.createdAt}>
                {formatAdminDate(event.createdAt)}
              </time>
            </div>
            <p className="mt-2 font-mono text-xs text-slate-400">
              {event.targetType} · actor {event.actorUserId}
            </p>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          </li>
        ))}
      </ol>
      {filtered.length === 0 && (
        <AdminEmptyState message="No audit events match the current filters." />
      )}
    </AdminPanel>
  );
}
