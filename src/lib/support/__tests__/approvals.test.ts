import { describe, it, expect } from "vitest";
import { enqueueApproval, getApproval, listApprovals, setApprovalStatus } from "../approvals";
import { classifyAction } from "../safety";

describe("approval queue", () => {
  it("enqueues, lists, fetches, and redacts the preview", () => {
    const safety = classifyAction({ kind: "jira", method: "POST", summary: "add a comment" });
    const req = enqueueApproval({
      action: { type: "ticket-comment", provider: "jira", ref: "PROJ-1", body: "hi" },
      safety,
      preview: "comment on PROJ-1 with token sk-abcdefgh12345678",
    });
    expect(req.status).toBe("pending");
    expect(req.preview).not.toContain("sk-abcdefgh12345678");

    expect(getApproval(req.id)?.id).toBe(req.id);
    expect(listApprovals("pending").some((r) => r.id === req.id)).toBe(true);
  });

  it("transitions status with a redacted result", () => {
    const safety = classifyAction({ kind: "jira", method: "POST", summary: "create issue" });
    const req = enqueueApproval({
      action: { type: "jira-create", projectKey: "P", summary: "s", description: "d", issueType: "Task" },
      safety,
      preview: "create issue",
    });
    const updated = setApprovalStatus(req.id, "executed", "done");
    expect(updated?.status).toBe("executed");
    expect(updated?.resolvedAt).toBeTruthy();
  });

  it("returns null for unknown ids", () => {
    expect(getApproval("nope")).toBeNull();
    expect(setApprovalStatus("nope", "rejected")).toBeNull();
  });
});
