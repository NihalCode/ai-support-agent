#!/usr/bin/env node
/** Full Build App workflow: NL plan → apply → NL edit → build → deploy → cleanup */
import { rmSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3099";

async function post(body) {
  const res = await fetch(`${BASE}/api/support/build-app`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function streamChat(message, buildProjectId) {
  const res = await fetch(`${BASE}/api/support/agent/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, buildProjectId }),
  });
  const text = await res.text();
  return {
    ok: res.ok,
    hasBuildHandoff: text.includes("build_app_handoff"),
    hasIntent: text.includes("intent_classified"),
  };
}

const steps = [];
function pass(name, detail) {
  steps.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, err) {
  steps.push({ name, ok: false, err });
  throw new Error(`${name}: ${err}`);
}

let projectId = null;
let project = null;

console.log(`\nFull workflow test — ${BASE}\n`);

try {
  const chat = await streamChat(
    "I need a small internal tool where analysts can search indicators and click into details."
  );
  if (!chat.ok || !chat.hasBuildHandoff) fail("NL chat → build app", "missing handoff");
  if (!chat.hasIntent) fail("NL chat intent", "missing intent_classified");
  pass("NL chat routes to Build App");

  let r = await post({
    action: "plan",
    message: "I need a dashboard where analysts can search indicators and open details.",
  });
  if (!r.ok) fail("plan", r.json.error ?? r.status);
  projectId = r.json.project?.id;
  project = r.json.project;
  if (!projectId) fail("plan", "no project id");
  if (/^I need/i.test(r.json.plan?.title ?? "")) fail("plan", "raw prompt in title");
  pass("scaffold plan", `id=${projectId} title=${r.json.plan?.title}`);

  r = await post({ action: "apply", projectId, userConfirmed: true, projectSnapshot: project });
  if (!r.ok) fail("apply scaffold", r.json.error ?? r.status);
  project = r.json.project;
  if (project.status !== "scaffolded") fail("apply scaffold", `status=${project.status}`);
  pass("apply scaffold", `${project.files?.length ?? 0} files`);

  r = await post({
    action: "edit",
    projectId,
    message: "This looks too much like a demo. Make it client-ready.",
    projectSnapshot: project,
  });
  if (!r.ok) fail("NL edit", r.json.error ?? r.status);
  if (/Tell me what you'd like changed/i.test(r.json.explanation ?? "")) fail("NL edit", "generic fallback");
  if (!r.json.pendingChanges?.length) fail("NL edit", "no pending changes");
  pass("NL edit", r.json.pendingChanges.map((c) => c.path).join(", "));

  project.pendingChanges = r.json.pendingChanges;
  r = await post({ action: "apply", projectId, userConfirmed: true, projectSnapshot: project });
  if (!r.ok) fail("apply edit", r.json.error ?? r.status);
  project = r.json.project;
  pass("apply edit");

  r = await post({ action: "build", projectId, projectSnapshot: project });
  if (!r.ok || r.json.buildOk !== true) {
    fail("build", r.json.error ?? r.json.classification?.summary ?? "buildOk !== true");
  }
  project = r.json.project ?? project;
  pass("build", "buildOk=true");

  r = await post({
    action: "deploy",
    projectId,
    target: "preview",
    userConfirmed: true,
    projectSnapshot: project,
  });
  if (!r.ok) fail("deploy", r.json.error ?? r.status);
  const preview = r.json.project?.previewUrl ?? r.json.detail ?? "";
  if (!preview && !r.json.ok) fail("deploy", "no preview");
  pass("deploy", String(preview).slice(0, 100));

  const shareChat = await streamChat("Can I share this with my team?", projectId);
  if (!shareChat.ok) fail("NL share chat", "stream failed");
  if (!shareChat.hasIntent) fail("NL share chat", "missing intent");
  pass("NL share phrasing with active project");
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exitCode = 1;
} finally {
  if (projectId) {
    const dir = path.join(process.cwd(), ".data", "build-apps", projectId);
    try {
      rmSync(dir, { recursive: true, force: true });
      pass("cleanup mock project", projectId);
    } catch (err) {
      console.warn(`Cleanup warning: ${err.message}`);
    }
  }
}

const failed = steps.filter((s) => !s.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} workflow steps passed\n`);
if (failed.length) process.exit(1);
