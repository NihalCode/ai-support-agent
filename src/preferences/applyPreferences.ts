import type { UserPreferences } from "./PreferencesTypes";

const FONT_FAMILY_MAP: Record<UserPreferences["fontFamily"], string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  inter: 'Inter, ui-sans-serif, system-ui, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  atkinson: '"Atkinson Hyperlegible", Verdana, sans-serif',
  opendyslexic: '"OpenDyslexic", Verdana, sans-serif',
};

const FONT_SIZE_SCALE: Record<UserPreferences["fontSize"], number> = {
  small: 0.875,
  default: 1,
  large: 1.125,
  extra_large: 1.25,
};

const LINE_HEIGHT_MAP: Record<UserPreferences["lineHeight"], number> = {
  compact: 1.35,
  comfortable: 1.5,
  spacious: 1.75,
};

/** Apply user preferences to document root via CSS variables and data attributes. */
export function applyPreferences(prefs: UserPreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const baseScale = FONT_SIZE_SCALE[prefs.fontSize] * prefs.zoomLevel;
  root.style.setProperty("--app-font-family", FONT_FAMILY_MAP[prefs.fontFamily]);
  root.style.setProperty("--app-font-scale", String(baseScale));
  root.style.setProperty("--app-line-height", String(LINE_HEIGHT_MAP[prefs.lineHeight]));
  root.style.setProperty(
    "--app-contrast-multiplier",
    prefs.contrastMode === "high" ? "1.15" : prefs.contrastMode === "soft" ? "0.92" : "1"
  );

  root.dataset.contrastMode = prefs.contrastMode;
  root.dataset.readingFriendly = prefs.readingFriendlyMode ? "true" : "false";
  root.dataset.reducedMotion = prefs.reducedMotion ? "true" : "false";

  if (prefs.reducedMotion) {
    root.classList.add("pref-reduced-motion");
  } else {
    root.classList.remove("pref-reduced-motion");
  }
  if (prefs.readingFriendlyMode) {
    root.classList.add("pref-reading-friendly");
  } else {
    root.classList.remove("pref-reading-friendly");
  }
  if (prefs.contrastMode === "high") {
    root.classList.add("pref-high-contrast");
  } else {
    root.classList.remove("pref-high-contrast");
  }
}
