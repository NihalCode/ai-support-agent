import { describe, it, expect } from "vitest";
import {
  isBuildErrorDiscussion,
  extractErrorFilePaths,
  analyzeBuildError,
  proposeBuildErrorFixes,
} from "../build-app/build-error-fix";
import { handleBuildAppPlan } from "../build-app/orchestrate";
import { applyFileChanges, getProject, readProjectFile } from "../build-app/project-store";

describe("build error discussion detection", () => {
  it("detects pasted npm/turbopack logs", () => {
    const msg =
      "Tell me why the error occurred: Command 'npm run build' exited with 1 Parsing ecmascript source code failed";
    expect(isBuildErrorDiscussion(msg)).toBe(true);
    expect(isBuildErrorDiscussion("make it cleaner")).toBe(false);
    expect(isBuildErrorDiscussion("something broke", true)).toBe(true);
  });
});

describe("build error analysis", () => {
  it("extracts file paths from turbopack output", () => {
    const log = "./app/page.tsx:12:5\nParsing ecmascript source code failed";
    expect(extractErrorFilePaths(log)).toContain("app/page.tsx");
  });

  it("explains syntax errors in plain language", () => {
    const analysis = analyzeBuildError(
      "Parsing ecmascript source code failed\n./app/page.tsx:12:5\nUnexpected token"
    );
    expect(analysis.summary).toMatch(/syntax|JSX|JavaScript/i);
    expect(analysis.citedFiles).toContain("app/page.tsx");
  });
});

describe("proposeBuildErrorFixes", () => {
  it("fixes duplicate className on cited file", () => {
    const plan = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const pid = plan.project!.id;
    applyFileChanges(pid, plan.pendingChanges!);

    const pagePath = "app/page.tsx";
    const broken =
      '<main className="dashboard-shell" className="container dashboard-shell">x</main>';
    const project = getProject(pid)!;
    const readFile = (path: string) => {
      if (path === pagePath) return broken;
      return readProjectFile(pid, path);
    };

    const log = `./${pagePath}:1:1\nParsing ecmascript source code failed`;
    const result = proposeBuildErrorFixes({
      project,
      message: "Why did the build fail? Parsing ecmascript source code failed",
      buildOutput: log,
      readFile,
    });

    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0]!.path).toBe(pagePath);
    expect(result.changes[0]!.content).not.toMatch(/className="[^"]*"[^>]*className="/);
  });
});
