"use client";

import { useMemo } from "react";

import { AdminActionButton, AdminButton } from "@/components/admin/AdminButtons";
import { useAdminContext } from "@/components/admin/AdminContextProvider";
import { SecretDialog } from "@/components/admin/SecretDialog";
import {
  AdminEmptyState,
  AdminFilterBar,
  AdminFilterField,
  AdminPanel,
  AdminTable,
} from "@/components/admin/primitives";
import { adminButton, adminInput } from "@/components/admin/tokens";
import { CONTROL_PLANE_API } from "@/lib/admin/control-plane-client";
import { useAdminUrlState } from "@/lib/admin/use-admin-url-state";

export function CredentialsSection({ productLabel = "Support Agent" }: { productLabel?: string }) {
  const {
    context,
    data,
    busy,
    can,
    runAction,
    mutate,
    secret,
    setSecret,
  } = useAdminContext();
  const { values, setValues } = useAdminUrlState(["environment"]);

  const filtered = useMemo(() => {
    if (!values.environment) return data.credentials;
    return data.credentials.filter(
      (credential) => credential.environment === values.environment
    );
  }, [data.credentials, values.environment]);

  if (!context) return null;

  return (
    <>
      <AdminPanel
        id="credentials"
        title={`${productLabel} API credentials`}
        description="Existing secret values are never returned. New and rotated secrets are shown once and must be stored immediately."
      >
        {can("credentials.manage") && (
          <CredentialForm
            busy={busy}
            mfaVerified={context.assurance.mfaVerified}
            onIssue={(payload) =>
              runAction("Issue credential", async () => {
                const result = await mutate<{ plaintext: string }>(
                  "credentials/issue",
                  payload
                );
                setSecret(result.plaintext);
              })
            }
          />
        )}
        <AdminFilterBar>
          <AdminFilterField label="Environment">
            <select
              aria-label="Environment"
              className={adminInput}
              value={values.environment}
              onChange={(event) =>
                setValues({ environment: event.target.value || null })
              }
            >
              <option value="">All environments</option>
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </AdminFilterField>
        </AdminFilterBar>
        <AdminTable
          caption="Credential metadata without secret values"
          columns={["Name", "Environment", "Last four", "Scopes", "Status", "Actions"]}
          minWidth={700}
        >
          {filtered.map((credential) => (
            <tr key={credential.id} className="border-b border-slate-800">
              <td className="p-2">{credential.name}</td>
              <td className="p-2 capitalize">{credential.environment}</td>
              <td className="p-2 font-mono">••••{credential.last4}</td>
              <td className="p-2">{credential.scopes.join(", ")}</td>
              <td className="p-2">{credential.revokedAt ? "Revoked" : "Active"}</td>
              <td className="p-2">
                {can("credentials.manage") &&
                  context.assurance.mfaVerified &&
                  !credential.revokedAt && (
                    <div className="flex gap-2">
                      <AdminActionButton
                        label="Rotate"
                        busy={busy}
                        confirm="Rotate this credential? The current key will be revoked."
                        onClick={() =>
                          runAction("Rotate credential", async () => {
                            const result = await mutate<{ plaintext: string }>(
                              `credentials/${credential.id}/rotate`,
                              { expectedVersion: credential.version }
                            );
                            setSecret(result.plaintext);
                          })
                        }
                      />
                      <AdminActionButton
                        label="Revoke"
                        busy={busy}
                        danger
                        confirm="Permanently revoke this credential?"
                        onClick={() =>
                          runAction("Revoke credential", async () => {
                            await mutate(`credentials/${credential.id}/revoke`, {
                              expectedVersion: credential.version,
                            });
                          })
                        }
                      />
                    </div>
                  )}
              </td>
            </tr>
          ))}
        </AdminTable>
        {filtered.length === 0 && (
          <AdminEmptyState message="No credentials match the current filters." />
        )}
      </AdminPanel>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}

function CredentialForm({
  busy,
  mfaVerified,
  onIssue,
}: {
  busy: boolean;
  mfaVerified: boolean;
  onIssue: (payload: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mt-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 md:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onIssue({
          name: String(form.get("name")),
          environment: String(form.get("environment")),
          scopes: String(form.get("scopes"))
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
          expiresAt: form.get("expiresAt")
            ? new Date(String(form.get("expiresAt"))).toISOString()
            : null,
        });
      }}
    >
      <label className="text-sm">
        Name
        <input className={`${adminInput} mt-1`} name="name" required />
      </label>
      <label className="text-sm">
        Environment
        <select className={`${adminInput} mt-1`} name="environment">
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
      </label>
      <label className="text-sm">
        Scopes
        <input
          className={`${adminInput} mt-1`}
          name="scopes"
          placeholder="resources:read"
          required
        />
      </label>
      <label className="text-sm">
        Expires
        <input className={`${adminInput} mt-1`} name="expiresAt" type="datetime-local" />
      </label>
      <div className="md:col-span-4">
        <button type="submit" className={adminButton} disabled={busy || !mfaVerified}>
          Issue one-time secret
        </button>
        {!mfaVerified && (
          <p className="mt-2 text-xs text-amber-200">Recent MFA is required.</p>
        )}
      </div>
    </form>
  );
}

export function AuditExportButton() {
  return (
    <AdminButton
      onClick={() => {
        window.location.href = `${CONTROL_PLANE_API}/export`;
      }}
    >
      Download redacted export
    </AdminButton>
  );
}
