"use client";

import { useMemo } from "react";

import { AdminActionButton } from "@/components/admin/AdminButtons";
import { useAdminContext } from "@/components/admin/AdminContextProvider";
import {
  AdminEmptyState,
  AdminFilterBar,
  AdminFilterField,
  AdminPanel,
  AdminStatusBadge,
  AdminTable,
} from "@/components/admin/primitives";
import { adminInput } from "@/components/admin/tokens";
import { formatAdminDate } from "@/lib/admin/control-plane-client";
import { useAdminUrlState } from "@/lib/admin/use-admin-url-state";

export function ChangesSection() {
  const { context, data, busy, can, runAction, mutate } = useAdminContext();
  const { values, setValues } = useAdminUrlState(["state", "q"]);

  const filtered = useMemo(() => {
    const query = values.q.trim().toLowerCase();
    return data.changes.filter((change) => {
      if (values.state && change.state !== values.state) return false;
      if (query && !change.summary.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [data.changes, values.q, values.state]);

  if (!context) return null;

  return (
    <AdminPanel
      id="changes"
      title="Change, approval, and deployment history"
      description="Production configuration changes follow draft → review → approval → deployment → active workflow."
    >
      <AdminFilterBar>
        <AdminFilterField label="State">
          <select
            aria-label="State"
            className={adminInput}
            value={values.state}
            onChange={(event) => setValues({ state: event.target.value || null })}
          >
            <option value="">All states</option>
            {[
              "DRAFT",
              "PENDING_REVIEW",
              "APPROVED",
              "SCHEDULED",
              "DEPLOYING",
              "ACTIVE",
              "REJECTED",
              "ROLLED_BACK",
            ].map((state) => (
              <option key={state} value={state}>
                {state.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </AdminFilterField>
        <AdminFilterField label="Search">
          <input
            aria-label="Search changes"
            className={adminInput}
            value={values.q}
            onChange={(event) => setValues({ q: event.target.value || null })}
            placeholder="Summary…"
          />
        </AdminFilterField>
      </AdminFilterBar>

      <AdminTable
        caption="Versioned changes with deployment and review actions"
        columns={["Summary", "State", "Requester", "Updated", "Actions"]}
        minWidth={760}
      >
        {filtered.map((change) => {
          const selfReview = change.requestedByUserId === context.actor.id;
          return (
            <tr key={change.id} className="border-b border-slate-800 align-top">
              <td className="p-2">{change.summary}</td>
              <td className="p-2">
                <AdminStatusBadge value={change.state} />
              </td>
              <td className="p-2 font-mono text-xs">{change.requestedByUserId}</td>
              <td className="p-2">{formatAdminDate(change.updatedAt)}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-2">
                  {change.state === "DRAFT" && can("changes.submit") && (
                    <AdminActionButton
                      label="Submit"
                      busy={busy}
                      onClick={() =>
                        runAction("Submit change", async () => {
                          await mutate(`changes/${change.id}/submit`, {
                            expectedVersion: change.version,
                          });
                        })
                      }
                    />
                  )}
                  {change.state === "PENDING_REVIEW" &&
                    can("changes.approve") &&
                    context.assurance.mfaVerified &&
                    !selfReview && (
                      <>
                        <AdminActionButton
                          label="Approve"
                          busy={busy}
                          confirm="Approve this change for deployment?"
                          onClick={() =>
                            runAction("Approve change", async () => {
                              await mutate(`changes/${change.id}/approve`, {
                                expectedVersion: change.version,
                                reason: "Approved in control-plane dashboard",
                              });
                            })
                          }
                        />
                        <AdminActionButton
                          label="Reject"
                          busy={busy}
                          danger
                          confirm="Reject this change?"
                          onClick={() =>
                            runAction("Reject change", async () => {
                              await mutate(`changes/${change.id}/reject`, {
                                expectedVersion: change.version,
                                reason: "Rejected in control-plane dashboard",
                              });
                            })
                          }
                        />
                      </>
                    )}
                  {change.state === "PENDING_REVIEW" && selfReview && (
                    <span className="text-xs text-amber-200">
                      Self-approval prohibited
                    </span>
                  )}
                  {["APPROVED", "SCHEDULED"].includes(change.state) &&
                    can("changes.activate") &&
                    context.assurance.mfaVerified && (
                      <AdminActionButton
                        label="Start deployment"
                        busy={busy}
                        confirm="Start deployment for this approved change?"
                        onClick={() =>
                          runAction("Start deployment", async () => {
                            await mutate(`changes/${change.id}/deploy`, {
                              expectedVersion: change.version,
                            });
                          })
                        }
                      />
                    )}
                  {change.state === "DEPLOYING" &&
                    can("changes.activate") &&
                    context.assurance.mfaVerified && (
                      <AdminActionButton
                        label="Mark active"
                        busy={busy}
                        confirm="Confirm this deployment is active?"
                        onClick={() =>
                          runAction("Activate deployment", async () => {
                            await mutate(`changes/${change.id}/activate`, {
                              expectedVersion: change.version,
                            });
                          })
                        }
                      />
                    )}
                  {change.state === "ACTIVE" &&
                    can("changes.rollback") &&
                    context.assurance.mfaVerified && (
                      <AdminActionButton
                        label="Rollback"
                        busy={busy}
                        danger
                        confirm="Rollback to the newest previously approved version?"
                        onClick={() =>
                          runAction("Rollback deployment", async () => {
                            await mutate(`changes/${change.id}/rollback`, {
                              expectedVersion: change.version,
                            });
                          })
                        }
                      />
                    )}
                </div>
              </td>
            </tr>
          );
        })}
      </AdminTable>
      {filtered.length === 0 && (
        <AdminEmptyState message="No changes match the current filters." />
      )}
    </AdminPanel>
  );
}
