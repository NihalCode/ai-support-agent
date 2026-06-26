import { NextResponse } from "next/server";
import {
  handleBuildAppPlan,
  handleBuildAppDeploy,
  requestScaffoldApproval,
  requestWriteApproval,
  requestDeployApproval,
  applyApprovedBuildAction,
} from "@/lib/support/build-app/orchestrate";
import {
  getProject,
  listProjects,
  applyFileChanges,
  restoreProjectFromSnapshot,
} from "@/lib/support/build-app/project-store";
import { listTemplates } from "@/lib/support/build-app/templates";
import { runProjectBuild } from "@/lib/support/build-app/deploy";
import { getApproval, setApprovalStatus } from "@/lib/support/approvals";
import { executeAction } from "@/lib/support/executor";
import { redact } from "@/lib/support/redact";
import { getConfig } from "@/lib/support/config";
import { audit } from "@/lib/support/audit";
import type { BuildAppCredentials } from "@/lib/support/build-app/credentials";
import type { BuildAppProject } from "@/lib/support/build-app/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Resolve a project by id. If the serverless container lost it from /tmp,
 * restore it from the client-supplied snapshot (re-writes scaffolded files).
 */
function ensureProject(id: string, snapshot?: BuildAppProject | null): BuildAppProject | null {
  const found = getProject(id);
  if (found) return found;
  if (snapshot && snapshot.id === id) {
    try {
      return restoreProjectFromSnapshot(snapshot);
    } catch {
      return null;
    }
  }
  return null;
}

