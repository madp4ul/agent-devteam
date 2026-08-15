import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("coordination.desktop-notifications.consent", "declined");
    if (sessionStorage.getItem("theme-test-initialized") === null) {
      localStorage.removeItem("coordination-theme");
      sessionStorage.setItem("theme-test-initialized", "true");
    }
  });
});

test("system theme is applied before the app is visible and follows preference changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(await openAppearance(page)).toHaveValue("system");
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveCSS("background-color", "rgb(242, 244, 239)");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("appearance control keeps readable text in light Settings", async ({ page }) => {
  await page.goto("/");
  const appearance = await openAppearance(page);
  await appearance.selectOption("light");

  await expect(appearance).toHaveCSS("color", "rgb(20, 34, 28)");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const appearanceCategory = dialog.getByRole("button", { name: "Appearance" });
  const notificationsCategory = dialog.getByRole("button", { name: "Notifications" });
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 254, 249)");
  await expect(appearanceCategory).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(appearanceCategory).toHaveCSS("background-color", "rgb(23, 78, 58)");
  await expect(notificationsCategory).toHaveCSS("color", "rgb(20, 34, 28)");
  await expect(notificationsCategory).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await notificationsCategory.click();
  await expect(notificationsCategory).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(notificationsCategory).toHaveCSS("background-color", "rgb(23, 78, 58)");
  await expect(appearanceCategory).toHaveCSS("color", "rgb(20, 34, 28)");
  await expect(dialog.locator(".settings-content")).toHaveCSS("color", "rgb(20, 34, 28)");
});

test("task description stays prominent without competing with the dark task title", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await setAppearance(page, "dark");

  await expect(page.locator(".task-heading h1")).toHaveCSS("color", "rgb(237, 243, 239)");
  await expect(page.locator(".description")).toHaveCSS("color", "rgb(210, 221, 215)");
  await expect(page.locator(".authored-prose").first()).toHaveCSS("color", "rgb(237, 243, 239)");

  await setAppearance(page, "light");
  await expect(page.locator(".description")).toHaveCSS("color", "rgb(77, 91, 84)");
});

test("explicit theme persists across navigation and reload and overrides the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await setAppearance(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/tasks/T-0002");
  await expect(await openAppearance(page)).toHaveValue("dark");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(await openAppearance(page)).toHaveValue("dark");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await setAppearance(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(242, 244, 239)");
  await expect(page.locator(".detail-panel").first()).toHaveCSS("background-color", "rgb(255, 254, 249)");
});

