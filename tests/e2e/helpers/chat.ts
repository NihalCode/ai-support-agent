import { expect, type Page } from "@playwright/test";

/** Send a chat message and wait for the assistant reply to finish streaming. */
export async function sendChatMessage(page: Page, message: string, timeoutMs = 90_000) {
  const input = page.getByTestId("ai-chat-input");
  await expect(input).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("ai-chat-input").fill(message);
  await page.getByTestId("chat-send-button").click();
  const assistant = page.getByTestId("chat-assistant-message").last();
  await expect(assistant).toBeVisible({ timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const nodes = document.querySelectorAll('[data-testid="chat-assistant-message"]');
      const el = nodes[nodes.length - 1];
      return (el?.textContent?.trim().length ?? 0) > 80;
    },
    undefined,
    { timeout: timeoutMs }
  );
  await page.waitForTimeout(800);
  return assistant;
}

export async function assistantText(page: Page): Promise<string> {
  const blocks = page.getByTestId("chat-assistant-message").last();
  return (await blocks.innerText()).toLowerCase();
}

/** Assert AppSelect menu has readable dark-theme contrast. */
export async function expectReadableAppSelectMenu(page: Page, menuTestId: string) {
  const menu = page.getByTestId(menuTestId);
  await expect(menu).toBeVisible();
  const option = menu.locator(".app-select-option").first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  const styles = await menu.evaluate((el) => {
    const opt = el.querySelector(".app-select-option") as HTMLElement | null;
    const menuEl = el as HTMLElement;
    return {
      menuBg: getComputedStyle(menuEl).backgroundColor,
      optionColor: opt ? getComputedStyle(opt).color : "",
    };
  });
  expect(styles.menuBg).not.toBe("rgba(0, 0, 0, 0)");
  expect(styles.optionColor).not.toBe("");
  const rgb = styles.optionColor.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
  const luminance = (0.299 * rgb[0]! + 0.587 * rgb[1]! + 0.114 * rgb[2]!) / 255;
  expect(luminance).toBeGreaterThan(0.5);
}
