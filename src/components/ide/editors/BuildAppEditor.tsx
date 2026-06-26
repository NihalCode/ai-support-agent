"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BuildAppFileChange, BuildAppProject } from "@/lib/support/build-app/types";
import type { BuildAppHandoffMode } from "@/lib/support/build-app/handoff";
import { workflowLabel, workflowStateFromProject } from "@/lib/support/build-app/workflow-state";
import { useWorkspace } from "../WorkspaceProvider";
import { BuildAppChat, type BuildAppChatMessage } from "./BuildAppChat";

export interface BuildAppEditorProps {
  projectId?: string;
  initialMessage?: string;
  initialTicketId?: string;
  initialTemplateId?: string;
  autoStart?: boolean;
  mode?: BuildAppHandoffMode;
}

type BuildStep = "describe" | "review" | "create" | "test" | "share";

function stepFromProject(project: BuildAppProject | null, approvalId: string | null): BuildStep {
  if (!project) return approvalId ? "review" : "describe";
  if (project.previewUrl) return "share";
  if (project.buildOk === false) return "test";
  if (project.status === "ready" && project.buildOk) return "share";
  if (project.status === "scaffolded" || project.status === "ready" || project.status === "failed") return "test";
  if (approvalId || project.status === "pending_approval") return "review";
  return "describe";
}

const STEP_LABELS: Record<BuildStep, string> = {
  describe: "Tell me what you want",
  review: "Review the plan",
  create: "Create the app files",
  test: "Test the app",
  share: "Share a link",
};

function plainExplanation(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/Optional clarifications:\n[\s\S]*?(?=\n\n|$)/i, "")
    .trim();
}

function extractQuickReplies(explanation: string, planQuestions?: string[]): string[] {
  const replies: string[] = [];
  if (planQuestions?.length) {
    replies.push("CTIX for analysts", "Read-only is fine", "Yes, include search and a table");
    return replies.slice(0, 3);
  }
  if (/which cyware product/i.test(explanation)) replies.push("Use CTIX");
  if (/who will use/i.test(explanation)) replies.push("Our security analysts");
  if (/read-only|write actions/i.test(explanation)) replies.push("Read-only is fine");
  return replies.slice(0, 3);
}

/** Heuristic: looks like a standalone Vercel or GitHub token. */
function looksLikeToken(text: string): string | null {
  const t = text.trim();
  // Vercel tokens: ~24 alphanumeric chars; also accept "vercel: <token>" patterns
  const vercelMatch = t.match(/(?:^|vercel[:\s]+)([A-Za-z0-9_\-]{20,80})$/i);
  if (vercelMatch) return vercelMatch[1];
  // Single word that looks like an opaque token
  if (/^[A-Za-z0-9_\-]{20,80}$/.test(t) && !/\s/.test(t)) return t;
  return null;
}

