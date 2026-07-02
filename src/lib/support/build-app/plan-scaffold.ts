import "server-only";

import type { BuildAppPlan, BuildAppRequest } from "./types";
import { selectTemplate, inferFeatures, isReadOnlyRequest, extractClarifyingQuestions } from "./classify-request";
import { selectEndpointsForApp } from "./select-endpoints";
import { generateEnvSnippet } from "./env-snippet";
import { getTemplate, resolveTemplateFiles } from "./templates";
import { createProject, setPendingChanges } from "./project-store";
import type { BuildAppFileChange } from "./types";
import { deriveAppCopy } from "./app-copy";

export function buildScaffoldPlan(req: BuildAppRequest): BuildAppPlan {
  const { templateId, reason } = selectTemplate(req.message, req.templateOverride);
  const template = getTemplate(templateId);
  const endpoints = selectEndpointsForApp(req.message, templateId);
  const features = inferFeatures(req.message);
  const products = template?.products ?? ["CTIX"];
  const copy = deriveAppCopy(req.message, templateId, template?.name);

  const title = copy.title;

  return {
    id: crypto.randomUUID(),
    title,
    summary: copy.subtitle,
    templateId,
    templateReason: reason,
    endpoints,
    features,
    envSnippet: generateEnvSnippet(templateId, products),
    clarifyingQuestions: extractClarifyingQuestions(req.message),
    readOnly: isReadOnlyRequest(req.message),
    deployReady: /\bvercel|deploy\b/i.test(req.message),
    createdAt: new Date().toISOString(),
  };
}

export function planToFileChanges(plan: BuildAppPlan, projectName: string): BuildAppFileChange[] {
  const primary = plan.endpoints[0];
  const vars: Record<string, string> = {
    APP_TITLE: plan.title,
    APP_SUBTITLE: plan.summary,
    APP_NAME: projectName,
    SEARCH_METHOD: primary?.method ?? "GET",
    SEARCH_ENDPOINT: primary?.path ?? "/v3/indicators/",
    DETAIL_METHOD: plan.endpoints[1]?.method ?? "GET",
    DETAIL_ENDPOINT: plan.endpoints[1]?.path ?? "/v3/indicators/{id}/",
    PRODUCT: primary?.product ?? "CTIX",
    READ_ONLY: plan.readOnly ? "true" : "false",
    ENV_SNIPPET: plan.envSnippet,
  };

  const files = resolveTemplateFiles(plan.templateId, vars);
  const changes: BuildAppFileChange[] = files.map((f) => ({
    path: f.path,
    action: "create" as const,
    content: f.content,
  }));

  if (!files.some((f) => f.path === ".env.local.example")) {
    changes.push({
      path: ".env.local.example",
      action: "create",
      content: plan.envSnippet,
    });
  }

  return changes;
}

export function createProjectFromPlan(req: BuildAppRequest, plan: BuildAppPlan) {
  const slug = plan.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
  const project = createProject({
    name: slug || "cyware-app",
    description: req.message,
    templateId: plan.templateId,
  });
  project.plan = plan;
  const changes = planToFileChanges(plan, project.name);
  setPendingChanges(project.id, changes);
  return { project, changes };
}
