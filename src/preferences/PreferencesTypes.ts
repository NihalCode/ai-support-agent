export type FontFamilyPreference =
  | "system"
  | "inter"
  | "arial"
  | "verdana"
  | "atkinson"
  | "opendyslexic";

export type FontSizePreference = "small" | "default" | "large" | "extra_large";

export type LineHeightPreference = "compact" | "comfortable" | "spacious";

export type ContrastModePreference = "default" | "high" | "soft";

export interface UserPreferences {
  fontFamily: FontFamilyPreference;
  fontSize: FontSizePreference;
  lineHeight: LineHeightPreference;
  contrastMode: ContrastModePreference;
  zoomLevel: number;
  reducedMotion: boolean;
  readingFriendlyMode: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  fontFamily: "system",
  fontSize: "default",
  lineHeight: "comfortable",
  contrastMode: "default",
  zoomLevel: 1,
  reducedMotion: false,
  readingFriendlyMode: false,
};

export const STORAGE_KEY = "ai-support-studio-preferences-v1";
