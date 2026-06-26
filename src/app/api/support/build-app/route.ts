import { NextResponse } from "next/server";
import {
  handleBuildAppPlan,
  handleBuildAppDeploy,
  requestScaffoldApproval,
  requestWriteApproval,
  requestDeployApproval,
  applyApprovedBuildAction,
} from "@/lib/support/build-app/orchestrate";
import { getProject, listProjects } from "@/lib/support/build-app/project-store";
import { listTemplates } from "@/lib/support/build-app/templates";
import { applyFileChanges } from "@/lib/support/build-app/project-store";
import { runProjectBuild } from "@/lib/support/build-app/deploy";
import { getApproval, setApprovalStatus } from "@/lib/support/approvals";
import { executeAction } from "@/lib/support/executor";
import { redact } from "@/lib/support/redact";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body =
  | { action: "plan"; message: string; templateOverride?: string }
  | { action: "apply"; projectId: string; approvalId?: string; force?: boolean }
  | { action: "build"; projectId: string }
  | { action: "deploy"; projectId: string; target?: "preview" | "production"; approvalId?: string }
  | { action: "edit"; projectId: string; message: string }
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
        const project = getProject(body.projectId);
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

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

        return NextResponse.json({ error: "approvalId required" }, { status: 403 });
      }

      case "build": {
        const build = await runProjectBuild(body.projectId);
        return NextResponse.json({ ...build, project: getProject(body.projectId) });
      }

      case "deploy": {
        const deployPlan = await handleBuildAppDeploy(body.projectId, body.target ?? "preview");
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

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : "Failed") }, { status: 500 });
  }
}
