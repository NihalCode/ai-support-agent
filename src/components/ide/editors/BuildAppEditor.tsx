"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BuildAppFileChange, BuildAppProject } from "@/lib/support/build-app/types";
import type { BuildAppHandoffMode } from "@/lib/support/build-app/handoff";
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
  if (project.status === "scaffolded" || project.status === "ready") return "test";
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

export function BuildAppEditor({
  projectId: initialProjectId,
  initialMessage,
  initialTicketId,
  initialTemplateId,
  autoStart,
  mode = "plan",
}: BuildAppEditorProps) {
  const { setActiveBuildProject } = useWorkspace();
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
  const autoStartedRef = useRef(false);
  const seededRef = useRef(false);

  const step = stepFromProject(project, approvalId);

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/support/build-app?projectId=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data.project) setProject(data.project);
  }, []);

  useEffect(() => {
    if (initialProjectId) void loadProject(initialProjectId);
  }, [initialProjectId, loadProject]);

  useEffect(() => {
    if (initialTicketId) setTicketId(initialTicketId);
  }, [initialTicketId]);

  useEffect(() => {
    if (initialTemplateId) setSuggestedTemplateId(initialTemplateId);
  }, [initialTemplateId]);

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

  const runAgent = useCallback(
    async (userText: string, opts?: { silentUser?: boolean }) => {
      if (!opts?.silentUser) {
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: userText, at: new Date().toISOString() },
        ]);
      }

      const text = conversationText(opts?.silentUser ? userText : undefined);
      if (!text.trim()) return;

      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/support/build-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            project
              ? { action: "edit", projectId: project.id, message: userText }
              : {
                  action: "plan",
                  message: text,
                  templateOverride: suggestedTemplateId || undefined,
                }
          ),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");

        const explanation = data.explanation ?? "Done.";
        pushAssistant(explanation);
        setPendingChanges(data.pendingChanges ?? []);
        setApprovalId(data.approvalId ?? null);

        if (data.project) {
          setProject(data.project);
          setActiveBuildProject(data.project.id);
          void loadProject(data.project.id);
        }

        if (data.approvalId && data.pendingChanges?.length) {
          pushAssistant(
            `When you're happy with the plan, click **Yes, create my app** below. I'll set up ${data.pendingChanges.length} file(s) for you — nothing goes live until you approve.`
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(msg);
        pushAssistant(`Sorry — I hit a problem: ${msg}. You can try again or rephrase your request.`);
      } finally {
        setLoading(false);
      }
    },
    [conversationText, project, suggestedTemplateId, loadProject, setActiveBuildProject, pushAssistant]
  );

  const requestDeploy = useCallback(
    async (target: "preview" | "production") => {
      if (!project) return;
      setLoading(true);
      setError(null);
      try {
        pushAssistant(target === "production" ? "Getting a live link ready…" : "Creating a preview link for you…");
        const planRes = await fetch("/api/support/build-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "deploy", projectId: project.id, target }),
        });
        const planData = await planRes.json();
        if (!planRes.ok) throw new Error(planData.error ?? "Deploy failed");
        setBuildOutput(planData.buildOutput ?? planData.explanation ?? "");
        if (!planData.approvalId) return;
        const depRes = await fetch("/api/support/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "approve", id: planData.approvalId }),
        });
        const depData = await depRes.json();
        if (!depRes.ok) throw new Error(depData.error ?? "Deploy failed");
        await loadProject(project.id);
        const url = depData.result?.url ?? project.previewUrl;
        pushAssistant(
          url
            ? `Your preview link is ready: ${url}\nShare this with your team to try the app.`
            : (depData.result?.detail ?? "Deployment finished.")
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Deploy failed";
        setError(msg);
        pushAssistant(`I couldn't deploy yet: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [project, loadProject, pushAssistant]
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

  async function handleChatSend(text: string) {
    const lower = text.toLowerCase();
    if (/\b(deploy|preview link|share|publish)\b/i.test(lower) && project) {
      setChatMessages((prev) => [...prev, { role: "user", content: text, at: new Date().toISOString() }]);
      const target = /\bprod(uction)?\b/i.test(lower) ? "production" : "preview";
      await requestDeploy(target);
      return;
    }
    if (/\b(yes|build it|create it|go ahead|approve)\b/i.test(lower) && approvalId) {
      setChatMessages((prev) => [...prev, { role: "user", content: text, at: new Date().toISOString() }]);
      await approveAndApply();
      return;
    }
    await runAgent(text);
  }

  async function approveAndApply() {
    if (!project || !approvalId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "approve", id: approvalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create files");
      setPendingChanges([]);
      setApprovalId(null);
      await loadProject(project.id);
      pushAssistant("Done — your app files are created. Click **Test my app** when you're ready, or ask me to change anything.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create files");
    } finally {
      setLoading(false);
    }
  }

  async function runBuild() {
    if (!project) return;
    setLoading(true);
    pushAssistant("Running a quick test build to make sure everything works…");
    try {
      const res = await fetch("/api/support/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", projectId: project.id }),
      });
      const data = await res.json();
      setBuildOutput(data.output ?? "");
      if (data.project) setProject(data.project);
      pushAssistant(
        data.buildOk === false
          ? "The test build found issues — see the technical details below. Tell me what you'd like fixed."
          : "Test build passed. Ask me for a preview link whenever you want to share it with your team."
      );
    } finally {
      setLoading(false);
    }
  }

  const quickReplies = useMemo(
    () => extractQuickReplies(chatMessages.at(-1)?.content ?? "", project?.plan?.clarifyingQuestions),
    [chatMessages, project?.plan?.clarifyingQuestions]
  );

  const files = project?.files ?? pendingChanges.map((c) => c.path);
  const diffContent = pendingChanges.find((c) => c.path === selectedFile);
  const templateLabel = (suggestedTemplateId || project?.templateId)?.replace(/-/g, " ");

  return (
    <div data-testid="build-app-workspace" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, minHeight: 560, fontSize: 13 }}>
      <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <header style={{ marginBottom: 12 }}>
          <h2 style={{ margin: "0 0 4px" }}>App Builder</h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>
            Describe what you need in plain English — I'll build it step by step and ask if anything is unclear.
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
            placeholder="Tell me about the app, or answer a question…"
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {approvalId && (
            <button
              type="button"
              data-testid="build-app-approve"
              onClick={() => void approveAndApply()}
              disabled={loading}
              style={btnPrimary}
            >
              Yes, create my app ({pendingChanges.length} files)
            </button>
          )}
          {(project?.status === "scaffolded" || project?.status === "ready") && (
            <>
              <button type="button" data-testid="build-app-build" onClick={() => void runBuild()} disabled={loading} style={btnSecondary}>
                Test my app
              </button>
              <button
                type="button"
                data-testid="build-app-deploy-preview"
                onClick={() => void requestDeploy("preview")}
                disabled={loading}
                style={btnSecondary}
              >
                Get a preview link
              </button>
            </>
          )}
        </div>

        {error && <p style={{ color: "var(--red)", marginTop: 8 }}>{error}</p>}

        <input
          type="hidden"
          data-testid="build-app-input"
          value={chatMessages.find((m) => m.role === "user")?.content ?? initialMessage ?? ""}
          readOnly
        />

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>Optional: link a support ticket</summary>
          <input
            data-testid="build-app-ticket"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="e.g. AISUP-123"
            style={{
              width: "100%",
              maxWidth: 220,
              marginTop: 8,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />
        </details>

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
          <p data-testid="build-app-preview-url" style={{ marginTop: 12 }}>
            Preview link: <a href={project.previewUrl}>{project.previewUrl}</a>
            {project.deployments[0]?.mock ? " (demo link)" : ""}
          </p>
        )}

        <pre data-testid="build-app-explanation" style={{ display: "none" }}>
          {chatMessages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n")}
        </pre>
        {buildOutput && (
          <pre data-testid="build-app-output" style={{ display: showTechnical ? "block" : "none", whiteSpace: "pre-wrap", background: "var(--surface-2)", padding: 12, borderRadius: 8, marginTop: 12, maxHeight: 160, overflow: "auto", fontSize: 11 }}>
            {buildOutput}
          </pre>
        )}
      </section>

      <aside style={{ borderLeft: "1px solid var(--border)", paddingLeft: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>What&apos;s next</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 12, lineHeight: 1.7 }}>
          {step === "describe" && (
            <>
              <li>Describe the app in the chat</li>
              <li>Answer any quick questions I ask</li>
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
              <li>Files are created — ask for changes anytime in chat</li>
              <li>Click &quot;Test my app&quot; to verify</li>
              <li>Get a preview link to share</li>
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
          {showTechnical ? "Hide technical details" : "Show technical details (for developers)"}
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
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: 11,
                      padding: "2px 0",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    {f}
                  </button>
                </li>
              ))}
            </ul>
            {diffContent && (
              <pre style={{ fontSize: 10, overflow: "auto", maxHeight: 200, marginTop: 8 }}>{diffContent.content?.slice(0, 2000)}</pre>
            )}
          </div>
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
