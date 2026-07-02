import { describe, it, expect } from "vitest";
import { handleBuildAppPlan } from "@/lib/support/build-app/orchestrate";
import { runAppBuilderAgentPath } from "./helpers";

describe("build-app hallucination guardrails in agent copy", () => {
  it("does not promise Zendesk is connected when env is unset", () => {
    const prev = {
      z: process.env.ZENDESK_SUBDOMAIN,
      e: process.env.ZENDESK_EMAIL,
      t: process.env.ZENDESK_API_TOKEN,
    };
    delete process.env.ZENDESK_SUBDOMAIN;
    delete process.env.ZENDESK_EMAIL;
    delete process.env.ZENDESK_API_TOKEN;

    const result = handleBuildAppPlan({ message: "Build a Zendesk ticket triage dashboard" });
    expect(result.explanation).toMatch(/not connected|backend-pending/i);
    expect(result.explanation).not.toMatch(/Zendesk is connected and ready/i);

    if (prev.z === undefined) delete process.env.ZENDESK_SUBDOMAIN;
    else process.env.ZENDESK_SUBDOMAIN = prev.z;
    if (prev.e === undefined) delete process.env.ZENDESK_EMAIL;
    else process.env.ZENDESK_EMAIL = prev.e;
    if (prev.t === undefined) delete process.env.ZENDESK_API_TOKEN;
    else process.env.ZENDESK_API_TOKEN = prev.t;
  });

  it("does not ask to describe the app when pending scaffold exists", () => {
    const plan = handleBuildAppPlan({ message: "Build indicator search dashboard" });
    const pid = plan.project!.id;
    const edit = runAppBuilderAgentPath({
      message: "make the landing page cleaner",
      projectId: pid,
    });
    expect(edit.explanation).not.toContain("Describe the app you want to build");
    expect(edit.pendingChanges?.length).toBeGreaterThan(0);
  });
});
