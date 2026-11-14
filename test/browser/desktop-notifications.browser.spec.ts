import type { Route } from "@playwright/test";

import { expect, test } from "./browser-fixture.ts";

for (const scenario of ["open conversation", "permission change"] as const) {
  test(`a mention is delivered once across slow reads with ${scenario}`, async ({ page }) => {
    const pending: Route[] = [];
    let initialized = false;
    await page.route("**/api/notification-occurrences*", async (route) => {
      const after = new URL(route.request().url()).searchParams.get("after");
      if (after === null) {
        await route.fulfill({ json: { cursor: 0, occurrences: [] } });
        initialized = true;
      } else if (after === "0") {
        pending.push(route);
      } else {
        await route.fulfill({ json: { cursor: 1, occurrences: [] } });
      }
    });
    await page.addInitScript<NotificationPermission>((permission) => {
      localStorage.setItem("coordination.desktop-notifications.consent", "accepted");
      const tags: Array<string | undefined> = [];
      class ControlledNotification {
        static permission: NotificationPermission = permission;
        static async requestPermission(): Promise<NotificationPermission> {
          ControlledNotification.permission = "granted";
          return "granted";
        }
        constructor(_title: string, options: NotificationOptions = {}) { tags.push(options.tag); }
        close(): void {}
      }
      Object.defineProperty(window, "Notification", { value: ControlledNotification, configurable: true });
      Object.assign(window, { __notificationTags: tags });
    }, scenario === "permission change" ? "default" : "granted");
    await page.clock.install();
    await page.goto("/tasks/T-0001");
    await expect.poll(() => initialized).toBe(true);
    if (scenario === "open conversation") {
      await page.getByRole("button", { name: /View conversation/ }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
    await page.clock.runFor(1_500);
    await expect.poll(() => pending.length).toBeGreaterThanOrEqual(1);
    if (scenario === "permission change") {
      await page.getByRole("button", { name: /Settings/ }).click();
      await page.getByRole("button", { name: "Allow notifications" }).click();
      await expect(page.getByText("This browser is allowed to deliver notifications.")).toBeVisible();
    }
    // Hold the read across two more poll intervals, as on a busy local host.
    await page.clock.runFor(3_000);
    const batch = {
      cursor: 1,
      occurrences: [{
        id: "single-mention", type: "user-mention", occurredAt: "2026-11-14T12:00:00.000Z",
        task: { id: "T-0001", title: "Mentioned task", boardId: "delivery", boardName: "Product delivery" },
        attentionReasonId: "mention-attention",
      }],
    };
    for (const route of pending) await route.fulfill({ json: batch });
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __notificationTags: string[] }).__notificationTags,
    )).toEqual(["single-mention"]);
    await page.clock.runFor(4_500);
    expect(await page.evaluate(() =>
      (window as typeof window & { __notificationTags: string[] }).__notificationTags,
    )).toEqual(["single-mention"]);
  });
}
