import { defineConfig } from "@playwright/test";

/** Live Auth0 smoke tests against a deployed URL (no local webServer). */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "auth-oauth.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.AUTH0_E2E_BASE_URL ?? "https://ai-support-agent-ecru.vercel.app",
  },
});
