import { describe, it, expect } from "vitest";
import { classifyAction, classifyHttp, canExecute } from "../safety";

describe("safety classifier", () => {
  it("treats GET/search/list as READ_ONLY with no approval", () => {
    const v = classifyHttp("GET", "list indicators");
    expect(v.safetyClass).toBe("READ_ONLY");
    expect(v.requiresApproval).toBe(false);
    expect(v.blocked).toBe(false);
  });

  it("requires approval for POST writes", () => {
    const v = classifyHttp("POST", "create a tag");
    expect(v.requiresApproval).toBe(true);
    expect(v.blocked).toBe(false);
    expect(v.safetyClass.startsWith("WRITE")).toBe(true);
  });

  it("blocks DELETE by default", () => {
    const v = classifyHttp("DELETE", "delete an indicator");
    expect(v.safetyClass).toBe("DESTRUCTIVE");
    expect(v.blocked).toBe(true);
  });

  it("allows destructive when explicitly opted in (still needs approval)", () => {
    const v = classifyAction({
      kind: "cyware",
      method: "DELETE",
      summary: "delete an indicator",
      allowDestructive: true,
    });
    expect(v.blocked).toBe(false);
    expect(v.requiresApproval).toBe(true);
  });

  it("classifies bulk operations as BULK_OPERATION", () => {
    const v = classifyHttp("POST", "bulk add tags to indicators");
    expect(v.safetyClass).toBe("BULK_OPERATION");
    expect(v.requiresApproval).toBe(true);
  });

  it("flags auth/permission changes", () => {
    const v = classifyHttp("POST", "rotate the api key / change permissions");
    expect(v.safetyClass).toBe("AUTH_OR_PERMISSION_CHANGE");
  });

  it("rates comments/labels as low-risk writes", () => {
    expect(classifyHttp("POST", "add a comment").safetyClass).toBe("WRITE_LOW_RISK");
    expect(classifyHttp("POST", "suggest a label").safetyClass).toBe("WRITE_LOW_RISK");
  });

  it("rates relationship/link creation as high-risk", () => {
    expect(classifyHttp("POST", "create a relationship").safetyClass).toBe("WRITE_HIGH_RISK");
  });

  describe("canExecute", () => {
    it("permits reads without approval", () => {
      const v = classifyHttp("GET", "list");
      expect(canExecute(v, { approved: false, readOnly: false }).ok).toBe(true);
    });
    it("blocks reads-disabled writes when read-only", () => {
      const v = classifyHttp("POST", "create a tag");
      expect(canExecute(v, { approved: true, readOnly: true }).ok).toBe(false);
    });
    it("requires approval for writes", () => {
      const v = classifyHttp("POST", "create a tag");
      expect(canExecute(v, { approved: false, readOnly: false }).ok).toBe(false);
      expect(canExecute(v, { approved: true, readOnly: false }).ok).toBe(true);
    });
    it("never permits blocked destructive actions", () => {
      const v = classifyHttp("DELETE", "delete object");
      expect(canExecute(v, { approved: true, readOnly: false }).ok).toBe(false);
    });
  });
});
