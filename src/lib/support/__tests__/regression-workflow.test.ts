import { describe, expect, it, afterEach } from "vitest";

import { chooseAgentRoute } from "../intent/choose-route";
import { classifyUserIntent } from "../intent/classify-intent";
import {
  enrichSupportQuery,
  isCqlAuthoringRequest,
  missingInfoQuestions,
} from "../investigation/extract-query";
import { enrichWithEndpointInference } from "../investigation/infer-api";
import { formatInvestigationMarkdown } from "../agents/supervisorAgent";
import { createMockInvestigationFromNaturalLanguage } from "../investigation/ensure-investigation";
import { formatApiEndpointDisplay } from "../api-base-url";

const CQL_PROMPT =
  "Write a CQL query for malicious IP indicators in the last 24 hours with confidence >= 90. Link the relevant CQL grammar docs.";

const ORCHESTRATE_PROMPT =
  'Orchestrate playbook "Block Malicious IP" timed out after 45s. Need run logs, node results, and how to retry.';

const CTIX_401 =
  "401 Unauthorized on CTIX Open API since this morning — signature expiry on POST /v3/indicators/search/";

describe("regression — CQL vs incident routing", () => {
  it("classifies CQL authoring as generate_cql, not diagnose_support_issue", () => {
    const c = classifyUserIntent({ message: CQL_PROMPT });
    expect(c.primaryIntent).toBe("generate_cql");
    expect(chooseAgentRoute(c, {}, CQL_PROMPT).kind).toBe("cql");
  });

  it("classifies orchestrate timeout as investigation", () => {
    const c = classifyUserIntent({ message: ORCHESTRATE_PROMPT });
    expect(c.primaryIntent).toBe("diagnose_support_issue");
    expect(chooseAgentRoute(c, {}, ORCHESTRATE_PROMPT).kind).toBe("investigation_create");
  });

  it("CQL mock investigation skips incident endpoint and missing-info questions", async () => {
    const result = await createMockInvestigationFromNaturalLanguage(CQL_PROMPT);
    expect(result.needsMoreInfo).toBe(false);
    expect(result.missingQuestions).toEqual([]);
    expect(result.markdownReport).toMatch(/CQL Query Help/i);
    expect(result.markdownReport).not.toMatch(/\{\{base_url\}\}/);
    expect(result.markdownReport).not.toMatch(/When did this start/i);
    expect(result.introMarkdown).toMatch(/CQL query help/i);
  });

  it("orchestrate inference picks playbook endpoints, not CFTR incident", () => {
    let q = enrichSupportQuery({ text: ORCHESTRATE_PROMPT });
    q = enrichWithEndpointInference(q);
    expect(q.endpoint).toMatch(/playbook/i);
    expect(q.endpoint).not.toMatch(/incident\/qb\/extended/i);
    expect(q.endpoint).not.toMatch(/\{\{base_url\}\}/);
  });

  it("CQL thread history does not block latest CQL-only message", () => {
    const combined = `${ORCHESTRATE_PROMPT}\n${CQL_PROMPT}`;
    const latest = CQL_PROMPT;
    expect(isCqlAuthoringRequest(combined, { text: combined }, { latestMessage: latest })).toBe(true);
    expect(missingInfoQuestions({ text: combined })).toEqual([]);
  });
});

describe("regression — tenant URL display", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("resolves CFTR Postman placeholder for investigation markdown", () => {
    process.env.CFTR_BASE_URL = "https://cftr.example.com/api";
    process.env.CFTR_API_KEY = "test";
    let q = enrichSupportQuery({ text: ORCHESTRATE_PROMPT });
    q = enrichWithEndpointInference(q);
    const md = formatInvestigationMarkdown({ query: q });
    expect(md).not.toContain("{{base_url}}");
  });

  it("formats CTIX paths with configured base URL", () => {
    process.env.CTIX_BASE_URL = "https://tenant.example.com/ctixapi";
    process.env.CTIX_CLIENT_ID = "id";
    process.env.CTIX_CLIENT_SECRET = "secret";
    const out = formatApiEndpointDisplay("/v3/indicators/search/", {
      method: "POST",
      productId: "ctix",
    });
    expect(out).toBe("POST https://tenant.example.com/ctixapi/v3/indicators/search/");
  });
});

describe("regression — CTIX 401 still investigates", () => {
  it("does not treat 401 incident as CQL-only", () => {
    expect(isCqlAuthoringRequest(CTIX_401, { text: CTIX_401, statusCode: 401 })).toBe(false);
    const c = classifyUserIntent({ message: CTIX_401 });
    expect(c.primaryIntent).not.toBe("generate_cql");
    expect(chooseAgentRoute(c, {}, CTIX_401).kind).not.toBe("cql");
  });
});
