/** Central branding and default UX mode — no personal names hardcoded. */

export type ProductMode = "client" | "developer";

export const productConfig = {
  appName: "AI Support Studio",
  appSubtitle:
    "Build apps, investigate issues, and work with Cyware APIs using natural language.",
  companyName: "",
  tagline:
    "Describe what you want to build, fix, investigate, or deploy. The assistant will understand your request, choose the right workflow, and guide you step by step.",
  defaultMode: "client" as ProductMode,
  showDeveloperToolsByDefault: false,
  chatPlaceholder:
    "Tell the agent what you want to build, fix, investigate, or deploy…",
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
    bottomVisible: true,
  };
}
