import {
  DEFAULT_PREFERENCES,
  STORAGE_KEY,
  type UserPreferences,
} from "./PreferencesTypes";

function clampZoom(n: number): number {
  return Math.min(1.5, Math.max(0.75, Math.round(n * 100) / 100));
}

function mergePrefs(partial: Partial<UserPreferences>): UserPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...partial,
    zoomLevel: clampZoom(partial.zoomLevel ?? DEFAULT_PREFERENCES.zoomLevel),
  };
}

function readLocal(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return mergePrefs(JSON.parse(raw) as Partial<UserPreferences>);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writeLocal(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** Load preferences: user API when authenticated, else localStorage. */
export async function loadPreferences(userId?: string | null): Promise<UserPreferences> {
  if (userId) {
    try {
      const res = await fetch("/api/support/preferences", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { preferences?: Partial<UserPreferences> };
        if (data.preferences) {
          const merged = mergePrefs(data.preferences);
          writeLocal(merged);
          return merged;
        }
      }
    } catch {
      /* fall through to local */
    }
  }
  return readLocal();
}

/** Persist preferences to user API (if logged in) and localStorage. */
export async function savePreferences(
  prefs: UserPreferences,
  userId?: string | null
): Promise<UserPreferences> {
  const merged = mergePrefs(prefs);
  writeLocal(merged);
  if (userId) {
    try {
      await fetch("/api/support/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: merged }),
      });
    } catch {
      /* localStorage is sufficient fallback */
    }
  }
  return merged;
}

export function zoomIn(current: UserPreferences): UserPreferences {
  return { ...current, zoomLevel: clampZoom(current.zoomLevel + 0.05) };
}

export function zoomOut(current: UserPreferences): UserPreferences {
  return { ...current, zoomLevel: clampZoom(current.zoomLevel - 0.05) };
}

export function resetZoom(current: UserPreferences): UserPreferences {
  return { ...current, zoomLevel: 1 };
}

export { mergePrefs, readLocal, writeLocal, clampZoom };
