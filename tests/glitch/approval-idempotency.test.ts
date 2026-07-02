import { describe, it, expect } from "vitest";
import {
  enqueueApproval,
  claimApprovalForExecution,
  claimApprovalRejection,
  getApproval,
} from "@/lib/support/approvals";
import { classifyAction } from "@/lib/support/safety";

describe("approval idempotency", () => {
  it("allows only one execution claim per pending approval", async () => {
    const safety = classifyAction({ kind: "jira", method: "POST", summary: "comment" });
    const req = await enqueueApproval({
      action: { type: "ticket-comment", provider: "jira", ref: "PROJ-9", body: "hi" },
      safety,
      preview: "comment",
    });

    expect((await getApproval(req.id))?.status).toBe("pending");

    const first = await claimApprovalForExecution(req.id, "user-1");
    const second = await claimApprovalForExecution(req.id, "user-2");

    expect(first?.status).toBe("approved");
    expect(second).toBeNull();
    expect((await getApproval(req.id))?.status).toBe("approved");
  });

  it("allows only one rejection claim per pending approval", async () => {
    const safety = classifyAction({ kind: "jira", method: "POST", summary: "create" });
    const req = await enqueueApproval({
      action: { type: "jira-create", projectKey: "P", summary: "s", description: "d", issueType: "Task" },
      safety,
      preview: "create",
    });

    expect(await claimApprovalRejection(req.id, "user-1", "no")).not.toBeNull();
    expect(await claimApprovalRejection(req.id, "user-2", "no again")).toBeNull();
    expect((await getApproval(req.id))?.status).toBe("rejected");
  });
});
