import type { BuildAppTemplateId } from "./types";

export interface AppCopy {
  title: string;
  subtitle: string;
}

/** Derive professional product copy — never use raw chat prompt as visible UI text. */
export function deriveAppCopy(
  message: string,
  templateId?: BuildAppTemplateId,
  templateName?: string
): AppCopy {
  const m = message.toLowerCase();

  if (templateId === "indicator-search-dashboard" || /\bindicator.*search|search.*indicator|ioc/i.test(m)) {
    return {
      title: "Indicator Search Dashboard",
      subtitle:
        "Search indicators, filter with CQL, review matches in a table, and inspect details in one place.",
    };
  }
  if (templateId === "cql-search-app" || (/\bcql\b/.test(m) && /\bsearch|query|filter\b/.test(m))) {
    return {
      title: "CQL Search",
      subtitle: "Run CQL queries against your CTIX data and explore results in a structured table.",
    };
  }
  if (templateId === "case-management-dashboard" || /\bcase management|incident\b/.test(m)) {
    return {
      title: "Case Management Dashboard",
      subtitle: "Browse cases, review status, and open details for faster triage.",
    };
  }
  if (templateId === "orchestrate-workflow-dashboard" || /\borchestrat|playbook|workflow\b/.test(m)) {
    return {
      title: "Workflow Dashboard",
      subtitle: "Monitor playbook runs, execution status, and recent workflow history.",
    };
  }
  if (templateId === "api-playground-app" || /\bplayground|api explorer\b/.test(m)) {
    return {
      title: "API Playground",
      subtitle: "Explore Cyware API endpoints interactively with guided request forms.",
    };
  }
  if (templateId === "support-portal-app" || /\bsupport portal|customer portal\b/.test(m)) {
    return {
      title: "Support Portal",
      subtitle: "Submit and track support requests in a clean customer-facing portal.",
    };
  }
  if (templateId === "cyware-api-dashboard" || /\bdashboard\b/.test(m)) {
    return {
      title: "Cyware API Dashboard",
      subtitle: "View and explore Cyware API data in a unified dashboard.",
    };
  }

  const name = templateName ?? "Cyware App";
  return {
    title: name,
    subtitle: "A secure, server-side integration with your Cyware tenant.",
  };
}

/** True if text looks like a raw user prompt, not product copy. */
export function looksLikeRawPrompt(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  return (
    /^build me\b/i.test(t) ||
    /^create (a|an|my)\b/i.test(t) ||
    /^i want (a|an|to)\b/i.test(t) ||
    /^make me\b/i.test(t) ||
    /\bi want a simple page where\b/i.test(t) ||
    t.length > 60
  );
}
