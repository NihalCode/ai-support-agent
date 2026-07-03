import { test, expect } from "@playwright/test";

test.describe("Invite-only auth UI", () => {
  test("login page shows invite-only copy and no signup", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in with your invited company email.")).toBeVisible();
    await expect(page.getByText("Need access? Ask an administrator for an invite.")).toBeVisible();
    await expect(page.getByTestId("login-continue-google")).toBeVisible();
    await expect(page.getByTestId("login-continue-email")).toBeVisible();
    await expect(page.getByText(/create account/i)).toHaveCount(0);
    await expect(page.getByText(/sign up/i)).toHaveCount(0);
  });

  test("login page maps auth_configuration_error to specific copy", async ({ page }) => {
    await page.goto("/login?error=auth_configuration_error");
    await expect(page.getByTestId("login-error")).toContainText("AUTH0_ACTION_SHARED_SECRET");
    await expect(page.getByTestId("login-error")).not.toContainText(
      "An error occurred during the authorization flow"
    );
  });

  test("login page maps invite_expired to specific copy", async ({ page }) => {
    await page.goto("/login?error=invite_expired");
    await expect(page.getByTestId("login-error")).toContainText("expired");
  });

  test("access denied page renders invite required", async ({ page }) => {
    await page.goto("/access-denied?reason=invite_required");
    await expect(page.getByTestId("access-denied-invite-required")).toBeVisible();
    await expect(page.getByText("Invite required")).toBeVisible();
  });

  test("access denied page renders disabled message", async ({ page }) => {
    await page.goto("/access-denied?reason=disabled");
    await expect(page.getByTestId("access-denied-disabled")).toBeVisible();
  });

  test("invite page without token shows invalid", async ({ page }) => {
    await page.goto("/invite");
    await expect(page.getByTestId("invite-invalid")).toBeVisible();
  });

  test("invite page with bad token shows invalid", async ({ page }) => {
    await page.goto("/invite?token=not-a-valid-token");
    await expect(page.getByTestId("invite-invalid")).toBeVisible();
  });
});
