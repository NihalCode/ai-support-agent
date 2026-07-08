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
import { useAuth } from "@/components/auth/AuthProvider";
import { applyPreferences } from "./applyPreferences";
import {
  loadPreferences,
  resetZoom,
  savePreferences,
  zoomIn,
  zoomOut,
} from "./PreferencesService";
import { DEFAULT_PREFERENCES, type UserPreferences } from "./PreferencesTypes";

interface PreferencesContextValue {
  preferences: UserPreferences;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  zoomIn: () => Promise<void>;
  zoomOut: () => Promise<void>;
  resetZoom: () => Promise<void>;
  ready: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPreferences(user?.id).then((prefs) => {
      if (cancelled) return;
      setPreferences(prefs);
      applyPreferences(prefs);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const persist = useCallback(
    async (next: UserPreferences) => {
      setPreferences(next);
      applyPreferences(next);
      await savePreferences(next, user?.id);
    },
    [user?.id]
  );

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      await persist({ ...preferences, ...patch });
    },
    [persist, preferences]
  );

  const value = useMemo(
    () => ({
      preferences,
      updatePreferences,
      zoomIn: async () => persist(zoomIn(preferences)),
      zoomOut: async () => persist(zoomOut(preferences)),
      resetZoom: async () => persist(resetZoom(preferences)),
      ready,
    }),
    [preferences, updatePreferences, persist, ready]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
