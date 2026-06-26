import { describe, it, expect } from "vitest";
import { planInvestigation, detectCredentialGaps } from "../agents/supervisorAgent";

describe("supervisorAgent", () => {
  it("routes CQL queries to cql agent", () => {
    const plan = planInvestigation({ text: "Write a CQL query for malicious IPs" });
    expect(plan.agents).toContain("cql");
    expect(plan.canProceed).toBe(false);
  });

  it("proceeds when endpoint provided", () => {
    const plan = planInvestigation({
      text: "POST /v3/tags/bulk/ returns 503",
      endpoint: "/v3/tags/bulk/",
      statusCode: 503,
    });
    expect(plan.canProceed).toBe(true);
    expect(plan.agents).toContain("logs");
  });

  it("lists credential gaps without throwing", () => {
    const gaps = detectCredentialGaps();
    expect(Array.isArray(gaps.gaps)).toBe(true);
  });
});
