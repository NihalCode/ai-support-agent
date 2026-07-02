import { describe, it, expect } from "vitest";
import { verifyProjectState } from "@/lib/support/build-app/verified-claims";
import { sessionFromProject, sessionStatusLabel } from "@/lib/support/build-app/session-ui";
import type { BuildAppProject } from "@/lib/support/build-app/types";

function project(partial: Partial<BuildAppProject>): BuildAppProject {
  return {
    id: "x",
    name: "app",
    description: "d",
    templateId: "indicator-search-dashboard",
    rootDir: "/tmp",
    status: "pending_approval",
    files: [],
    pendingChanges: [{ path: "a.tsx", action: "create", content: "x" }],
    appliedChanges: [],
    deployments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("build-app session state mapping", () => {
  it("maps pending scaffold to awaiting_scaffold_approval", () => {
    const session = sessionFromProject(project({ status: "pending_approval" }));
    expect(session.currentState).toBe("awaiting_scaffold_approval");
    expect(sessionStatusLabel(session.currentState)).toBe("Awaiting approval");
  });

  it("maps build failure without preview claim", () => {
    const p = project({ status: "failed", buildOk: false, previewUrl: "https://mock.vercel.app", files: ["a.tsx"], appliedChanges: [{ path: "a.tsx", action: "create", content: "x" }] });
    const session = sessionFromProject(p);
    expect(session.currentState).not.toBe("preview_ready");
    const v = verifyProjectState(p);
    expect(v.claims.canSayPreviewReady).toBe(false);
  });
});