type Body =
  | { action: "plan"; message: string; templateOverride?: string }
  | { action: "apply"; projectId: string; approvalId?: string; force?: boolean; userConfirmed?: boolean; projectSnapshot?: BuildAppProject }
  | { action: "build"; projectId: string; projectSnapshot?: BuildAppProject }
  | { action: "deploy"; projectId: string; target?: "preview" | "production"; approvalId?: string; userConfirmed?: boolean; credentials?: BuildAppCredentials; projectSnapshot?: BuildAppProject }
  | { action: "commit"; projectId: string; message?: string; branch?: string; userConfirmed?: boolean; credentials?: BuildAppCredentials; projectSnapshot?: BuildAppProject }
  | { action: "edit"; projectId: string; message: string; projectSnapshot?: BuildAppProject }
  | { action: "approve-and-run"; approvalId: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (projectId) {
    const project = getProject(projectId);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ project });
  }
  return NextResponse.json({ projects: listProjects(), templates: listTemplates() });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "plan": {
        const result = handleBuildAppPlan({
          message: body.message,
          templateOverride: body.templateOverride as never,
        });
        const approval = requestScaffoldApproval(
          result.project!.id,
          result.approvalPreview ?? "Scaffold app files"
        );
        return NextResponse.json({ ...result, approvalId: approval.id });
      }

      case "edit": {
        // Restore project if container lost it.
        const snapshot = "projectSnapshot" in body ? body.projectSnapshot : undefined;
        ensureProject(body.projectId, snapshot);

        const result = handleBuildAppPlan({ message: body.message, projectId: body.projectId });
        if (result.needsApproval && result.pendingChanges?.length) {
          const approval = requestWriteApproval(
            body.projectId,
            result.pendingChanges.map((c) => c.path),
            result.approvalPreview ?? "Apply edits"
          );
          return NextResponse.json({ ...result, approvalId: approval.id });
        }
        return NextResponse.json(result);
      }

      case "apply": {
        const snapshot = "projectSnapshot" in body ? body.projectSnapshot : undefined;
        const project = ensureProject(body.projectId, snapshot);
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

        const cfg = getConfig();
        if (cfg.readOnly) {
          return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
        }

        if (body.userConfirmed) {
          if (!project.pendingChanges?.length) {
            return NextResponse.json({ error: "Nothing to apply" }, { status: 400 });
          }
          applyFileChanges(body.projectId, project.pendingChanges);
          await audit({
            action: "write:build-app-scaffold",
            target: body.projectId,
            approved: true,
            provider: "build-app",
            details: `User confirmed apply of ${project.pendingChanges.length} file(s)`,
          });
          return NextResponse.json({ ok: true, project: getProject(body.projectId) });
        }

        if (body.approvalId) {
          const approval = getApproval(body.approvalId);
          if (!approval || approval.status !== "approved") {
            return NextResponse.json({ error: "Approval required" }, { status: 403 });
          }
          const detail = await applyApprovedBuildAction(approval.action as { type: string; projectId: string });
          setApprovalStatus(body.approvalId, "executed", detail);
          return NextResponse.json({ ok: true, detail, project: getProject(body.projectId) });
        }

        if (process.env.TEST_MODE === "true" && body.force) {
          applyFileChanges(body.projectId, project.pendingChanges);
          return NextResponse.json({ ok: true, project: getProject(body.projectId) });
        }

        return NextResponse.json({ error: "approvalId or userConfirmed required" }, { status: 403 });
      }

      case "build": {
        const snapshot = "projectSnapshot" in body ? body.projectSnapshot : undefined;
        const restored = ensureProject(body.projectId, snapshot);
        if (!restored) return NextResponse.json({ error: "Project not found — please re-scaffold." }, { status: 404 });

        const build = await runProjectBuild(body.projectId);
        return NextResponse.json({
          ok: build.ok,
          buildOk: build.buildOk,
          testOk: build.testOk,
          preflightOk: build.preflightOk,
          output: build.output,
          classification: build.classification,
          project: getProject(body.projectId),
        });
      }

      case "deploy": {
        const snapshot = "projectSnapshot" in body ? body.projectSnapshot : undefined;
        const restored = ensureProject(body.projectId, snapshot);
        if (!restored) return NextResponse.json({ error: "Project not found — please re-scaffold." }, { status: 404 });

        const deployPlan = await handleBuildAppDeploy(
          body.projectId,
          body.target ?? "preview",
          body.credentials
        );
        const cfg = getConfig();
        if (cfg.readOnly) {
          return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
        }

        if (body.userConfirmed) {
          if (deployPlan.buildOk === false) {
            return NextResponse.json({ ...deployPlan, error: "Fix build errors before deploying." }, { status: 400 });
          }
          const detail = await applyApprovedBuildAction(
            {
              type: "build-app-deploy",
              projectId: body.projectId,
              target: body.target ?? "preview",
            },
            body.credentials
          );
          await audit({
            action: "write:build-app-deploy",
            target: body.projectId,
            approved: true,
            provider: "build-app",
            details: detail.slice(0, 200),
          });
          return NextResponse.json({ ...deployPlan, ok: true, detail, project: getProject(body.projectId) });
        }

        if (!body.approvalId) {
          const approval = requestDeployApproval(
            body.projectId,
            body.target ?? "preview",
            deployPlan.explanation
          );
          return NextResponse.json({ ...deployPlan, approvalId: approval.id });
        }
        const exec = await executeAction(
          { type: "build-app-deploy", projectId: body.projectId, target: body.target ?? "preview" },
          { approved: true }
        );
        return NextResponse.json({ ...exec, project: getProject(body.projectId) });
      }

      case "approve-and-run": {
        const approval = getApproval(body.approvalId);
        if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
        setApprovalStatus(body.approvalId, "approved");
        const exec = await executeAction(approval.action, { approved: true });
        setApprovalStatus(body.approvalId, "executed", exec.detail);
        return NextResponse.json(exec);
      }

      case "commit": {
        const { commitBuildAppProject } = await import("@/lib/support/build-app/git");
        const snapshot = "projectSnapshot" in body ? body.projectSnapshot : undefined;
        const project = ensureProject(body.projectId, snapshot);
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
        if (!body.userConfirmed) {
          return NextResponse.json({ error: "userConfirmed required" }, { status: 403 });
        }
        const detail = await commitBuildAppProject(
          body.projectId,
          body.message ?? `Build App: ${project.name}`,
          body.branch,
          body.credentials
        );
        await audit({
          action: "write:build-app-git-commit",
          target: body.projectId,
          approved: true,
          provider: "build-app",
          details: detail.slice(0, 200),
        });
        return NextResponse.json({ ok: true, detail, project: getProject(body.projectId) });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : "Failed") }, { status: 500 });
  }
}
