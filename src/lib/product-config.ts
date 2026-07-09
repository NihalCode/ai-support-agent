/** Central branding and default UX mode — no personal names hardcoded. */

export type ProductMode = "client" | "developer";

export const productConfig = {
  appName: "AI Support Studio",
  appSubtitle:
    "Investigate support issues and work with Cyware APIs using natural language.",
  companyName: "",
  tagline:
    "Describe an API issue, endpoint question, or CQL query. The assistant will investigate, search docs, and guide you step by step.",
  defaultMode: "client" as ProductMode,
  showDeveloperToolsByDefault: false,
  chatPlaceholder:
    "Describe an API issue, endpoint, CQL query, or support ticket…",
  chatPanelTitle: "Assistant",
} as const;

export const PRODUCT_MODE_STORAGE_KEY = "ai-support-product-mode";

export function readStoredProductMode(): ProductMode {
  if (typeof window === "undefined") return productConfig.defaultMode;
  try {
    const v = localStorage.getItem(PRODUCT_MODE_STORAGE_KEY);
    return v === "developer" ? "developer" : "client";
  } catch {
    return productConfig.defaultMode;
  }
}

export function clientLayoutDefaults() {
  return {
    sidebarVisible: true,
    chatVisible: true,
    bottomVisible: false,
  };
}

export function developerLayoutDefaults() {
  return {
    sidebarVisible: true,
    chatVisible: true,
    bottomVisible: false,
  };
}
