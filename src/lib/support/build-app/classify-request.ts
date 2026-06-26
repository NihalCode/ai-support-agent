import type { BuildAppRequest, BuildAppTemplateId } from "./types";
import { listTemplates } from "./templates";

const BUILD_RE =
  /\b(build|create|scaffold|make|generate)\b.*\b(app|application|dashboard|portal|frontend|ui)\b/i;
const DEPLOY_RE = /\b(deploy|ship|publish|release)\b.*\b(vercel|production|preview|app)\b/i;

export function isBuildAppRequest(message: string): boolean {
  return BUILD_RE.test(message) || DEPLOY_RE.test(message);
}

export function isDeployRequest(message: string): boolean {
  return DEPLOY_RE.test(message) || /\bdeploy\b/i.test(message);
}

export function selectTemplate(
  message: string,
  override?: BuildAppTemplateId
): { templateId: BuildAppTemplateId; reason: string } {
  if (override) {
    const t = listTemplates().find((x) => x.id === override);
    return { templateId: override, reason: t ? `User selected ${t.name}.` : "Template override." };
  }

  const m = message.toLowerCase();

  if (/\bindicator.*search|search.*indicator|ioc.*search\b/.test(m)) {
    return { templateId: "indicator-search-dashboard", reason: "Request mentions indicator search UI." };
  }
  if (/\bcql\b/.test(m) && /\b(search|query|filter|app|dashboard)\b/.test(m)) {
    return { templateId: "cql-search-app", reason: "Request mentions CQL search experience." };
  }
  if (/\bcase management|csap.*dashboard|cftr\b/.test(m)) {
    return { templateId: "case-management-dashboard", reason: "Request mentions case management / CSAP / CFTR." };
  }
  if (/\borchestrat|workflow.*status|playbook\b/.test(m)) {
    return {
      templateId: "orchestrate-workflow-dashboard",
      reason: "Request mentions Orchestrate workflows or execution status.",
    };
  }
  if (/\bplayground|try api|api explorer\b/.test(m)) {
    return { templateId: "api-playground-app", reason: "Request mentions API playground / explorer." };
  }
  if (/\bsupport portal|customer portal\b/.test(m)) {
    return { templateId: "support-portal-app", reason: "Request mentions support portal." };
  }
  if (/\bdashboard\b/.test(m)) {
    return { templateId: "cyware-api-dashboard", reason: "Generic Cyware API dashboard request." };
  }

  return { templateId: "blank-next-app", reason: "No specific template matched — using blank Next.js starter." };
}

export function inferFeatures(message: string): string[] {
  const features: string[] = [];
  const m = message.toLowerCase();
  if (/\bsearch box|search field|search input\b/.test(m) || /\bsearch\b/.test(m)) features.push("Search input");
  if (/\bcql\b/.test(m)) features.push("Optional CQL filter");
  if (/\btable|results\b/.test(m)) features.push("Results table");
  if (/\bdetails panel|detail view\b/.test(m)) features.push("Details panel");
  if (/\bdeploy|vercel\b/.test(m)) features.push("Vercel deployment ready");
  if (/\bfilter\b/.test(m)) features.push("Table filters");
  if (features.length === 0) features.push("Basic Cyware API integration");
  return features;
}

export function isReadOnlyRequest(message: string): boolean {
  return /\bread[- ]only|view only|no write|don't write|do not write\b/i.test(message);
}

export function extractClarifyingQuestions(message: string): string[] {
  const qs: string[] = [];
  const m = message.toLowerCase();
  const hasProduct = /\bctix|csap|orchestrate|cftr|cyware\b/.test(m);
  if (!hasProduct) {
    qs.push("Which Cyware product should this app use (CTIX, CSAP, Orchestrate, or CFTR)?");
  }
  if (!/\buser|admin|analyst|customer\b/.test(m)) {
    qs.push("Who will use this app — analysts, admins, or customers?");
  }
  if (!isReadOnlyRequest(message) && !/\bread|write|create|update|delete\b/.test(m)) {
    qs.push("Should the app be read-only, or should it also perform write actions?");
  }
  return qs.slice(0, 3);
}

export function classifyBuildAppRequest(req: BuildAppRequest): {
  isBuild: boolean;
  isDeploy: boolean;
  isEdit: boolean;
} {
  const msg = req.message;
  return {
    isBuild: isBuildAppRequest(msg) && !req.projectId,
    isDeploy: isDeployRequest(msg),
    isEdit: Boolean(req.projectId) && !isDeployRequest(msg),
  };
}
