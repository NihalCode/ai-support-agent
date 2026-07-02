import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handleBuildAppPlan } from "@/lib/support/build-app/orchestrate";
import { deriveAppCopy } from "@/lib/support/build-app/app-copy";

describe("generated app quality", () => {
  it("does not embed raw user prompt in derived title", () => {
    const longPrompt =
      "I need a tool for our support analysts. They should be able to paste an indicator like an IP, domain, URL, or hash.";
    const copy = deriveAppCopy(longPrompt, "indicator-search-dashboard", "Indicator Search");
    expect(copy.title).not.toContain("I need a tool");
    expect(copy.subtitle).not.toContain("support analysts");
  });

  it("plan scaffold does not include full user message in template vars", () => {
    const msg = "Build me an indicator search dashboard for IPs domains and hashes";
    const plan = handleBuildAppPlan({ message: msg });
    const pending = plan.pendingChanges ?? [];
    const page = pending.find((c) => c.path.endsWith("page.tsx") || c.path.includes("Dashboard"));
    const combined = pending.map((c) => c.content).join("\n");
    expect(combined).not.toContain(msg);
    if (page?.content) expect(page.content).not.toContain(msg);
  });

  it("indicator template includes empty state and safe rendering", () => {
    const table = readFileSync(
      path.join(process.cwd(), "templates/indicator-search-dashboard/files/components/ResultsTable.tsx"),
      "utf8"
    );
    expect(table).toMatch(/Run a search|results/i);
    expect(table).not.toMatch(/\[object Object\]|undefined|null/);
  });

  it("package.json template has build script and next dependency", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(process.cwd(), "templates/blank-next-app/files/package.json"), "utf8")
    ) as { scripts: Record<string, string>; dependencies: Record<string, string> };
    expect(pkg.scripts.build).toBeTruthy();
    expect(pkg.dependencies.next).toBeTruthy();
  });
});
