import "server-only";

import type { BuildAppRequest, BuildAppAgentResult, BuildAppProject } from "./types";
import { buildScaffoldPlan, createProjectFromPlan } from "./plan-scaffold";
import { classifyBuildAppRequest } from "./classify-request";
import { getProject, readProjectFile, setPendingChanges } from "./project-store";
import { listSpecs } from "@/lib/support/api-specs/registry";
import { classifyEditIntent, isEditIntent } from "./edit-intent";
import { classifyUserIntent } from "../intent/classify-intent";
import { generateUiEditChanges } from "./ui-edits";
import {
  isBuildErrorDiscussion,
  mergeBuildLog,
  proposeBuildErrorFixes,
  formatBuildErrorExplanation,
} from "./build-error-fix";

const ACTIVE_APP_STATUSES = new Set<BuildAppProject["status"]>([
  "scaffolded",
  "building",
  "ready",
  "deployed",
  "failed",
]);

export function runAppBuilderAgent(req: BuildAppRequest): BuildAppAgentResult {
  const { isEdit } = classifyBuildAppRequest(req);

  if (isEdit && req.projectId) {
    return proposeEdits(req.projectId, req.message, req.buildOutput);
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
  // Only intercept clarifying chat during initial plan review — never block edits on a live app.
  if (project.status !== "pending_approval" && project.status !== "planning") {
    return null;
  }

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
  if (/\b(search|table|filter|details|dashboard)\b/.test(m)) {
    return "Thanks — those features are already in the plan. Click \"Yes, create my app\" when you're ready, or tell me what to change.";
  }
  return null;
}

function hasActiveApp(project: BuildAppProject): boolean {
  return ACTIVE_APP_STATUSES.has(project.status) || (project.appliedChanges?.length ?? 0) > 0;
}

function proposeEdits(projectId: string, message: string, clientBuildOutput?: string): BuildAppAgentResult {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");

  const buildLog = mergeBuildLog(message, clientBuildOutput ?? project.buildOutput);
  const buildFailed = project.buildOk === false;

  const intent = classifyEditIntent(message);
  const nlIntent = classifyUserIntent({
    message,
    context: {
      buildProjectId: projectId,
      buildOk: project.buildOk,
      buildFailed,
    },
  });
  const activeApp = hasActiveApp(project);

  const wantsErrorFix =
    nlIntent.primaryIntent === "fix_error" ||
    nlIntent.primaryIntent === "run_tests" ||
    isBuildErrorDiscussion(message, buildFailed);

  if (wantsErrorFix && activeApp) {
    const errorFix = proposeBuildErrorFixes({
      project,
      message,
      buildOutput: buildLog,
      readFile: (path) => readProjectFile(projectId, path),
    });

    if (errorFix.changes.length > 0) {
      const fileList = errorFix.changes.map((c) => c.path).join(", ");
      const explanation = [
        formatBuildErrorExplanation(errorFix.analysis),
        "",
        `I'll patch **${fileList}** to fix this, then re-run the build.`,
        "",
        "Review the diff below and approve — I'll rebuild automatically and redeploy if the build passes.",
      ].join("\n");

      setPendingChanges(projectId, errorFix.changes);
      return {
        plan: project.plan!,
        project: getProject(projectId)!,
        explanation,
        needsApproval: true,
        approvalPreview: `Fix build error — ${fileList}`,
        pendingChanges: errorFix.changes,
      };
    }

    return {
      plan: project.plan!,
      project,
      explanation: [
        formatBuildErrorExplanation(errorFix.analysis),
        "",
        "I couldn't auto-patch the source from this log alone. Open **Show technical details** for the full output, or paste the file/line from the error if you have it.",
      ].join("\n"),
      needsApproval: false,
    };
  }

  if (nlIntent.primaryIntent === "explain_app" || intent.kind === "explain") {
    return {
      plan: project.plan!,
      project,
      explanation: `This app uses server-side API routes so Cyware credentials stay on the server. The frontend calls \`/api/indicators/search\` which adds auth and forwards to ${project.plan?.endpoints[0]?.path ?? "the Cyware API"}.`,
      needsApproval: false,
    };
  }

  const conversational = conversationalReply(message, project);
  if (conversational && !activeApp) {
    return {
      plan: project.plan!,
      project,
      explanation: conversational,
      needsApproval: false,
    };
  }

  const wantsEdit =
    intent.isEdit ||
    isEditIntent(message) ||
    ["edit_app", "fix_error", "run_tests"].includes(nlIntent.primaryIntent);

  if (activeApp && wantsEdit) {
    const { changes, summary, understoodRequest } = generateUiEditChanges({
      project,
      message,
      intent: intent.kind === "unknown" ? { kind: "clean_ui", isEdit: true, label: "Clean up UI" } : intent,
      readFile: (path) => readProjectFile(projectId, path),
    });

    if (changes.length === 0) {
      return {
        plan: project.plan!,
        project,
        explanation: buildFailed
          ? formatBuildErrorExplanation(
              proposeBuildErrorFixes({
                project,
                message,
                buildOutput: buildLog,
                readFile: (path) => readProjectFile(projectId, path),
              }).analysis
            )
          : "I reviewed the app files — the landing page already uses professional copy and layout. Tell me a specific change (e.g. add a filter, change the title) if you want more.",
        needsApproval: false,
      };
    }

    const fileList = changes.map((c) => c.path).join(", ");
    const explanation = [
      `Got it. ${understoodRequest}`,
      "",
      `I'm updating: ${fileList}`,
      "",
      "Review the diff below, then approve to apply. I'll run a test build afterward.",
    ].join("\n");

    setPendingChanges(projectId, changes);
    return {
      plan: project.plan!,
      project: getProject(projectId)!,
      explanation,
      needsApproval: true,
      approvalPreview: `Update ${fileList} — ${summary}`,
      pendingChanges: changes,
    };
  }

  if (!activeApp) {
    return {
      plan: project.plan!,
      project,
      explanation:
        'Describe the app you want to build. I\'ll pick the right template, connect the right APIs, generate files, test it, and prepare a preview.',
      needsApproval: false,
    };
  }

  return {
    plan: project.plan!,
    project,
    explanation:
      'Tell me what to change in this app. You can say things like "make it cleaner," "add a filter," "remove that text," or "deploy this."',
    needsApproval: false,
  };
}

export function isBuildAppMessage(message: string): boolean {
  return /\b(build|create|scaffold|deploy)\b.*\b(app|dashboard|vercel|frontend)\b/i.test(message);
}
