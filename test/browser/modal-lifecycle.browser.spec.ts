import { expect, test } from "@playwright/test";

test("nested and successive dialogs share focus, dismissal, and scroll-lock behavior", async ({ page }) => {
  let releasePolicy!: () => void;
  const policyReleased = new Promise<void>((resolve) => { releasePolicy = resolve; });
  await page.route("**/api/settings/notifications", async (route) => {
    await policyReleased;
    await route.continue();
  });
  await page.addInitScript(() => {
    localStorage.removeItem("coordination.desktop-notifications.consent");
    class ControlledNotification {
      static permission: NotificationPermission = "default";
      static async requestPermission(): Promise<NotificationPermission> { return "default"; }
      onclick: (() => void) | null = null;
      constructor(_title: string, _options?: NotificationOptions) {}
      close(): void {}
    }
    Object.defineProperty(window, "Notification", { value: ControlledNotification, configurable: true });
  });
  await page.goto("/");

  const createTrigger = page.getByRole("button", { name: "Create task in Backlog" });
  await createTrigger.click();
  const createDialog = page.getByRole("dialog", { name: "Create task", exact: true });
  const title = createDialog.getByRole("textbox", { name: "Outcome-oriented title" });
  await expect(title).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  releasePolicy();
  const consentDialog = page.getByRole("dialog", { name: "Allow desktop notifications?" });
  await expect(consentDialog).toBeVisible();
  const allow = consentDialog.getByRole("button", { name: "Yes, ask browser" });
  const decline = consentDialog.getByRole("button", { name: "No", exact: true });
  await allow.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(decline).toBeFocused();
  await decline.focus();
  await page.keyboard.press("Tab");
  await expect(allow).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(consentDialog).toBeHidden();
  await expect(createDialog).toBeVisible();
  await expect(title).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(createDialog).toBeHidden();
  await expect(createTrigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");

  const settingsTrigger = page.getByRole("button", { name: /Settings/ });
  await settingsTrigger.click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.locator(".settings-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(settingsDialog).toBeHidden();
  await expect(settingsTrigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
});
