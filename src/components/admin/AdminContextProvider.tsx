"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CONTROL_PLANE_API,
  canCapability,
  controlPlaneJson,
  type ControlPlaneAuditEvent,
  type ControlPlaneCapability,
  type ControlPlaneChange,
  type ControlPlaneContext,
  type ControlPlaneCredential,
  type ControlPlaneResource,
  type ZendeskDiagnostics,
} from "@/lib/admin/control-plane-client";

interface ControlPlaneData {
  resources: ControlPlaneResource[];
  changes: ControlPlaneChange[];
  credentials: ControlPlaneCredential[];
  audit: ControlPlaneAuditEvent[];
  diagnostics: ZendeskDiagnostics | null;
}

interface AdminContextValue {
  context: ControlPlaneContext | null;
  data: ControlPlaneData;
  notice: string;
  busy: boolean;
  secret: string | null;
  setSecret: (value: string | null) => void;
  can: (capability: ControlPlaneCapability) => boolean;
  refresh: () => Promise<void>;
  mutate: <T>(path: string, body: Record<string, unknown>) => Promise<T>;
  runAction: (label: string, action: () => Promise<void>) => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

const emptyData: ControlPlaneData = {
  resources: [],
  changes: [],
  credentials: [],
  audit: [],
  diagnostics: null,
};

export function AdminContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ControlPlaneContext | null>(null);
  const [data, setData] = useState<ControlPlaneData>(emptyData);
  const [notice, setNotice] = useState("Loading protected control-plane data…");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const can = useCallback(
    (capability: ControlPlaneCapability) => canCapability(context, capability),
    [context]
  );

  const refresh = useCallback(async () => {
    setNotice("Refreshing protected control-plane data…");
    try {
      const nextContext = await controlPlaneJson<ControlPlaneContext>(
        `${CONTROL_PLANE_API}/context`
      );
      setContext(nextContext);

      const requests = await Promise.allSettled([
        controlPlaneJson<{ resources: ControlPlaneResource[] }>(
          `${CONTROL_PLANE_API}/resources`
        ),
        controlPlaneJson<{ changes: ControlPlaneChange[] }>(
          `${CONTROL_PLANE_API}/changes`
        ),
        controlPlaneJson<{ credentials: ControlPlaneCredential[] }>(
          `${CONTROL_PLANE_API}/credentials`
        ),
        controlPlaneJson<{ events: ControlPlaneAuditEvent[] }>(
          `${CONTROL_PLANE_API}/audit`
        ),
        controlPlaneJson<{ diagnostics: ZendeskDiagnostics }>(
          `${CONTROL_PLANE_API}/zendesk/diagnostics`
        ),
      ]);

      setData({
        resources:
          requests[0].status === "fulfilled" ? requests[0].value.resources : [],
        changes:
          requests[1].status === "fulfilled" ? requests[1].value.changes : [],
        credentials:
          requests[2].status === "fulfilled" ? requests[2].value.credentials : [],
        audit:
          requests[3].status === "fulfilled" ? requests[3].value.events : [],
        diagnostics:
          requests[4].status === "fulfilled"
            ? requests[4].value.diagnostics
            : null,
      });

      const failures = requests.filter((result) => result.status === "rejected").length;
      setNotice(
        failures
          ? `${failures} data source${failures === 1 ? "" : "s"} unavailable. Available data is shown.`
          : "Dashboard data is current."
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Dashboard could not be loaded."
      );
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const mutate = useCallback(
    async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
      if (!context) throw new Error("Security context is not ready.");
      return controlPlaneJson<T>(`${CONTROL_PLANE_API}/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": context.csrfToken,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
    },
    [context]
  );

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setBusy(true);
      setNotice(`${label} in progress…`);
      try {
        await action();
        setNotice(`${label} completed.`);
        await refresh();
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : `${label} failed.`
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const value = useMemo<AdminContextValue>(
    () => ({
      context,
      data,
      notice,
      busy,
      secret,
      setSecret,
      can,
      refresh,
      mutate,
      runAction,
    }),
    [context, data, notice, busy, secret, can, refresh, mutate, runAction]
  );

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}

export function useAdminContext(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) {
    throw new Error("useAdminContext must be used within AdminContextProvider");
  }
  return value;
}

export function useAdminContextOptional(): AdminContextValue | null {
  return useContext(AdminContext);
}
