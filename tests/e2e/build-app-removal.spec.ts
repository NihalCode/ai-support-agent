import { test, expect } from "@playwright/test";

test.describe("Build App removal", () => {
  test("welcome screen has no Build App prompt card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("chat-welcome-hero")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("prompt-card-build")).toHaveCount(0);
    await expect(page.getByTestId("prompt-card-investigate-api")).toBeVisible();
    await expect(page.getByTestId("prompt-card-cql")).toBeVisible();
  });

  test("sidebar has no Generated Apps nav item", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("activity-build-app")).toHaveCount(0);
  });

  test("build-app API returns deprecated response", async ({ request }) => {
    const res = await request.post("/api/support/build-app", {
      data: { action: "plan", message: "test" },
    });
    expect(res.status()).toBe(410);
    const body = (await res.json()) as { removed?: boolean };
    expect(body.removed).toBe(true);
  });
});