export function BuildAppEditor({
  projectId: initialProjectId,
  initialMessage,
  initialTicketId,
  initialTemplateId,
  autoStart,
  mode = "plan",
}: BuildAppEditorProps) {
  const { setActiveBuildProject, setProblems, state } = useWorkspace();
  const [chatMessages, setChatMessages] = useState<BuildAppChatMessage[]>([]);
  const [ticketId, setTicketId] = useState(initialTicketId ?? "");
  const [suggestedTemplateId, setSuggestedTemplateId] = useState(initialTemplateId ?? "");
  const [project, setProject] = useState<BuildAppProject | null>(null);
  const [pendingChanges, setPendingChanges] = useState<BuildAppFileChange[]>([]);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildOutput, setBuildOutput] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);
  // awaiting token means build passed and we've asked the user for their Vercel token in chat
  const [awaitingVercelToken, setAwaitingVercelToken] = useState(false);
  // in-memory only: never written to localStorage
  const [vercelToken, setVercelToken] = useState("");
  const autoStartedRef = useRef(false);
  const seededRef = useRef(false);

  const step = stepFromProject(project, approvalId);
  const workflowState = workflowStateFromProject(project, { awaitingApproval: Boolean(approvalId) });

  const syncBuildProblem = useCallback(
    (message: string | null) => {
      const rest = state.problems.filter((p) => p.id !== "build-app-build");
      if (message) {
        setProblems([...rest, { id: "build-app-build", severity: "error", message }]);
      } else {
        setProblems(rest);
      }
    },
    [setProblems, state.problems]
  );

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/support/build-app?projectId=${encodeURIComponent(id)}`);
    const data = (await res.json()) as { project?: BuildAppProject };
    if (data.project) setProject(data.project);
  }, []);

  useEffect(() => {
    if (initialProjectId) void loadProject(initialProjectId);
  }, [initialProjectId, loadProject]);

  useEffect(() => { if (initialTicketId) setTicketId(initialTicketId); }, [initialTicketId]);
  useEffect(() => { if (initialTemplateId) setSuggestedTemplateId(initialTemplateId); }, [initialTemplateId]);

  const conversationText = useCallback(
    (extraUserMessage?: string) => {
      const userLines = chatMessages.filter((m) => m.role === "user").map((m) => m.content);
      if (extraUserMessage) userLines.push(extraUserMessage);
      const body = userLines.join("\n\n");
      if (ticketId.trim()) return `[Jira ticket ${ticketId.trim()}]\n${body}`;
      return body;
    },
    [chatMessages, ticketId]
  );

  const pushAssistant = useCallback((content: string) => {
    setChatMessages((prev) => [
      ...prev,
      { role: "assistant", content: plainExplanation(content), at: new Date().toISOString() },
    ]);
  }, []);

  // --- deploy with any token we have ---
  const requestDeploy = useCallback(
    async (target: "preview" | "production", tokenOverride?: string) => {
      if (!project) return;
      if (project.buildOk !== true) {
        setError("Build must pass before getting a preview link.");
        pushAssistant("Build must pass first. Click Test my app and fix any errors, then I'll deploy.");
        return;
      }
      const tok = (tokenOverride ?? vercelToken ?? "").trim();
      setLoading(true);
      setError(null);
      setAwaitingVercelToken(false);
      try {
        pushAssistant(tok ? "Deploying to Vercel…" : "Creating a demo preview link…");
        const res = await fetch("/api/support/build-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deploy",
            projectId: project.id,
            target,
            userConfirmed: true,
            projectSnapshot: project,
            credentials: tok ? { vercelToken: tok } : undefined,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean; error?: string; detail?: string; explanation?: string;
          project?: BuildAppProject; buildOutput?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Deploy failed");
        setBuildOutput(data.buildOutput ?? data.detail ?? "");
        const fresh = data.project;
        if (fresh) setProject(fresh);
        const url = fresh?.previewUrl ?? project.previewUrl;
        const isMock = fresh?.deployments?.[0]?.mock ?? !tok;
        pushAssistant(
          url
            ? isMock
              ? `Demo preview (no Vercel token used): ${url}\n\nTo get a real Vercel URL, paste your token from vercel.com/account/tokens in the chat.`
              : `Your preview is live: ${url}\n\nShare this with your team.`
            : (data.detail ?? "Deployment finished.")
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Deploy failed";
        setError(msg);
        pushAssistant(`Deploy failed: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [project, vercelToken, pushAssistant]
  );

  const runAgent = useCallback(
    async (userText: string, opts?: { silentUser?: boolean }) => {
      const text = conversationText(userText);
      if (!text.trim()) return;

      if (!opts?.silentUser) {
        setChatMessages((prev) => [...prev, { role: "user", content: userText, at: new Date().toISOString() }]);
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/support/build-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            project
              ? { action: "edit", projectId: project.id, message: userText, projectSnapshot: project }
              : { action: "plan", message: text, templateOverride: suggestedTemplateId || undefined }
          ),
        });
        const data = (await res.json()) as {
          ok?: boolean; error?: string; explanation?: string;
          pendingChanges?: BuildAppFileChange[]; approvalId?: string; project?: BuildAppProject;
        };
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");

        pushAssistant(data.explanation ?? "Done.");
        setPendingChanges(data.pendingChanges ?? []);
        setApprovalId(data.approvalId ?? null);

        if (data.project) {
          setProject(data.project);
          setActiveBuildProject(data.project.id);
        }

        if (data.approvalId && data.pendingChanges?.length) {
          const isEditFlow = Boolean(project) && (project?.appliedChanges?.length ?? 0) > 0;
          pushAssistant(
            isEditFlow
              ? `Review the ${data.pendingChanges.length} file change(s) below and click "Apply changes" when ready.`
              : `When you're happy with the plan, click "Yes, create my app" below. I'll set up ${data.pendingChanges.length} file(s) — nothing goes live until you approve.`
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(msg);
        pushAssistant(`Sorry — ${msg}. Try rephrasing or click the button again.`);
      } finally {
        setLoading(false);
      }
    },
    [conversationText, project, suggestedTemplateId, setActiveBuildProject, pushAssistant]
  );

  useEffect(() => {
    if (seededRef.current || !initialMessage?.trim()) return;
    seededRef.current = true;
    setChatMessages([{ role: "user", content: initialMessage.trim(), at: new Date().toISOString() }]);
  }, [initialMessage]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;

    if (mode === "deploy") {
      if (!project) {
        if (initialProjectId) void loadProject(initialProjectId);
        return;
      }
      autoStartedRef.current = true;
      const target = /\bprod(uction)?\b/i.test(initialMessage ?? "") ? "production" : "preview";
      void requestDeploy(target);
      return;
    }

    if (!initialMessage?.trim()) return;
    autoStartedRef.current = true;
    void runAgent(initialMessage.trim(), { silentUser: true });
  }, [autoStart, mode, initialMessage, runAgent, project, initialProjectId, loadProject, requestDeploy]);

  // --- chat send: routes deploy, approval, token, and normal messages ---
  async function handleChatSend(text: string) {
    const lower = text.toLowerCase().trim();

    // Detect a pasted Vercel token (in context of deploying)
    const tok = looksLikeToken(text);
    if (tok && project?.buildOk === true) {
      setChatMessages((prev) => [...prev, { role: "user", content: "••••••••••••• (token)", at: new Date().toISOString() }]);
      setVercelToken(tok);
      setAwaitingVercelToken(false);
      await requestDeploy("preview", tok);
      return;
    }

    // Deploy intent
    if (/\b(deploy|preview link|share|publish|get a link)\b/i.test(lower) && project) {
      setChatMessages((prev) => [...prev, { role: "user", content: text, at: new Date().toISOString() }]);
      if (project.buildOk !== true) {
        pushAssistant("I need to run a test build first. Click **Test my app** below.");
        return;
      }
      if (!vercelToken) {
        setAwaitingVercelToken(true);
        pushAssistant(
          "Ready to deploy! Paste your Vercel token in the chat and I'll create a real preview link.\n\nGet one at vercel.com/account/tokens (needs no special scope — just an account token).\n\nOr just say \"skip\" to get a demo link without a token."
        );
        return;
      }
      await requestDeploy(/\bprod(uction)?\b/i.test(lower) ? "production" : "preview");
      return;
    }

    // "skip token" → demo deploy
    if (awaitingVercelToken && /\b(skip|no token|demo|without|mock)\b/i.test(lower)) {
      setChatMessages((prev) => [...prev, { role: "user", content: text, at: new Date().toISOString() }]);
      await requestDeploy("preview", "");
      return;
    }

    // Approve scaffold
    if (/\b(yes|build it|create it|go ahead|approve)\b/i.test(lower) && (approvalId || pendingChanges.length > 0)) {
      setChatMessages((prev) => [...prev, { role: "user", content: text, at: new Date().toISOString() }]);
      await approveAndApply();
      return;
    }

    await runAgent(text);
  }

  async function approveAndApply() {
    if (!project) return;
    const isEdit = (project.appliedChanges?.length ?? 0) > 0;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", projectId: project.id, userConfirmed: true, projectSnapshot: project }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; project?: BuildAppProject };
      if (!res.ok) throw new Error(data.error ?? "Could not apply changes");
      const fresh = data.project;
      if (fresh) setProject(fresh);
      setPendingChanges([]);
      setApprovalId(null);

      if (isEdit) {
        pushAssistant("Changes applied. Running a test build…");
        setLoading(false);
        await runBuildAfterEdit(fresh ?? project);
        return;
      }

      pushAssistant("Done — your app files are created. Click Test my app when you're ready, or ask me to change anything.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not apply changes";
      setError(msg);
      pushAssistant(`Sorry, I couldn't apply the changes: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function runBuildAfterEdit(proj: BuildAppProject) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", projectId: proj.id, projectSnapshot: proj }),
      });
      const data = (await res.json()) as {
        ok?: boolean; error?: string; output?: string;
        buildOk?: boolean; classification?: { summary?: string; suggestedFix?: string };
        project?: BuildAppProject;
      };
      setBuildOutput(data.output ?? data.error ?? "");
      if (data.project) setProject(data.project);

      const passed = res.ok && data.ok === true && data.buildOk === true;
      if (!passed) {
        const summary = data.classification?.summary ?? data.error ?? "Build failed.";
        setError(summary);
        syncBuildProblem(summary);
        pushAssistant(`I updated the UI, but the build failed: ${summary}`);
        return;
      }

      syncBuildProblem(null);
      pushAssistant("Done. Build passed — preview is ready when you want to deploy.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Build failed";
      setError(msg);
      syncBuildProblem(msg);
      pushAssistant(`Build failed after edit: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function runBuild() {
    if (!project) return;
    setLoading(true);
    setError(null);
    pushAssistant("Installing dependencies and running a test build in your generated app folder…");
    try {
      const res = await fetch("/api/support/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", projectId: project.id, projectSnapshot: project }),
      });
      const data = (await res.json()) as {
        ok?: boolean; error?: string; output?: string;
        buildOk?: boolean; classification?: { summary?: string; suggestedFix?: string };
        project?: BuildAppProject;
      };
      setBuildOutput(data.output ?? data.error ?? "");
      if (data.project) setProject(data.project);

      const passed = res.ok && data.ok === true && data.buildOk === true;
      if (!passed) {
        const summary = data.classification?.summary ?? data.error ?? "Build failed.";
        const fix = data.classification?.suggestedFix;
        setError(summary);
        syncBuildProblem(summary);
        pushAssistant(
          [summary, fix, "Open Show technical details below for the full command log."].filter(Boolean).join("\n\n")
        );
        return;
      }

      syncBuildProblem(null);
      const isMock = data.output?.includes("[MOCK]");
      if (isMock) {
        setAwaitingVercelToken(false);
        pushAssistant(
          "Test build passed (mock mode — no real compile on Vercel serverless).\n\nType deploy in the chat to get a link. Paste your Vercel token from vercel.com/account/tokens to get a real preview URL, or say skip for a demo link."
        );
      } else {
        setAwaitingVercelToken(false);
        pushAssistant(
          "Build passed! Type deploy in the chat when you're ready. Paste your Vercel token to get a real preview link, or say skip for a demo."
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Build failed";
      setError(msg);
      syncBuildProblem(msg);
      pushAssistant(`Build failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  const quickReplies = useMemo(
    () => extractQuickReplies(chatMessages.at(-1)?.content ?? "", project?.plan?.clarifyingQuestions),
    [chatMessages, project?.plan?.clarifyingQuestions]
  );

  const isEditApproval =
    Boolean(project) &&
    (project?.appliedChanges?.length ?? 0) > 0 &&
    pendingChanges.length > 0;

  const headerHint = !project
    ? "Describe the app you want to build. I'll pick the right template, connect APIs, generate files, test, and prepare a preview."
    : isEditApproval || pendingChanges.length > 0
      ? "Review the proposed changes and apply when ready."
      : "Tell me what to change — e.g. \"make it cleaner,\" \"add a filter,\" or \"remove that text.\"";

  const chatPlaceholder = !project
    ? "Describe the app you want to build…"
    : awaitingVercelToken
      ? "Paste Vercel token here, or say skip for a demo link…"
      : "Tell me what to change in this app…";
  const files = project?.files ?? pendingChanges.map((c) => c.path);
  const diffContent = pendingChanges.find((c) => c.path === selectedFile);
  const templateLabel = (suggestedTemplateId || project?.templateId)?.replace(/-/g, " ");

  return (
    <div data-testid="build-app-workspace" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, minHeight: 560, fontSize: 13 }}>
      <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <header style={{ marginBottom: 12 }}>
          <h2 style={{ margin: "0 0 4px" }}>App Builder</h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>
            {headerHint}
          </p>
          <div data-testid="build-app-steps" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {(Object.keys(STEP_LABELS) as BuildStep[]).map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 12,
                  background: step === s ? "var(--accent)" : "var(--surface-2)",
                  color: step === s ? "#fff" : "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {STEP_LABELS[s]}
              </span>
            ))}
          </div>
          <p data-testid="build-app-workflow-state" style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            Status: {workflowLabel(workflowState)}
            {project?.buildOk === false ? " — fix build errors before preview or deploy." : ""}
          </p>
        </header>

        {templateLabel && !project && (
          <p data-testid="build-app-suggested-template" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
            Starting point: <strong>{templateLabel}</strong>
          </p>
        )}

        <div style={{ flex: 1, minHeight: 360 }}>
          <BuildAppChat
            messages={chatMessages}
            onSend={(t) => void handleChatSend(t)}
            loading={loading}
            quickReplies={approvalId ? undefined : quickReplies}
            placeholder={chatPlaceholder}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {(approvalId || (pendingChanges.length > 0 && project)) && (
            <button
              type="button"
              data-testid="build-app-approve"
              onClick={() => void approveAndApply()}
              disabled={loading}
              style={btnPrimary}
            >
              {isEditApproval ? "Apply changes" : `Yes, create my app (${pendingChanges.length} files)`}
            </button>
          )}
          {(project?.status === "scaffolded" || project?.status === "ready" || project?.status === "failed") && (
            <>
              <button
                type="button"
                data-testid="build-app-build"
                onClick={() => void runBuild()}
                disabled={loading}
                style={btnSecondary}
              >
                Test my app
              </button>
              {project.buildOk === true && (
                <button
                  type="button"
                  data-testid="build-app-deploy-preview"
                  onClick={() => void requestDeploy("preview")}
                  disabled={loading}
                  style={btnSecondary}
                >
                  Get a preview link
                </button>
              )}
            </>
          )}
        </div>

        {error && <p style={{ color: "var(--red)", marginTop: 8, fontSize: 12 }}>{error}</p>}

        {/* Hidden inputs for E2E tests */}
        <input
          type="hidden"
          data-testid="build-app-input"
          value={chatMessages.find((m) => m.role === "user")?.content ?? initialMessage ?? ""}
          readOnly
        />
        <pre data-testid="build-app-explanation" style={{ display: "none" }}>
          {chatMessages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n")}
        </pre>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>Optional: link a support ticket</summary>
          <input
            data-testid="build-app-ticket"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="e.g. AISUP-123"
            style={{ width: "100%", maxWidth: 220, marginTop: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", color: "var(--text)", fontFamily: "inherit" }}
          />
        </details>

        {/* Hidden plan button for tests */}
        <button
          type="button"
          data-testid="build-app-plan"
          onClick={() => void runAgent(conversationText() || "Build my app")}
          disabled={loading}
          style={{ ...btnSecondary, marginTop: 8, display: "none" }}
        >
          Generate plan
        </button>

        {project?.previewUrl && (
          <p data-testid="build-app-preview-url" style={{ marginTop: 12, fontSize: 12 }}>
            Preview:{" "}
            <a href={project.previewUrl} target="_blank" rel="noreferrer">{project.previewUrl}</a>
            {project.deployments[0]?.mock ? " (demo link)" : ""}
          </p>
        )}

        {buildOutput && (
          <pre
            data-testid="build-app-output"
            style={{
              display: showTechnical || project?.buildOk === false ? "block" : "none",
              whiteSpace: "pre-wrap",
              background: "var(--surface-2)",
              padding: 12,
              borderRadius: 8,
              marginTop: 12,
              maxHeight: 160,
              overflow: "auto",
              fontSize: 11,
              border: project?.buildOk === false ? "1px solid var(--red)" : "1px solid var(--border)",
            }}
          >
            {buildOutput}
          </pre>
        )}
      </section>

      {/* Sidebar */}
      <aside style={{ borderLeft: "1px solid var(--border)", paddingLeft: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>What&apos;s next</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 12, lineHeight: 1.7 }}>
          {step === "describe" && (
            <>
              <li>Describe the app in the chat</li>
              <li>Answer any quick questions</li>
              <li>Review the plan when it&apos;s ready</li>
            </>
          )}
          {step === "review" && (
            <>
              <li>Read my summary in the chat</li>
              <li>Reply if you want changes</li>
              <li>Click &quot;Yes, create my app&quot; when ready</li>
            </>
          )}
          {step === "test" && (
            <>
              <li>Files are ready — ask for changes in chat</li>
              <li>Click Test my app to verify</li>
              <li>Type &quot;deploy&quot; in chat when done</li>
              <li>Paste your Vercel token when prompted</li>
            </>
          )}
          {step === "share" && (
            <>
              <li>Share the preview link with your team</li>
              <li>Ask me to adjust the app in chat</li>
            </>
          )}
        </ul>

        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          style={{ ...btnSecondary, width: "100%", marginTop: 16, fontSize: 11 }}
        >
          {showTechnical ? "Hide technical details" : "Show technical details"}
        </button>

        {showTechnical && (
          <div data-testid="build-app-diff-panel" style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 12 }}>Files</strong>
            <ul style={{ listStyle: "none", padding: 0, marginTop: 6, maxHeight: 120, overflow: "auto" }}>
              {files.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    data-testid={`build-app-file-${f.replace(/\//g, "-")}`}
                    onClick={() => setSelectedFile(f)}
                    style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 11, padding: "2px 0", textAlign: "left", width: "100%" }}
                  >
                    {f}
                  </button>
                </li>
              ))}
            </ul>
            {diffContent && (
              <pre style={{ fontSize: 10, overflow: "auto", maxHeight: 200, marginTop: 8 }}>
                {diffContent.content?.slice(0, 2000)}
              </pre>
            )}
          </div>
        )}

        {/* Token input for accessibility / non-chat flow */}
        {project?.buildOk === true && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 11 }}>
              Vercel token (optional)
            </summary>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0" }}>
              Or paste in the chat. Memory only — never saved.
            </p>
            <input
              type="password"
              autoComplete="off"
              data-testid="build-app-vercel-token"
              value={vercelToken}
              onChange={(e) => setVercelToken(e.target.value)}
              placeholder="From vercel.com/account/tokens"
              style={{ display: "block", width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", color: "var(--text)", fontFamily: "inherit", fontSize: 12, marginTop: 4 }}
            />
          </details>
        )}
      </aside>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 13,
};
