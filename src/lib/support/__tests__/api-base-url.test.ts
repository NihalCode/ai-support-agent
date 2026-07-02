import { describe, expect, it, afterEach } from "vitest";

import {
  formatApiEndpointDisplay,
  formatQueryEndpointDisplay,
  resolvePathWithBase,
} from "../api-base-url";
import { enrichSupportQuery, missingInfoQuestions } from "../investigation/extract-query";
import { enrichWithEndpointInference } from "../investigation/infer-api";
import { formatInvestigationMarkdown } from "../agents/supervisorAgent";

const ORCHESTRATE_PROMPT =
  'Orchestrate playbook "Block Malicious IP" timed out after 45s. Need run logs, node results, and how to retry the playbook run.';

describe("api-base-url", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("replaces CFTR Postman {{base_url}} with configured tenant URL", () => {
    process.env.CFTR_BASE_URL = "https://cftr.example.com/api";
    process.env.CFTR_API_KEY = "test-key";
    const out = formatApiEndpointDisplay("{{base_url}}v1/incident/qb/extended/:id/", {
      method: "GET",
      productId: "cftr",
    });
    expect(out).toBe("GET https://cftr.example.com/api/v1/incident/qb/extended/:id/");
    expect(out).not.toContain("{{base_url}}");
  });

  it("builds orchestrate playbook URLs from ORCHESTRATE_BASE_URL", () => {
    process.env.ORCHESTRATE_BASE_URL = "https://orch.example.com";
    process.env.ORCHESTRATE_API_KEY = "test-key";
    const out = formatApiEndpointDisplay("/v1/playbook/playbook-result/filter/", {
      method: "POST",
      productId: "orchestrate",
    });
    expect(out).toBe("POST https://orch.example.com/v1/playbook/playbook-result/filter/");
  });

  it("shows env var hint when tenant base URL is not configured", () => {
    delete process.env.CFTR_BASE_URL;
    delete process.env.CFTR_API_KEY;
    const out = formatApiEndpointDisplay("{{base_url}}v1/incident/", { productId: "cftr" });
    expect(out).toContain("<CFTR_BASE_URL>");
    expect(out).not.toContain("{{base_url}}");
  });

  it("joins base and path without double slashes", () => {
    expect(resolvePathWithBase("/v3/tags/", "https://tenant.example.com/ctixapi/")).toBe(
      "https://tenant.example.com/ctixapi/v3/tags/"
    );
  });
});

describe("infer-api orchestrate playbook", () => {
  it("infers orchestrate playbook endpoints instead of CFTR incident paths", () => {
    let q = enrichSupportQuery({ text: ORCHESTRATE_PROMPT });
    q = enrichWithEndpointInference(q);
    expect(q.endpoint).toBeTruthy();
    expect(q.endpoint).toMatch(/playbook/i);
    expect(q.endpoint).not.toMatch(/\{\{base_url\}\}/);
    expect(q.endpoint).not.toMatch(/incident\/qb\/extended/i);
  });

  it("formats investigation markdown with resolved tenant URL when configured", () => {
    process.env.ORCHESTRATE_BASE_URL = "https://orch.example.com";
    process.env.ORCHESTRATE_API_KEY = "test-key";
    let q = enrichSupportQuery({ text: ORCHESTRATE_PROMPT });
    q = enrichWithEndpointInference(q);
    const md = formatInvestigationMarkdown({ query: q });
    expect(md).toContain("https://orch.example.com");
    expect(md).not.toContain("{{base_url}}");
  });
});

describe("orchestrate missing-info questions", () => {
  it("skips vague timing/symptom questions when timeout is explicit", () => {
    const q = enrichSupportQuery({ text: ORCHESTRATE_PROMPT });
    const qs = missingInfoQuestions(q);
    expect(qs.some((x) => /failure happen/i.test(x.question))).toBe(false);
    expect(qs.some((x) => /keep loading/i.test(x.question))).toBe(false);
  });
});
