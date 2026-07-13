"use client";

import { useState } from "react";

import { AdminActionButton } from "@/components/admin/AdminButtons";
import { useAdminContext } from "@/components/admin/AdminContextProvider";
import {
  AdminMetric,
  AdminMetricGrid,
  AdminPanel,
  AdminStatusBadge,
} from "@/components/admin/primitives";
import { adminButton, adminInput } from "@/components/admin/tokens";
import { formatAdminDate } from "@/lib/admin/control-plane-client";

function statusText(value: boolean, positive: string, negative: string) {
  return value ? positive : negative;
}

export function ZendeskSection() {
  const { data, busy, can, runAction, mutate } = useAdminContext();
  const diagnostics = data.diagnostics;
  const [searchResult, setSearchResult] = useState<string | null>(null);

  return (
    <AdminPanel
      id="zendesk"
      title="Zendesk diagnostics"
      description="Sanitized connection, sync, and indexing metadata for the Support Agent knowledge pipeline."
    >
      {!diagnostics ? (
        <p className="mt-3 text-sm text-slate-400">Diagnostics are unavailable.</p>
      ) : (
        <>
          <AdminMetricGrid>
            <AdminMetric
              label="Connection"
              value={statusText(
                diagnostics.status.connected,
                "Connected",
                "Not connected"
              )}
            />
            <AdminMetric
              label="Authorization"
              value={statusText(
                diagnostics.status.authorized,
                "Authorized",
                "Not authorized"
              )}
            />
            <AdminMetric label="Sync state" value={diagnostics.status.syncState} />
            <AdminMetric label="Freshness" value={diagnostics.status.freshness} />
            <AdminMetric
              label="Tickets stored"
              value={String(diagnostics.status.ticketsStored)}
            />
            <AdminMetric
              label="Tickets indexed"
              value={String(diagnostics.status.ticketsIndexed)}
            />
            <AdminMetric
              label="Comments indexed"
              value={String(diagnostics.status.commentsIndexed)}
            />
            <AdminMetric
              label="Index lag"
              value={
                diagnostics.status.lagSeconds == null
                  ? "Unknown"
                  : `${diagnostics.status.lagSeconds}s`
              }
            />
          </AdminMetricGrid>
          <h3 className="mt-5 font-semibold">Synchronization stages</h3>
          <ol className="mt-2 grid gap-2 md:grid-cols-3">
            {diagnostics.stages.map((stage) => (
              <li key={stage.id} className="rounded-lg border border-slate-700 p-3 text-sm">
                <AdminStatusBadge value={stage.state} />{" "}
                <span className="ml-1">{stage.label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-slate-400">
            Last sync: {formatAdminDate(diagnostics.status.lastSuccessfulSyncAt)} · Last
            index: {formatAdminDate(diagnostics.status.lastIndexedAt)}
          </p>
          {diagnostics.status.sanitizedLastError && (
            <p className="mt-2 text-sm text-rose-200" role="alert">
              {diagnostics.status.sanitizedLastError}
            </p>
          )}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form
              aria-label="Test Zendesk search"
              onSubmit={(event) => {
                event.preventDefault();
                const query = String(new FormData(event.currentTarget).get("query"));
                void runAction("Zendesk test search", async () => {
                  const result = await mutate<{
                    result: {
                      resultCount: number;
                      indexedResultCount: number;
                      durationMs: number;
                      traceId: string;
                    };
                  }>("zendesk/test-search", { query });
                  setSearchResult(
                    `Search returned ${result.result.resultCount} sanitized matches (${result.result.indexedResultCount} indexed) in ${result.result.durationMs} ms. Trace ${result.result.traceId}.`
                  );
                });
              }}
            >
              <label className="text-sm">
                Sanitized test search
                <input
                  className={`${adminInput} mt-1`}
                  name="query"
                  minLength={2}
                  maxLength={200}
                  required
                />
              </label>
              <button type="submit" className={`${adminButton} mt-2`} disabled={busy}>
                Run test search
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Only counts, duration, and trace ID are returned.
              </p>
              {searchResult && (
                <p className="mt-3 text-sm text-emerald-200" role="status" aria-live="polite">
                  {searchResult}
                </p>
              )}
            </form>
            <div>
              {can("jobs.manage") && diagnostics.operations.incrementalSync.available ? (
                <AdminActionButton
                  label="Run incremental sync"
                  busy={busy}
                  confirm="Run a bounded incremental Zendesk synchronization?"
                  onClick={() =>
                    runAction("Zendesk incremental sync", async () => {
                      await mutate("zendesk/incremental-sync", {});
                    })
                  }
                />
              ) : (
                <p className="text-sm text-slate-400">
                  Incremental sync unavailable:{" "}
                  {can("jobs.manage")
                    ? diagnostics.operations.incrementalSync.reason
                    : "Administrator permission is required."}
                </p>
              )}
              <p className="mt-3 text-sm text-slate-400">
                Full sync: unavailable — {diagnostics.operations.fullSync.reason}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Index rebuild: unavailable — {diagnostics.operations.rebuildIndex.reason}
              </p>
            </div>
          </div>
        </>
      )}
    </AdminPanel>
  );
}
