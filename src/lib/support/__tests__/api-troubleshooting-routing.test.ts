import { describe, it, expect } from "vitest";
import { classifyUserIntent } from "../intent/classify-intent";
import { chooseAgentRoute } from "../intent/choose-route";
import { buildApiTroubleshootingMarkdown } from "../api-troubleshooting";
import { userExplicitlyAskedForCommits } from "../developer-handoff";

describe("API troubleshooting routing", () => {
  it("routes bare 404 to api_troubleshooting", () => {
    const r = classifyUserIntent({ message: "404" });
    expect(r.primaryIntent).toBe("api_troubleshooting");
    expect(chooseAgentRoute(r, {}).kind).toBe("api_troubleshooting");
  });

  it("routes full upgrade + endpoint + 404 prompt to api_troubleshooting", () => {
    const msg =
      "After upgrading, POST /v3/indicators/search returns 404. Repo acme/checkout-service if needed.";
    const r = classifyUserIntent({ message: msg });
    expect(r.primaryIntent).toBe("api_troubleshooting");
    expect(r.extractedEntities.httpMethod).toBe("POST");
    expect(r.extractedEntities.endpoint).toBe("/v3/indicators/search");
    expect(r.extractedEntities.errorCode).toBe("404");
    expect(r.extractedEntities.event).toMatch(/after upgrad/i);
    expect(r.extractedEntities.repo).toBe("acme/checkout-service");
    expect(chooseAgentRoute(r, {}, msg).kind).toBe("api_troubleshooting");
  });

  it("never routes API error prompt to build app", () => {
    const msg = "After upgrading, POST /v3/indicators/search returns 404.";
    const r = classifyUserIntent({ message: msg });
    const route = chooseAgentRoute(r, {}, msg);
    expect(route.kind).not.toBe("unsupported_app_build");
    expect(r.primaryIntent).not.toBe("build_app");
  });

  it("repo mention does not trigger commits by default", () => {
    const msg = "POST /v3/foo returns 500. Repo acme/bar if needed.";
    expect(userExplicitlyAskedForCommits(msg)).toBe(false);
    const r = classifyUserIntent({ message: msg });
    expect(r.primaryIntent).not.toBe("commit_changes");
  });

  it("commits intent only when explicitly requested", () => {
    const r = classifyUserIntent({ message: "Can you commit these changes to git?" });
    expect(r.primaryIntent).toBe("commit_changes");
  });

  it("buildApiTroubleshootingMarkdown structure", () => {
    const md = buildApiTroubleshootingMarkdown({
      message: "POST /v3/indicators/search returns 404 after upgrade",
      entities: {
        httpMethod: "POST",
        endpoint: "/v3/indicators/search",
        errorCode: "404",
        event: "after upgrading",
      },
    });
    expect(md).toContain("API troubleshooting");
    expect(md).toContain("404");
    expect(md).not.toMatch(/build app/i);
    expect(md).not.toMatch(/latest commit/i);
  });
});

describe("Build App intent disabled as primary for errors", () => {
  it("explicit build request maps to unsupported_app_build_request", () => {
    const r = classifyUserIntent({
      message: "Build a dashboard for analysts to search indicators.",
    });
    expect(r.primaryIntent).toBe("unsupported_app_build_request");
    expect(chooseAgentRoute(r, {}).kind).toBe("unsupported_app_build");
  });
});
