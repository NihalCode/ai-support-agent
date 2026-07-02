import { describe, expect, it } from "vitest";

import {
  canConfigureIntegrations,
  canConfigureJira,
  canUseDeveloperMode,
} from "@/lib/auth/roles";
import { maskEmail } from "@/integrations/core/IntegrationMetadataStore";
import { isEnterpriseIntegrationId } from "@/integrations/core/integration-route-handlers";
import { healthResult } from "@/integrations/core/EnterpriseConnector";

describe("enterprise integration ids", () => {
  it("recognizes enterprise integrations", () => {
    expect(isEnterpriseIntegrationId("slack")).toBe(true);
    expect(isEnterpriseIntegrationId("jira")).toBe(true);
    expect(isEnterpriseIntegrationId("github")).toBe(false);
  });
});

describe("maskEmail", () => {
  it("masks local part", () => {
    expect(maskEmail("alice@example.com")).toBe("al***@example.com");
  });
});

describe("healthResult", () => {
  it("marks mock health checks", () => {
    const result = healthResult(true, "mock", true);
    expect(result.mock).toBe(true);
    expect(result.status).toBe("success");
  });
});

describe("canConfigureJira", () => {
  it("allows owner/admin/developer with integrations write", () => {
    expect(canConfigureJira("owner")).toBe(true);
    expect(canConfigureJira("developer")).toBe(true);
  });

  it("blocks support agents and viewers", () => {
    expect(canConfigureJira("support_agent")).toBe(false);
    expect(canConfigureJira("viewer")).toBe(false);
  });

  it("requires developer mode permission", () => {
    expect(canUseDeveloperMode("support_agent")).toBe(false);
    expect(canConfigureIntegrations("support_agent")).toBe(false);
  });
});
