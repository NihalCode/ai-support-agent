import type { BuildAppProject } from "./types";

export type BuildAppWorkflowState =
  | "idle"
  | "planning"
  | "awaiting_scaffold_approval"
  | "scaffolding"
  | "installing_dependencies"
  | "install_failed"
  | "building"
  | "build_failed"
  | "testing"
  | "test_failed"
  | "preview_starting"
  | "preview_ready"
  | "deploy_awaiting_approval"
  | "deploying"
  | "deploy_failed"
  | "deployed";

const VALID_TRANSITIONS: Record<BuildAppWorkflowState, BuildAppWorkflowState[]> = {
  idle: ["planning"],
  planning: ["awaiting_scaffold_approval", "idle"],
  awaiting_scaffold_approval: ["scaffolding", "planning"],
  scaffolding: ["installing_dependencies", "build_failed"],
  installing_dependencies: ["building", "install_failed"],
  install_failed: ["installing_dependencies", "building"],
  building: ["testing", "build_failed", "preview_ready"],
  build_failed: ["installing_dependencies", "building"],
  testing: ["preview_ready", "test_failed"],
  test_failed: ["building", "preview_ready"],
  preview_starting: ["preview_ready", "build_failed"],
  preview_ready: ["deploy_awaiting_approval"],
  deploy_awaiting_approval: ["deploying", "preview_ready"],
  deploying: ["deployed", "deploy_failed"],
  deploy_failed: ["deploying"],
  deployed: ["deploy_awaiting_approval"],
};

export function canTransition(from: BuildAppWorkflowState, to: BuildAppWorkflowState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function workflowStateFromProject(project: BuildAppProject | null, opts?: { awaitingApproval?: boolean }): BuildAppWorkflowState {
  if (!project) return opts?.awaitingApproval ? "awaiting_scaffold_approval" : "idle";

  if (project.status === "planning") return "planning";
  if (project.status === "pending_approval" || opts?.awaitingApproval) return "awaiting_scaffold_approval";
  if (project.status === "building") return "building";
  if (project.status === "failed") {
    if (project.buildOk === false) return "build_failed";
    return "install_failed";
  }
  if (project.status === "deploying") return "deploying";
  if (project.status === "deployed" || project.previewUrl) return project.previewUrl ? "deployed" : "preview_ready";
  if (project.status === "ready" && project.buildOk) return "preview_ready";
  if (project.status === "scaffolded") return "scaffolding";

  return "idle";
}

export function workflowLabel(state: BuildAppWorkflowState): string {
  const labels: Record<BuildAppWorkflowState, string> = {
    idle: "Ready",
    planning: "Planning…",
    awaiting_scaffold_approval: "Awaiting your approval",
    scaffolding: "Files created",
    installing_dependencies: "Installing dependencies…",
    install_failed: "Install failed",
    building: "Building…",
    build_failed: "Build failed",
    testing: "Running tests…",
    test_failed: "Tests failed",
    preview_starting: "Starting preview…",
    preview_ready: "Build passed",
    deploy_awaiting_approval: "Ready to deploy",
    deploying: "Deploying…",
    deploy_failed: "Deploy failed",
    deployed: "Deployed",
  };
  return labels[state];
}
