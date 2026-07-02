import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runBuildPreflight, formatPreflightReport } from "../build-app/preflight";
import { runCommand, allCommandsSucceeded, shouldMockProjectCommands } from "../build-app/command-runner";
import { classifyBuildError } from "../build-app/error-classify";
import { canTransition } from "../build-app/workflow-state";
import { handleBuildAppPlan } from "../build-app/orchestrate";
import { applyFileChanges, getProject } from "../build-app/project-store";
import { runProjectBuild } from "../build-app/deploy";
import { resolveBuildAppCredentials, hasVercelDeployCredentials, hasGitHubPushCredentials } from "../build-app/credentials";
import { collectProjectDeployFiles } from "../build-app/collect-files";

describe("build-app preflight", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `preflight-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("fails when package.json and app directory are missing", () => {
    const report = runBuildPreflight(tmp);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => /package\.json/i.test(i))).toBe(true);
  });

  it("passes for minimal valid Next app layout", () => {
    writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({
        scripts: { build: "next build" },
        dependencies: { next: "16.2.7", react: "19.2.4", "react-dom": "19.2.4" },
      })
    );
    mkdirSync(path.join(tmp, "app"));
    const report = runBuildPreflight(tmp);
    expect(report.ok).toBe(true);
    expect(formatPreflightReport(report)).toMatch(/Preflight passed/);
  });
});

describe("command runner", () => {
  it("records failed exit codes in mock mode", () => {
    const result = runCommand("npm run build", process.cwd(), {
      mock: true,
      mockExitCode: 127,
      mockOutput: "sh: line 1: next: command not found",
    });
    expect(result.exitCode).toBe(127);
    expect(result.status).toBe("failed");
    expect(allCommandsSucceeded([result])).toBe(false);
  });

  it("records success only for exit code 0", () => {
    const ok = runCommand("npm test", process.cwd(), { mock: true, mockExitCode: 0 });
    const bad = runCommand("npm test", process.cwd(), { mock: true, mockExitCode: 1 });
    expect(allCommandsSucceeded([ok])).toBe(true);
    expect(allCommandsSucceeded([ok, bad])).toBe(false);
  });

  it("uses local npm on Vercel without token unless BUILD_APP_MOCK_ON_VERCEL", () => {
    const prev = { VERCEL: process.env.VERCEL, TEST: process.env.TEST_MODE, REAL: process.env.BUILD_APP_REAL_COMMANDS, MOCK: process.env.BUILD_APP_MOCK_ON_VERCEL };
    delete process.env.TEST_MODE;
    delete process.env.BUILD_APP_REAL_COMMANDS;
    delete process.env.VERCEL_TOKEN;
    process.env.VERCEL = "1";
    expect(shouldMockProjectCommands()).toBe(false);
    process.env.BUILD_APP_MOCK_ON_VERCEL = "true";
    expect(shouldMockProjectCommands()).toBe(true);
    process.env.VERCEL = prev.VERCEL;
    if (prev.TEST === undefined) delete process.env.TEST_MODE;
    else process.env.TEST_MODE = prev.TEST;
    if (prev.REAL === undefined) delete process.env.BUILD_APP_REAL_COMMANDS;
    else process.env.BUILD_APP_REAL_COMMANDS = prev.REAL;
    if (prev.MOCK === undefined) delete process.env.BUILD_APP_MOCK_ON_VERCEL;
    else process.env.BUILD_APP_MOCK_ON_VERCEL = prev.MOCK;
  });
});

describe("build error classification", () => {
  it("classifies next command not found", () => {
    const c = classifyBuildError("sh: line 1: next: command not found\nCommand failed: npm run build");
    expect(c.kind).toBe("missing_command");
    expect(c.suggestedFix).toMatch(/npm install/i);
  });
});

describe("workflow state machine", () => {
  it("blocks invalid transitions", () => {
    expect(canTransition("scaffolding", "preview_ready")).toBe(false);
    expect(canTransition("build_failed", "preview_ready")).toBe(false);
    expect(canTransition("building", "build_failed")).toBe(true);
  });
});

describe("runProjectBuild pipeline", () => {
  const prevTest = process.env.TEST_MODE;
  const prevFail = process.env.MOCK_BUILD_FAIL;

  beforeEach(() => {
    process.env.TEST_MODE = "true";
    delete process.env.MOCK_BUILD_FAIL;
  });

  afterEach(() => {
    if (prevTest === undefined) delete process.env.TEST_MODE;
    else process.env.TEST_MODE = prevTest;
    if (prevFail === undefined) delete process.env.MOCK_BUILD_FAIL;
    else process.env.MOCK_BUILD_FAIL = prevFail;
  });

  it("runs install then build in mock mode after scaffold", async () => {
    const plan = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const pid = plan.project!.id;
    applyFileChanges(pid, plan.pendingChanges!);
    const result = await runProjectBuild(pid);
    expect(result.preflightOk).toBe(true);
    expect(result.buildOk).toBe(true);
    expect(result.output).toMatch(/npm install/i);
    expect(result.output).toMatch(/npm run build/i);
    expect(getProject(pid)?.buildOk).toBe(true);
  });

  it("does not claim success when mock build fails", async () => {
    process.env.MOCK_BUILD_FAIL = "true";
    const plan = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const pid = plan.project!.id;
    applyFileChanges(pid, plan.pendingChanges!);
    const result = await runProjectBuild(pid);
    expect(result.buildOk).toBe(false);
    expect(result.classification?.kind).toBe("missing_command");
    expect(getProject(pid)?.buildOk).toBe(false);
  });

  it("fails preflight when files were not scaffolded", async () => {
    const plan = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const pid = plan.project!.id;
    const result = await runProjectBuild(pid);
    expect(result.preflightOk).toBe(false);
    expect(result.buildOk).toBe(false);
  });
});

describe("build-app deploy credentials", () => {
  it("resolves request credentials over env", () => {
    const prev = process.env.VERCEL_TOKEN;
    process.env.VERCEL_TOKEN = "env-token";
    expect(resolveBuildAppCredentials({ vercelToken: "req-token" }).vercelToken).toBe("req-token");
    expect(hasVercelDeployCredentials(resolveBuildAppCredentials({ vercelToken: "x" }))).toBe(true);
    expect(hasGitHubPushCredentials(resolveBuildAppCredentials({ githubToken: "g", githubRepo: "o/r" }))).toBe(true);
    if (prev === undefined) delete process.env.VERCEL_TOKEN;
    else process.env.VERCEL_TOKEN = prev;
  });
});

describe("collect project deploy files", () => {
  it("skips node_modules and includes package.json", () => {
    const tmp = path.join(os.tmpdir(), `collect-${Date.now()}`);
    mkdirSync(path.join(tmp, "node_modules", "x"), { recursive: true });
    writeFileSync(path.join(tmp, "node_modules", "x", "a.js"), "x");
    writeFileSync(path.join(tmp, "package.json"), "{}");
    mkdirSync(path.join(tmp, "app"));
    writeFileSync(path.join(tmp, "app", "page.tsx"), "export default function P(){}");
    const files = collectProjectDeployFiles(tmp);
    expect(files.some((f) => f.file === "package.json")).toBe(true);
    expect(files.some((f) => f.file.includes("node_modules"))).toBe(false);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("template package.json", () => {
  it("includes required Next dependencies", () => {
    const pkgPath = path.join(process.cwd(), "templates/blank-next-app/files/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.scripts.build).toBeTruthy();
    expect(pkg.dependencies.next).toBeTruthy();
    expect(pkg.dependencies.react).toBeTruthy();
    expect(pkg.dependencies["react-dom"]).toBeTruthy();
  });
});
