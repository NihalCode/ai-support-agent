/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { applyPreferences } from "../applyPreferences";
import { DEFAULT_PREFERENCES } from "../PreferencesTypes";
import { mergePrefs, clampZoom, zoomIn, zoomOut } from "../PreferencesService";

describe("applyPreferences", () => {
  it("sets CSS variables on document root", () => {
    applyPreferences({
      ...DEFAULT_PREFERENCES,
      fontFamily: "verdana",
      fontSize: "large",
      lineHeight: "spacious",
      contrastMode: "high",
      zoomLevel: 1.1,
      readingFriendlyMode: true,
      reducedMotion: true,
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--app-font-scale")).toBeTruthy();
    expect(root.classList.contains("pref-high-contrast")).toBe(true);
    expect(root.classList.contains("pref-reading-friendly")).toBe(true);
    expect(root.classList.contains("pref-reduced-motion")).toBe(true);
  });
});

describe("PreferencesService", () => {
  it("clamps zoom levels", () => {
    expect(clampZoom(2)).toBe(1.5);
    expect(clampZoom(0.5)).toBe(0.75);
    expect(zoomIn({ ...DEFAULT_PREFERENCES, zoomLevel: 1 }).zoomLevel).toBe(1.05);
    expect(zoomOut({ ...DEFAULT_PREFERENCES, zoomLevel: 1 }).zoomLevel).toBe(0.95);
  });

  it("mergePrefs applies defaults", () => {
    const merged = mergePrefs({ fontSize: "large" });
    expect(merged.fontSize).toBe("large");
    expect(merged.fontFamily).toBe("system");
  });
});
