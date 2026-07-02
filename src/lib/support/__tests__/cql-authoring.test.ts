import { describe, expect, it } from "vitest";

import { isCqlAuthoringRequest, missingInfoQuestions } from "../investigation/extract-query";

describe("isCqlAuthoringRequest", () => {
  it("detects pure CQL authoring prompts", () => {
    const text =
      "Write a CQL query for malicious IP indicators in the last 24 hours with confidence >= 90. Link the relevant CQL grammar docs.";
    expect(isCqlAuthoringRequest(text)).toBe(true);
    expect(missingInfoQuestions({ text })).toEqual([]);
  });

  it("detects clarification that negates incident", () => {
    const text =
      "This isn't a failure report — I'm requesting a CQL query. N/A no outage. I only need help writing CQL for malicious IPs with confidence >= 90.";
    expect(isCqlAuthoringRequest(text)).toBe(true);
    expect(missingInfoQuestions({ text })).toEqual([]);
  });

  it("does not treat API 401 incidents as CQL-only", () => {
    const text = "CTIX API returns 401 and I need CQL to debug indicators";
    expect(isCqlAuthoringRequest(text, { text, statusCode: 401 })).toBe(false);
  });

  it("treats latest CQL message as authoring even when thread history mentions timeout", () => {
    const combined =
      "Orchestrate playbook Block Malicious IP timed out after 45s.\nWrite a CQL query for malicious IP indicators in the last 24 hours with confidence >= 90. Link the relevant CQL grammar docs.";
    const latest =
      "Write a CQL query for malicious IP indicators in the last 24 hours with confidence >= 90. Link the relevant CQL grammar docs.";
    expect(isCqlAuthoringRequest(combined, { text: combined }, { latestMessage: latest })).toBe(true);
    expect(missingInfoQuestions({ text: combined })).toEqual([]);
  });
});
