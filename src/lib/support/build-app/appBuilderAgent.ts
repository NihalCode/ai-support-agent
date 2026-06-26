import "server-only";

import type { BuildAppRequest, BuildAppAgentResult, BuildAppFileChange, BuildAppProject } from "./types";
import { buildScaffoldPlan, createProjectFromPlan } from "./plan-scaffold";
import { classifyBuildAppRequest, isDeployRequest } from "./classify-request";
import { getProject, readProjectFile, setPendingChanges } from "./project-store";
import { listSpecs } from "@/lib/support/api-specs/registry";

export function runAppBuilderAgent(req: BuildAppRequest): BuildAppAgentResult {
  const { isBuild, isEdit } = classifyBuildAppRequest(req);

  if (isEdit && req.projectId) {
    return proposeEdits(req.projectId, req.message);
  }

  const specs = listSpecs();
  const plan = buildScaffoldPlan(req);
  if (specs.length === 0 && plan.endpoints.length === 0) {
    plan.clarifyingQuestions.unshift(
      "No Cyware API docs are imported yet — import specs in API Registry or continue with template defaults."
    );
  }

  const { project, changes } = createProjectFromPlan(req, plan);

  const explanation = [
    `I'll build **${plan.title}** using the **${plan.templateId}** template.`,
    plan.templateReason,
    plan.endpoints.length
      ? `API endpoints: ${plan.endpoints.map((e) => `${e.method} ${e.path}`).join(", ")}`
      : "Using template default endpoints — import API docs to refine.",
    plan.features.length ? `Features: ${plan.features.join(", ")}` : "",
    plan.clarifyingQuestions.length
      ? `\nOptional clarifications:\n${plan.clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "",
    "\nReview the file diffs below and approve to scaffold the app.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    plan,
    project,
    explanation,
    needsApproval: true,
    approvalPreview: `Scaffold ${changes.length} files into generated-apps/${project.name}/`,
    pendingChanges: changes,
  };
}

function conversationalReply(message: string, project: BuildAppProject): string | null {
  const m = message.toLowerCase().trim();
  if (/\b(ctix|csap|orchestrate|cftr)\b/.test(m)) {
    const product = m.match(/\b(ctix|csap|orchestrate|cftr)\b/i)?.[1]?.toUpperCase() ?? "CTIX";
    return `Got it — I'll use ${product} APIs for this app. Tell me if you'd like search, a table, filters, or anything else added.`;
  }
  if (/\b(analyst|admin|customer|team)\b/.test(m)) {
    return "Understood — I'll keep the interface simple for your team. Anything else you want on the main screen?";
  }
  if (/\bread[- ]?only\b|\bview only\b|\bno write\b/.test(m)) {
    return "Perfect — I'll make this read-only so it only looks up data, with no changes to your Cyware tenant.";
  }
  if (/\b(search|table|filter|details|dashboard)\b/.test(m) && project.status === "pending_approval") {
    return "Thanks — those features are already in the plan. Click \"Yes, create my app\" when you're ready, or tell me what to change.";
  }
  return null;
}

function proposeEdits(projectId: string, message: string): BuildAppAgentResult {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");

  const conversational = conversationalReply(message, project);
  if (conversational) {
    return {
      plan: project.plan!,
      project,
      explanation: conversational,
      needsApproval: false,
    };
  }

  const m = message.toLowerCase();
  const changes: BuildAppFileChange[] = [];

  if (/cleaner|modern|ui|look|design|dashboard/i.test(m)) {
    const pagePath = project.files.find((f) => f.endsWith("app/page.tsx")) ?? "app/page.tsx";
    const existing = readProjectFile(projectId, pagePath) ?? "";
    const updated = existing.replace(
      /className="container"/,
      'className="container dashboard-shell"'
    );
    if (updated !== existing) {
      changes.push({ path: pagePath, action: "update", content: updated, previousContent: existing });
    } else {
      changes.push({
        path: pagePath,
        action: "update",
        content: existing.replace("<main", '<main className="dashboard-shell"'),
        previousContent: existing,
      });
    }
  }

  if (/filter|table filter/i.test(m)) {
    const tablePath =
      project.files.find((f) => f.includes("ResultsTable")) ?? "components/ResultsTable.tsx";
    const existing = readProjectFile(projectId, tablePath);
    if (existing && !existing.includes("filterText")) {
      changes.push({
        path: tablePath,
        action: "update",
        content: existing.replace(
          "export function ResultsTable",
          'import { useState } from "react";\n\nexport function ResultsTable'
        ),
        previousContent: existing,
      });
    }
  }

  if (/explain|simple terms|what does/i.test(m)) {
    return {
      plan: project.plan!,
      project,
      explanation: `This app uses server-side API routes so Cyware credentials stay on the server. The frontend calls \`/api/indicators/search\` which adds auth and forwards to ${project.plan?.endpoints[0]?.path ?? "the Cyware API"}.`,
      needsApproval: false,
    };
  }

  if (changes.length === 0) {
    return {
      plan: project.plan!,
      project,
      explanation:
        "Tell me what you'd like changed — for example: \"make it cleaner\", \"add a filter\", or \"explain how this works in simple terms\".",
      needsApproval: false,
    };
  }

  setPendingChanges(projectId, changes);
  return {
    plan: project.plan!,
    project: getProject(projectId)!,
    explanation: `Proposed ${changes.length} file change(s). Review diffs and approve to apply.`,
    needsApproval: true,
    approvalPreview: `Update ${changes.map((c) => c.path).join(", ")}`,
    pendingChanges: changes,
  };
}

export function isBuildAppMessage(message: string): boolean {
  return /\b(build|create|scaffold|deploy)\b.*\b(app|dashboard|vercel|frontend)\b/i.test(message);
}
