"use client";

import { AppSelect } from "@/components/ui/AppSelect";
import { usePreferences } from "@/preferences/PreferencesProvider";
import type {
  ContrastModePreference,
  FontFamilyPreference,
  FontSizePreference,
  LineHeightPreference,
} from "@/preferences/PreferencesTypes";

const FONT_OPTIONS: { value: FontFamilyPreference; label: string }[] = [
  { value: "system", label: "System default" },
  { value: "inter", label: "Inter" },
  { value: "arial", label: "Arial" },
  { value: "verdana", label: "Verdana" },
  { value: "atkinson", label: "Atkinson Hyperlegible" },
  { value: "opendyslexic", label: "OpenDyslexic" },
];

const SIZE_OPTIONS: { value: FontSizePreference; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "extra_large", label: "Extra Large" },
];

const LINE_OPTIONS: { value: LineHeightPreference; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

const CONTRAST_OPTIONS: { value: ContrastModePreference; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "high", label: "High Contrast" },
  { value: "soft", label: "Soft Contrast" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="pref-field">
      <span className="pref-field-label">{label}</span>
      {children}
    </label>
  );
}

export function PersonalPreferences() {
  const { preferences, updatePreferences, zoomIn, zoomOut, resetZoom } = usePreferences();

  return (
    <div data-testid="personal-preferences-panel" className="pref-panel">
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16, maxWidth: 560 }}>
        Adjust typography, contrast, and motion to improve readability. Changes apply immediately and
        persist across sessions.
      </p>

      <div className="pref-grid">
        <Field label="Font family">
          <AppSelect
            testId="pref-font-family"
            value={preferences.fontFamily}
            onChange={(v) => void updatePreferences({ fontFamily: v })}
            options={FONT_OPTIONS}
          />
        </Field>

        <Field label="Font size">
          <AppSelect
            testId="pref-font-size"
            value={preferences.fontSize}
            onChange={(v) => void updatePreferences({ fontSize: v })}
            options={SIZE_OPTIONS}
          />
        </Field>

        <Field label="Line height">
          <AppSelect
            testId="pref-line-height"
            value={preferences.lineHeight}
            onChange={(v) => void updatePreferences({ lineHeight: v })}
            options={LINE_OPTIONS}
          />
        </Field>

        <Field label="Contrast mode">
          <AppSelect
            testId="pref-contrast"
            value={preferences.contrastMode}
            onChange={(v) => void updatePreferences({ contrastMode: v })}
            options={CONTRAST_OPTIONS}
          />
        </Field>
      </div>

      <div className="pref-section">
        <span className="pref-field-label">Zoom</span>
        <div className="pref-zoom-row">
          <button type="button" className="ide-btn" data-testid="pref-zoom-out" onClick={() => void zoomOut()}>
            Zoom out
          </button>
          <button type="button" className="ide-btn" data-testid="pref-zoom-reset" onClick={() => void resetZoom()}>
            Reset ({Math.round(preferences.zoomLevel * 100)}%)
          </button>
          <button type="button" className="ide-btn" data-testid="pref-zoom-in" onClick={() => void zoomIn()}>
            Zoom in
          </button>
        </div>
      </div>

      <div className="pref-toggles">
        <label className="pref-toggle">
          <input
            type="checkbox"
            checked={preferences.reducedMotion}
            onChange={(e) => void updatePreferences({ reducedMotion: e.target.checked })}
            data-testid="pref-reduced-motion"
          />
          <span>Reduced motion (also respects OS preference)</span>
        </label>
        <label className="pref-toggle">
          <input
            type="checkbox"
            checked={preferences.readingFriendlyMode}
            onChange={(e) => void updatePreferences({ readingFriendlyMode: e.target.checked })}
            data-testid="pref-reading-friendly"
          />
          <span>Reading-friendly mode (more spacing, less visual noise in chat)</span>
        </label>
      </div>
    </div>
  );
}
