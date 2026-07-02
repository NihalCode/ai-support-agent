import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { getSession, saveSession } from "@/lib/support/investigation/session-store";
import { investigationToAnalysis } from "@/lib/support/investigation/to-analysis";
import { generatePrDescription } from "@/lib/support/investigation/pr-description";
import { generatePatch } from "@/lib/support/patch";
import { executeAction } from "@/lib/support/executor";
import { getConfig } from "@/lib/support/config";
import { audit } from "@/lib/support/audit";
import { redactDeep } from "@/lib/support/redact";
import type { JiraTicketDraft } from "@/lib/support/investigation/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Action = "create-jira" | "generate-patch" | "pr-description";

interface ActionsBody {
  sessionId: string;
  action: Action;
  approved?: boolean;
}

function formatJiraDescription(draft: JiraTicketDraft): string {
  return [
    draft.summary,
    "",
    "h2. Customer impact",
    draft.customerImpact,
    "",
    "h2. Suspected root cause",
    draft.suspectedRootCause,
    "",
    draft.environment ? `*Environment:* ${draft.environment}` : "",
    draft.reproductionSteps ? `*Reproduction:* ${draft.reproductionSteps}` : "",
    "",
    "h2. Related files",
    draft.relatedFiles.map((f) => `* ${f}`).join("\n") || "None",
    "",
    "h2. Acceptance criteria",
    draft.acceptanceCriteria.map((a) => `* ${a}`).join("\n"),
    "",
    draft.questionsForCustomer.length
      ? `h2. Questions for customer\n${draft.questionsForCustomer.map((q) => `* ${q}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  let body: ActionsBody;
  try {
    body = (await req.json()) as ActionsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const perm =
    body.action === "create-jira" && body.approved
      ? SupportApiPermission.approve
      : SupportApiPermission.investigate;
  const auth = await requireSupportApi(perm, req);
  if (auth instanceof NextResponse) return auth;

  if (!body.sessionId?.trim() || !body.action) {
    return NextResponse.json({ error: "sessionId and action required" }, { status: 400 });
  }

  const ctx = await getSession(body.sessionId.trim());
  if (!ctx) {
    return NextResponse.json({ error: "Investigation session not found or expired." }, { status: 404 });
  }

  const cfg = getConfig();
  if (cfg.readOnly) {
    return NextResponse.json({ error: "Read-only mode enabled." }, { status: 403 });
  }

  try {
    switch (body.action) {
      case "create-jira": {
        if (!body.approved) {
          return NextResponse.json({ error: "Explicit approval required (approved: true)." }, { status: 403 });
        }
        const draft = ctx.report.jiraTicket;
        if (draft.status === "duplicate-blocked") {
          return NextResponse.json(
            { error: `Duplicate of existing ticket — do not create. Link to ${ctx.jira.duplicateOf}.` },
            { status: 409 }
          );
        }
        if (draft.status === "created" && draft.createdKey) {
          return NextResponse.json({ ok: true, key: draft.createdKey, url: draft.createdUrl, alreadyCreated: true });
        }

        const projectKey =
          (draft.payload?.projectKey as string | undefined) ?? cfg.jira.projectKey ?? "SUPPORT";
        const issueType = (draft.payload?.issueType as string | undefined) ?? "Bug";

        const result = await executeAction(
          {
            type: "jira-create",
            projectKey,
            summary: draft.title,
            description: formatJiraDescription(draft),
            issueType,
          },
          { approved: true }
        );

        ctx.report.jiraTicket = {
          ...draft,
          status: "created",
          createdKey: result.url?.split("/").pop() ?? undefined,
          createdUrl: result.url,
        };
        ctx.updatedAt = new Date().toISOString();
        await saveSession(ctx);

        await audit({
          action: "investigate:create-jira",
          target: result.url ?? projectKey,
          approved: true,
          details: draft.title,
        });

        return NextResponse.json({
          ok: result.ok,
          mock: result.mock,
          key: ctx.report.jiraTicket.createdKey,
          url: result.url,
          detail: result.detail,
        });
      }

      case "generate-patch": {
        let analysis = investigationToAnalysis(ctx);
        if (!analysis.retrievedContext.some((c) => c.metadata.sourceType === "code")) {
          const { resolveRepoRef } = await import("@/lib/support/connectors");
          const { retrieve } = await import("@/lib/support/retrieve");
          const { buildSearchTerms } = await import("@/lib/support/investigation/extract-query");
          const { ingestRepo } = await import("@/lib/support/ingest");
          const { ref, mock: repoMock } = resolveRepoRef(ctx.query.repoUrl);
          const terms = buildSearchTerms(ctx.query);
          let { chunks } = await retrieve(ref, terms || ctx.query.text, 12);
          if (!chunks.some((c) => c.metadata.sourceType === "code") && !repoMock) {
            try {
              await ingestRepo({
                repoUrl: `${ref.owner}/${ref.name}`,
                includeIssues: true,
                includePRs: true,
              });
              ({ chunks } = await retrieve(ref, terms || ctx.query.text, 12));
            } catch {
              /* empty */
            }
          }
          analysis = {
            ...analysis,
            retrievedContext: chunks.filter(
              (c) => c.metadata.sourceType === "code" || c.metadata.sourceType === "docs"
            ),
          };
        }
        const patch = await generatePatch({
          description: ctx.query.text,
          analysis,
        });
        if (patch) {
          ctx.fixProposal = {
            ...ctx.fixProposal,
            proposedChange: patch.diff,
            affectedFiles: patch.filePath ? [patch.filePath, ...ctx.fixProposal.affectedFiles] : ctx.fixProposal.affectedFiles,
            testPlan: patch.testsToRun,
            rollbackPlan: patch.rollbackPlan,
            fixable: true,
          };
          ctx.report.developerNotes = [
            ctx.report.developerNotes,
            "",
            "## Generated patch",
            patch.diff,
          ].join("\n");
          ctx.updatedAt = new Date().toISOString();
          await saveSession(ctx);
        }
        return NextResponse.json({ patch, fixProposal: ctx.fixProposal });
      }

      case "pr-description": {
        const description = await generatePrDescription(ctx);
        ctx.report.developerNotes = [ctx.report.developerNotes, "", "## PR description", description].join("\n");
        ctx.updatedAt = new Date().toISOString();
        await saveSession(ctx);
        return NextResponse.json({ description });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(req.url).searchParams.get("sessionId");
  if (!id) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  const ctx = await getSession(id);
  if (!ctx) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(redactDeep({ context: ctx, report: ctx.report }));
}
