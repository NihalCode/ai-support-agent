import type { BuildAppFileChange, BuildAppProject } from "./types";
import type { BuildAppWorkflowState } from "./workflow-state";
import { workflowStateFromProject } from "./workflow-state";
import { isScaffoldApprovalMessage } from "./approval-phrases";
import { isEditIntent } from "./edit-intent";

export type BuildAppState =
  | "idle"
  | "collecting_requirements"
  | "planning"
  | "awaiting_scaffold_approval"
  | "scaffolding"
  | "scaffolded"
  | "editing"
  | "awaiting_edit_approval"
  | "installing"
  | "building"
  | "build_failed"
  | "build_passed"
  | "testing"
  | "test_failed"
  | "test_passed"
  | "preview_ready"
  | "deploy_ready"
  | "deploying"
  | "deployed";

export interface AppBuilderSession {
  id: string;
  activeProjectId?: string;
  projectName?: string;
  originalUserRequest?: string;
  latestUserRequest?: string;
  requirements?: string[];
  generatedFiles: string[];
  pendingDiffs: BuildAppFileChange[];
  appliedDiffs: BuildAppFileChange[];
  currentState: BuildAppState;
  lastBuildResult?: { ok: boolean; output?: string };
  lastPreviewUrl?: string;
  updatedAt: string;
}

function mapWorkflowToSessionState(
  workflow: BuildAppWorkflowState,
  project: BuildAppProject | null
): BuildAppState {
  if (!project) {
    return workflow === "awaiting_scaffold_approval" ? "awaiting_scaffold_approval" : "idle";
  }

  if (project.status === "pending_approval") {
    return (project.appliedChanges?.length ?? 0) > 0 ? "awaiting_edit_approval" : "awaiting_scaffold_approval";
  }

  switch (workflow) {
    case "planning":
      return "planning";
    case "awaiting_scaffold_approval":
      return (project.appliedChanges?.length ?? 0) > 0 ? "awaiting_edit_approval" : "awaiting_scaffold_approval";
    case "scaffolding":
      return "scaffolded";
    case "installing_dependencies":
      return "installing";
    case "building":
      return "building";
    case "build_failed":
      return "build_failed";
    case "testing":
      return "testing";
    case "test_failed":
      return "test_failed";
    case "preview_ready":
      return project.buildOk ? "preview_ready" : "build_passed";
    case "deploy_awaiting_approval":
      return "deploy_ready";
    case "deploying":
      return "deploying";
    case "deployed":
      return "deployed";
    default:
      if (project.status === "scaffolded" || project.status === "ready") return "scaffolded";
      return "idle";
  }
}

export function sessionFromProject(
  project: BuildAppProject | null,
  opts?: { awaitingApproval?: boolean; originalRequest?: string }
): AppBuilderSession {
  const workflow = workflowStateFromProject(project, { awaitingApproval: opts?.awaitingApproval });
  const currentState = mapWorkflowToSessionState(workflow, project);

  return {
    id: project?.id ?? "new",
    activeProjectId: project?.id,
    projectName: project?.name,
    originalUserRequest: opts?.originalRequest ?? project?.description,
    latestUserRequest: project?.description,
    requirements: project?.plan?.features,
    generatedFiles: project?.files ?? [],
    pendingDiffs: project?.pendingChanges ?? [],
    appliedDiffs: project?.appliedChanges ?? [],
    currentState,
    lastBuildResult:
      project?.buildOk !== undefined
        ? { ok: project.buildOk === true, output: project.buildOutput }
        : undefined,
    lastPreviewUrl: project?.previewUrl,
    updatedAt: project?.updatedAt ?? new Date().toISOString(),
  };
}

export function mergeChangesIntoPending(
  pending: BuildAppFileChange[],
  edits: BuildAppFileChange[]
): BuildAppFileChange[] {
  const map = new Map(pending.map((c) => [c.path, { ...c }]));
  for (const edit of edits) {
    const existing = map.get(edit.path);
    if (existing) {
      map.set(edit.path, {
        ...existing,
        action: existing.action === "delete" ? "delete" : existing.action === "create" ? "create" : "update",
        content: edit.content,
        previousContent: existing.previousContent ?? existing.content,
      });
    } else {
      map.set(edit.path, edit);
    }
  }
  return Array.from(map.values());
}

export function readFileFromProjectSources(
  project: BuildAppProject,
  readDisk: (path: string) => string | null
): (path: string) => string | null {
  const pendingByPath = new Map(
    (project.pendingChanges ?? []).filter((c) => c.content !== undefined).map((c) => [c.path, c.content!])
  );
  const appliedByPath = new Map(
    (project.appliedChanges ?? []).filter((c) => c.content !== undefined).map((c) => [c.path, c.content!])
  );

  return (path: string) => {
    if (pendingByPath.has(path)) return pendingByPath.get(path)!;
    const disk = readDisk(path);
    if (disk !== null) return disk;
    return appliedByPath.get(path) ?? null;
  };
}

export function shouldShowDescribeFallback(project: BuildAppProject | null, message: string): boolean {
  if (!project) return true;
  if ((project.pendingChanges?.length ?? 0) > 0) return false;
  if ((project.appliedChanges?.length ?? 0) > 0) return false;
  if (project.plan) return false;
  if (isScaffoldApprovalMessage(message)) return false;
  if (isEditIntent(message)) return false;
  if (["pending_approval", "planning", "scaffolded", "ready", "failed", "deployed"].includes(project.status)) {
    return false;
  }
  return true;
}

export function sessionStatusLabel(state: BuildAppState): string {
  const labels: Record<BuildAppState, string> = {
    idle: "Ready",
    collecting_requirements: "Gathering requirements",
    planning: "App plan created",
    awaiting_scaffold_approval: "Awaiting approval",
    scaffolding: "Creating files",
    scaffolded: "Files created",
    editing: "Updating app",
    awaiting_edit_approval: "Awaiting approval",
    installing: "Installing dependencies",
    building: "Building",
    build_failed: "Build failed",
    build_passed: "Build checked",
    testing: "Running tests",
    test_failed: "Tests failed",
    test_passed: "Tests passed",
    preview_ready: "Preview ready",
    deploy_ready: "Ready to deploy",
    deploying: "Deploying",
    deployed: "Deployed",
  };
  return labels[state];
}
