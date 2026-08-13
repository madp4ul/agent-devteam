import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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
  await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue("system");
  await expect(page.locator("body")).not.toHaveCSS("background-color", "rgb(242, 244, 239)");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("appearance control keeps readable text in the light top bar", async ({ page }) => {
  await page.goto("/");
  const appearance = page.getByRole("combobox", { name: "Appearance" });
  await appearance.selectOption("light");

  await expect(appearance).toHaveCSS("color", "rgb(20, 34, 28)");
});

test("task description stays prominent without competing with the dark task title", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const appearance = page.getByRole("combobox", { name: "Appearance" });
  await appearance.selectOption("dark");

  await expect(page.locator(".task-heading h1")).toHaveCSS("color", "rgb(237, 243, 239)");
  await expect(page.locator(".description")).toHaveCSS("color", "rgb(210, 221, 215)");
  await expect(page.locator(".authored-prose").first()).toHaveCSS("color", "rgb(237, 243, 239)");

  await appearance.selectOption("light");
  await expect(page.locator(".description")).toHaveCSS("color", "rgb(77, 91, 84)");
});

test("explicit theme persists across navigation and reload and overrides the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const appearance = page.getByRole("combobox", { name: "Appearance" });

  await appearance.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/tasks/T-0002");
  await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(242, 244, 239)");
  await expect(page.locator(".detail-panel").first()).toHaveCSS("background-color", "rgb(255, 254, 249)");
});

test("theme control is keyboard operable and changing it preserves board and dialog state", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Filter tasks").fill("Drag this task");
  await page.getByRole("button", { name: "Create task in Backlog" }).click();
  const dialog = page.getByRole("dialog", { name: "Create task" });
  await dialog.getByLabel("Outcome-oriented title").fill("Keep this draft intact");

  await page.getByRole("combobox", { name: "Appearance" }).evaluate((select) => {
    const element = select as HTMLSelectElement;
    element.value = "dark";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Outcome-oriented title")).toHaveValue("Keep this draft intact");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByLabel("Filter tasks")).toHaveValue("Drag this task");

  await page.setViewportSize({ width: 560, height: 800 });
  await page.getByRole("radio", { name: "Column layout" }).check();
  const lane = page.getByTestId("board-lane").first();
  await lane.evaluate((element) => { element.scrollLeft = 120; });
  const scrollLeft = await lane.evaluate((element) => element.scrollLeft);
  expect(scrollLeft).toBeGreaterThan(0);

  const appearance = page.getByRole("combobox", { name: "Appearance" });
  await appearance.focus();
  await appearance.press("Home");
  await appearance.press("ArrowDown");
  await expect(appearance).toHaveValue("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBe(scrollLeft);
});

test("semantic board, task, modal, transcript, attention, and error surfaces use the dark palette", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");

  await expect(page.locator(".needs-attention")).toHaveCSS("background-color", "rgb(51, 43, 25)");
  await expect(page.locator(".board-column.user-owned").first()).toHaveCSS("background-color", "rgb(42, 39, 32)");
  await page.getByRole("button", { name: "Show archived tasks" }).click();
  await expect(page.locator(".archive-toggle")).toHaveCSS("background-color", "rgb(155, 126, 168)");

  await page.goto("/tasks/T-0001");
  await expect(page.locator(".comment-entry article").first()).toHaveCSS("background-color", "rgb(50, 43, 24)");
  await page.getByRole("button", { name: /View transcript/ }).first().click();
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
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");

  const dragHandle = page.getByRole("button", { name: "Drag T-0002" });
  await expect(dragHandle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await contrastRatio(dragHandle)).toBeGreaterThanOrEqual(4.5);

  await page.goto("/tasks/T-0001");
  const showMore = page.getByRole("button", { name: "Show more" }).first();
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
    await page.getByRole("combobox", { name: "Appearance" }).selectOption(theme);
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
