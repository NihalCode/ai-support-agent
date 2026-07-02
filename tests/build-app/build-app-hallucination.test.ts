import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { verifyBuildAppState, detectIntegrationsInText } from "@/lib/support/build-app/verified-state";
import { verifyProjectState, safeBuildSuccessMessage } from "@/lib/support/build-app/verified-claims";
import type { BuildAppProject } from "@/lib/support/build-app/types";
import { workflowStateFromProject } from "@/lib/support/build-app/workflow-state";

function minimalProject(overrides: Partial<BuildAppProject> = {}): BuildAppProject {
  return {
    id: "p1",
    name: "test-app",
    description: "Build indicator dashboard",
    templateId: "indicator-search-dashboard",
    rootDir: "/tmp/x",
    status: "scaffolded",
    files: ["app/page.tsx"],
    pendingChanges: [],
    appliedChanges: [{ path: "app/page.tsx", action: "create", content: "x" }],
    deployments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan: {
      id: "plan1",
      title: "Indicator Search",
      summary: "Search indicators",
      templateId: "indicator-search-dashboard",
      templateReason: "match",
      endpoints: [],
      features: [],
      envSnippet: "",
      clarifyingQuestions: [],
      readOnly: true,
      deployReady: false,
      createdAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe("verifyBuildAppState claims", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `verified-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("cannot claim build passed in mock mode", () => {
    const v = verifyProjectState(minimalProject({ buildOk: true, buildMock: true }));
    expect(v.claims.canSayBuildPassed).toBe(false);
    expect(v.claims.canSayBuildChecked).toBe(true);
    expect(safeBuildSuccessMessage(v)).toMatch(/simulated/i);
  });

  it("cannot claim preview ready without buildOk", () => {
    const v = verifyProjectState(minimalProject({ previewUrl: "https://x.vercel.app", buildOk: false }));
    expect(v.claims.canSayPreviewReady).toBe(false);
  });

  it("cannot claim files written without applied changes on disk", () => {
    const p = minimalProject({ rootDir: tmp, appliedChanges: [{ path: "a", action: "create", content: "x" }] });
    const v = verifyBuildAppState(p);
    expect(v.claims.canSayFilesWritten).toBe(false);

    writeFileSync(path.join(tmp, "package.json"), "{}");
    const v2 = verifyBuildAppState({ ...p, files: ["package.json"] });
    expect(v2.claims.canSayFilesWritten).toBe(true);
  });

  it("workflow blocks preview_ready when build failed", () => {
    const state = workflowStateFromProject(minimalProject({ previewUrl: "https://x.vercel.app", buildOk: false }));
    expect(state).not.toBe("preview_ready");
  });
});

describe("detectIntegrationsInText", () => {
  const prev = { z: process.env.ZENDESK_SUBDOMAIN, e: process.env.ZENDESK_EMAIL, t: process.env.ZENDESK_API_TOKEN };

  afterEach(() => {
    if (prev.z === undefined) delete process.env.ZENDESK_SUBDOMAIN;
    else process.env.ZENDESK_SUBDOMAIN = prev.z;
    if (prev.e === undefined) delete process.env.ZENDESK_EMAIL;
    else process.env.ZENDESK_EMAIL = prev.e;
    if (prev.t === undefined) delete process.env.ZENDESK_API_TOKEN;
    else process.env.ZENDESK_API_TOKEN = prev.t;
  });

  it("marks Zendesk as backend_pending when not configured", () => {
    delete process.env.ZENDESK_SUBDOMAIN;
    delete process.env.ZENDESK_EMAIL;
    delete process.env.ZENDESK_API_TOKEN;
    const integrations = detectIntegrationsInText("Build a Zendesk ticket triage dashboard");
    expect(integrations).toHaveLength(1);
    expect(integrations[0].status).toBe("backend_pending");
  });
});
