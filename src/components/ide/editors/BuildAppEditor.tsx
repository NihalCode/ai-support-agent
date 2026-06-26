"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuildAppFileChange, BuildAppProject } from "@/lib/support/build-app/types";

export function BuildAppEditor({ projectId: initialProjectId }: { projectId?: string }) {
  const [message, setMessage] = useState("");
  const [project, setProject] = useState<BuildAppProject | null>(null);
  const [explanation, setExplanation] = useState("");
  const [pendingChanges, setPendingChanges] = useState<BuildAppFileChange[]>([]);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildOutput, setBuildOutput] = useState("");

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/support/build-app?projectId=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data.project) setProject(data.project);
  }, []);

  useEffect(() => {
    if (initialProjectId) void loadProject(initialProjectId);
  }, [initialProjectId, loadProject]);

  async function plan() {
    const text = message.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          project ? { action: "edit", projectId: project.id, message: text } : { action: "plan", message: text }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Plan failed");
      setExplanation(data.explanation ?? "");
      setPendingChanges(data.pendingChanges ?? []);
      setApprovalId(data.approvalId ?? null);
      if (data.project) {
        setProject(data.project);
        void loadProject(data.project.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan failed");
    } finally {
      setLoading(false);
    }
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
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      setPendingChanges([]);
      setApprovalId(null);
      await loadProject(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setLoading(false);
    }
  }

  async function runBuild() {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch("/api/support/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", projectId: project.id }),
      });
      const data = await res.json();
      setBuildOutput(data.output ?? "");
      if (data.project) setProject(data.project);
    } finally {
      setLoading(false);
    }
  }

  async function requestDeploy(target: "preview" | "production") {
    if (!project) return;
    setLoading(true);
    try {
      const planRes = await fetch("/api/support/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deploy", projectId: project.id, target }),
      });
      const planData = await planRes.json();
      setBuildOutput(planData.buildOutput ?? planData.explanation ?? "");
      if (!planData.approvalId) return;
      const depRes = await fetch("/api/support/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "approve", id: planData.approvalId }),
      });
      const depData = await depRes.json();
      await loadProject(project.id);
      setBuildOutput(depData.result?.detail ?? planData.explanation ?? "");
    } finally {
      setLoading(false);
    }
  }

  const files = project?.files ?? pendingChanges.map((c) => c.path);
  const diffContent = pendingChanges.find((c) => c.path === selectedFile);

  return (
    <div
      data-testid="build-app-workspace"
      style={{ display: "grid", gridTemplateColumns: "220px 1fr 280px", gap: 12, minHeight: 520, fontSize: 13 }}
    >
      <aside>
        <strong>Files</strong>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8, maxHeight: 400, overflow: "auto" }}>
          {files.map((f) => (
            <li key={f}>
              <button
                type="button"
                data-testid={`build-app-file-${f.replace(/\//g, "-")}`}
                onClick={() => setSelectedFile(f)}
                style={{
                  background: selectedFile === f ? "var(--surface-2)" : "none",
                  border: "none",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "4px 0",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                {f}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        <h2 style={{ marginTop: 0 }}>Build App</h2>
        <p style={{ color: "var(--muted)" }}>
          Describe an app using Cyware APIs — the agent scaffolds, builds, and deploys with approval gates.
        </p>
        <textarea
          data-testid="build-app-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Build me a simple CTIX indicator search dashboard…"
          style={{
            width: "100%",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 10,
            color: "var(--text)",
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" data-testid="build-app-plan" onClick={() => void plan()} disabled={loading} style={btnPrimary}>
            {project ? "Propose edit" : "Generate plan"}
          </button>
          {approvalId && (
            <button type="button" data-testid="build-app-approve" onClick={() => void approveAndApply()} disabled={loading} style={btnPrimary}>
              Approve & apply ({pendingChanges.length} files)
            </button>
          )}
          {project?.status === "scaffolded" || project?.status === "ready" ? (
            <>
              <button type="button" data-testid="build-app-build" onClick={() => void runBuild()} disabled={loading} style={btnSecondary}>
                Run build
              </button>
              <button type="button" data-testid="build-app-deploy-preview" onClick={() => void requestDeploy("preview")} disabled={loading} style={btnSecondary}>
                Deploy preview
              </button>
            </>
          ) : null}
        </div>
        {error && <p style={{ color: "var(--red)" }}>{error}</p>}
        {explanation && (
          <pre data-testid="build-app-explanation" style={{ whiteSpace: "pre-wrap", background: "var(--surface-2)", padding: 12, borderRadius: 8, marginTop: 12 }}>
            {explanation}
          </pre>
        )}
        {buildOutput && (
          <pre data-testid="build-app-output" style={{ whiteSpace: "pre-wrap", background: "var(--surface-2)", padding: 12, borderRadius: 8, marginTop: 12, maxHeight: 200, overflow: "auto" }}>
            {buildOutput}
          </pre>
        )}
        {project?.previewUrl && (
          <p data-testid="build-app-preview-url">
            Preview: <a href={project.previewUrl}>{project.previewUrl}</a>
            {project.deployments[0]?.mock ? " (mock URL)" : ""}
          </p>
        )}
      </section>

      <aside data-testid="build-app-diff-panel">
        <strong>Diff / Preview</strong>
        {diffContent ? (
          <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 480, marginTop: 8 }}>{diffContent.content?.slice(0, 4000)}</pre>
        ) : selectedFile && project ? (
          <p style={{ color: "var(--muted)", marginTop: 8 }}>File scaffolded — open after apply.</p>
        ) : (
          <p style={{ color: "var(--muted)", marginTop: 8 }}>Select a pending file to preview diff.</p>
        )}
        <div data-testid="build-app-preview-fallback" style={{ marginTop: 16, fontSize: 11, color: "var(--muted)" }}>
          Local preview: after scaffold, run <code>npm install && npm run dev</code> in generated-apps folder.
        </div>
      </aside>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  padding: "8px 12px",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  padding: "8px 12px",
  cursor: "pointer",
};
