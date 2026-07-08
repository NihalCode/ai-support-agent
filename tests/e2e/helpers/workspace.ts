import { expect, type Page } from "@playwright/test";

const PRODUCT_MODE_KEY = "ai-support-product-mode";

/** Open an AppSelect and choose an option by accessible name. */
export async function selectAppSelectOption(
  page: Page,
  testId: string,
  optionName: RegExp | string
) {
  await page.getByTestId(`${testId}-trigger`).click({ force: true });
  const menu = page.getByTestId(`${testId}-menu`);
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: optionName }).click({ force: true });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden({ timeout: 5000 });
}

export async function closeChatDockIfOpen(page: Page) {
  const dockClose = page.getByTestId("chat-dock-close");
  if (await dockClose.isVisible().catch(() => false)) {
    await dockClose.click();
  }
}

/** Persist developer product mode and wait for shell to reflect it. */
export async function switchToDeveloperMode(page: Page) {
  await page.evaluate((key) => {
    localStorage.setItem(key, "developer");
  }, PRODUCT_MODE_KEY);
  await page.reload();
  await expect(page.locator('[data-product-mode="developer"]')).toHaveAttribute(
    "data-product-mode",
    "developer",
    { timeout: 15_000 }
  );
}

export async function switchToSupportMode(page: Page) {
  await page.evaluate((key) => {
    localStorage.setItem(key, "client");
  }, PRODUCT_MODE_KEY);
  await page.reload();
  await expect(page.locator('[data-product-mode="client"]')).toHaveAttribute(
    "data-product-mode",
    "client",
    { timeout: 15_000 }
  );
}