test("semantic board, task, modal, transcript, attention, and error surfaces use the dark palette", async ({ page }) => {
  await page.goto("/");
  await setAppearance(page, "dark");

  await expect(page.locator(".needs-attention")).toHaveCSS("background-color", "rgb(51, 43, 25)");
  await expect(page.locator(".board-column.user-owned").first()).toHaveCSS("background-color", "rgb(42, 39, 32)");
  await page.getByRole("button", { name: "Show archived tasks" }).click();
  await expect(page.locator(".archive-toggle")).toHaveCSS("background-color", "rgb(155, 126, 168)");

  await page.goto("/tasks/T-0001");
  await expect(page.locator(".comment-entry article").first()).toHaveCSS("background-color", "rgb(50, 43, 24)");
  await page.getByRole("button", { name: /View conversation/ }).first().click();
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(29, 37, 33)");
  await expect(page.locator("pre").first()).toHaveCSS("background-color", "rgb(10, 16, 13)");
  await page.getByRole("button", { name: "Close" }).click();

  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.startup = {
      mode: "configuration-error",
      diagnostics: [{
        file: "process.yaml",
        line: 4,
        column: 3,
        invalidValue: "missing-agent",
        rule: "Watching agents must exist.",
        consequence: "Automation cannot start.",
        correction: "Add the agent or change the watcher.",
      }],
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("coordination-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".configuration-error li")).toHaveCSS("background-color", "rgb(255, 243, 239)");
  await page.evaluate(() => localStorage.setItem("coordination-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".configuration-error li")).toHaveCSS("background-color", "rgb(72, 37, 31)");
});

test("dark interactive controls keep readable contrast without turning secondary actions into bright blocks", async ({ page }) => {
  await page.goto("/");
  await setAppearance(page, "dark");

  const dragHandle = page.getByRole("button", { name: "Drag T-0002" });
  await expect(dragHandle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await contrastRatio(dragHandle)).toBeGreaterThanOrEqual(4.5);

  await page.goto("/tasks/T-0001");
  const showMore = page.getByRole("button", { name: /Show \d+ more lines?/ }).first();
  await expect(showMore).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await contrastRatio(showMore)).toBeGreaterThanOrEqual(4.5);

  const openFolder = page.getByRole("button", { name: "Open folder" });
  await expect(openFolder).toHaveCSS("background-color", "rgb(50, 110, 81)");
  expect(await contrastRatio(openFolder)).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("button", { name: "More ways to open workspace" }).click();
  const openInCode = page.getByRole("menuitem", { name: "Open in Visual Studio Code" });
  await expect(openInCode).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await contrastRatio(openInCode)).toBeGreaterThanOrEqual(4.5);

  const post = page.getByRole("button", { name: "Post" });
  await expect(post).toHaveCSS("background-color", "rgb(50, 110, 81)");
  expect(await contrastRatio(post)).toBeGreaterThanOrEqual(4.5);

  const commentMarker = page.locator(".comment-entry .timeline-marker").first();
  expect(await contrastRatio(commentMarker)).toBeGreaterThanOrEqual(4.5);
});

test("conversation index remains quiet and readable in dark and light appearances", async ({ page }) => {
  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    const row = page.getByRole("region", { name: "Conversations" }).getByRole("button").first();

    await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await row.hover();
    await expect(row).toHaveCSS("color", theme === "dark" ? "rgb(237, 243, 239)" : "rgb(20, 34, 28)");
    await expect(row).toHaveCSS("background-color", theme === "dark" ? "rgb(42, 53, 47)" : "rgb(233, 237, 231)");
    expect(await contrastRatio(row)).toBeGreaterThanOrEqual(4.5);

    await row.focus();
    await expect(row).toHaveCSS("outline-style", "solid");
    await expect(row).toHaveCSS("outline-width", "2px");
    await expect(row).toHaveCSS("outline-color", theme === "dark" ? "rgb(168, 206, 233)" : "rgb(49, 81, 107)");
  }
});

test("queued activation dismissal matches secondary round controls in both themes", async ({ page }) => {
  await page.route("**/api/tasks/T-0002", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.task.activations = [{
      id: "visual-dismissal",
      targetAgentId: "implementer",
      status: "queued",
      reason: { type: "column-entry", sourceEventId: "visual-dismissal-source" },
      attempts: [],
      startupFailure: null,
      recovery: null,
      stale: false,
      model: null,
      reasoningEffort: null,
      dismissal: { mayStartNext: false },
    }];
    body.inspection.run = {
      status: "queued",
      activeAgentId: null,
      queuedActivationCount: 1,
      failedActivationCount: 0,
    };
    body.activeRun = null;
    await route.fulfill({ response, json: body });
  });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/tasks/T-0002");
    await setAppearance(page, theme);
    const dismiss = page.getByRole("button", { name: "Dismiss activation for Implementation Agent" });
    await expect(dismiss).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(dismiss.locator("svg")).toHaveCount(1);
    expect(await dismiss.evaluate((button) => {
      const icon = button.querySelector("svg")!;
      const buttonRect = button.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      return {
        x: Math.abs(iconRect.x + iconRect.width / 2 - (buttonRect.x + buttonRect.width / 2)),
        y: Math.abs(iconRect.y + iconRect.height / 2 - (buttonRect.y + buttonRect.height / 2)),
      };
    })).toEqual({ x: 0, y: 0 });
  }
});

async function openAppearance(page: import("@playwright/test").Page): Promise<import("@playwright/test").Locator> {
  await page.getByRole("button", { name: /Settings/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: "Appearance" }).click();
  return dialog.getByRole("combobox", { name: "Appearance" });
}

async function setAppearance(
  page: import("@playwright/test").Page,
  theme: "light" | "dark",
): Promise<void> {
  await (await openAppearance(page)).selectOption(theme);
  await page.keyboard.press("Escape");
}

async function contrastRatio(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const parse = (color: string): [number, number, number] => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (channels?.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
      return channels as [number, number, number];
    };
    const luminance = (color: string): number => {
      const channels = parse(color).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor === "rgba(0, 0, 0, 0)"
      ? getComputedStyle(element.parentElement ?? document.documentElement).backgroundColor
      : style.backgroundColor);
    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);
    return (lighter + 0.05) / (darker + 0.05);
  });
}
