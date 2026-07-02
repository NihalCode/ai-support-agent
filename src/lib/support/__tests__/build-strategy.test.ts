import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveBuildExecutionMode } from "../build-app/build-strategy";
import { shouldMockProjectCommands } from "../build-app/command-runner";

describe("build execution strategy", () => {
  const prev = { VERCEL: process.env.VERCEL, TEST: process.env.TEST_MODE, TOKEN: process.env.VERCEL_TOKEN };

  beforeEach(() => {
    delete process.env.TEST_MODE;
    delete process.env.BUILD_APP_FORCE_MOCK;
    delete process.env.BUILD_APP_MOCK_ON_VERCEL;
    delete process.env.BUILD_APP_BUILD_WORKER_URL;
  });

  afterEach(() => {
    process.env.VERCEL = prev.VERCEL;
    if (prev.TEST === undefined) delete process.env.TEST_MODE;
    else process.env.TEST_MODE = prev.TEST;
    if (prev.TOKEN === undefined) delete process.env.VERCEL_TOKEN;
    else process.env.VERCEL_TOKEN = prev.TOKEN;
  });

  it("uses vercel-remote on Vercel when token is configured", () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_TOKEN = "test-token";
    expect(resolveBuildExecutionMode()).toBe("vercel-remote");
    expect(shouldMockProjectCommands()).toBe(false);
  });

  it("uses local npm on Vercel without token instead of auto-mock", () => {
    process.env.VERCEL = "1";
    delete process.env.VERCEL_TOKEN;
    expect(resolveBuildExecutionMode()).toBe("local");
    expect(shouldMockProjectCommands()).toBe(false);
  });

  it("mocks only in test mode", () => {
    process.env.TEST_MODE = "true";
    expect(resolveBuildExecutionMode()).toBe("mock");
    expect(shouldMockProjectCommands()).toBe(true);
  });
});
