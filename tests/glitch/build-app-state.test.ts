import { describe, it, expect, beforeEach } from "vitest";
import {
  createProject,
  tryAcquireBuildLock,
  releaseBuildLock,
  setPendingChanges,
  applyFileChanges,
} from "@/lib/support/build-app/project-store";

describe("build app state guards", () => {
  beforeEach(() => {
    releaseBuildLock("any");
  });

  it("prevents concurrent build locks for the same project", () => {
    expect(tryAcquireBuildLock("proj-a")).toBe(true);
    expect(tryAcquireBuildLock("proj-a")).toBe(false);
    releaseBuildLock("proj-a");
    expect(tryAcquireBuildLock("proj-a")).toBe(true);
  });

  it("clears pending changes after apply", () => {
    const project = createProject({
      name: "Test",
      description: "demo",
      templateId: "indicator-search-dashboard",
    });
    setPendingChanges(project.id, [
      { path: "app/page.tsx", action: "create", content: "export default function Page(){return null}" },
    ]);
    const applied = applyFileChanges(project.id, [
      { path: "app/page.tsx", action: "create", content: "export default function Page(){return null}" },
    ]);
    expect(applied.pendingChanges).toHaveLength(0);
    expect(applied.status).toBe("scaffolded");
  });
});
