import type { Locator } from "@playwright/test";

import { expect, test } from "./browser-fixture.ts";

const longFormattedDescription = [
  "## Scope",
  "",
  ...Array.from(
    { length: 24 },
    (_, index) => `Rendered requirement ${index + 1} stays visible as formatted **Markdown** content.  `,
  ),
].join("\n");

test("task descriptions collapse after 15 rendered lines and disclose with the keyboard", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = longFormattedDescription;
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const description = page.getByRole("region", { name: "Description" });
  const content = description.locator(".task-description-prose");
  const showMore = description.getByRole("button", { name: "Show 10 more lines", exact: true });

  await expect(showMore).toHaveAttribute("aria-expanded", "false");
  await expect(showMore).toHaveAttribute("aria-controls", "task-description-T-0001");
  expect(await visibleRenderedLineCount(content)).toBe(15);
  expect(await content.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await showMore.press("Enter");
  const showLess = description.getByRole("button", { name: "Show less" });
  await expect(showLess).toHaveAttribute("aria-expanded", "true");
  expect(await visibleRenderedLineCount(content)).toBeGreaterThan(15);
  expect(await content.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true);

  await showLess.press("Space");
  await expect(showMore).toHaveAttribute("aria-expanded", "false");
  expect(await visibleRenderedLineCount(content)).toBe(15);
  expect(await description.evaluate((element) => {
    const contentBounds = element.querySelector(".task-description-prose")!.getBoundingClientRect();
    const buttonBounds = element.querySelector(".text-disclosure")!.getBoundingClientRect();
    return buttonBounds.top >= contentBounds.bottom;
  })).toBe(true);
});

test("short task descriptions stay natural without a disclosure or reserved space", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "A short **Markdown** description.";
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const description = page.getByRole("region", { name: "Description" });
  await expect(description.locator(".text-disclosure")).toHaveCount(0);
  await expect(description.locator(".task-description-prose")).toHaveCSS("overflow", "visible");
});

test("task description overflow follows responsive width, font, and appearance changes", async ({ page }) => {
  const responsiveDescription = Array.from(
    { length: 12 },
    (_, index) => `Responsive sentence ${index + 1} has enough words to wrap at narrow task-detail widths.`,
  ).join(" ");
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = responsiveDescription;
    await route.fulfill({ response, json: detail });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tasks/T-0001");
  const description = page.getByRole("region", { name: "Description" });
  const content = description.locator(".task-description-prose");
  await expect(description.locator(".text-disclosure")).toHaveCount(0);

  await page.setViewportSize({ width: 420, height: 900 });
  const showMore = description.getByRole("button", { name: /^Show \d+ more lines?$/ });
  await expect(showMore).toBeVisible();
  expect(await visibleRenderedLineCount(content)).toBe(15);
  await expectCountMatchesRevealedLines(description);

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await expect(showMore).toBeVisible();
  expect(await visibleRenderedLineCount(content)).toBe(15);
  await expectCountMatchesRevealedLines(description);

  await description.evaluate((element) => {
    (element as HTMLElement).style.fontFamily = "monospace";
  });
  await expect(showMore).toBeVisible();
  expect(await visibleRenderedLineCount(content)).toBe(15);
  await expectCountMatchesRevealedLines(description);

  await content.locator(".description").evaluate((element: HTMLElement) => {
    element.style.fontSize = "24px";
    document.fonts.dispatchEvent(new Event("loadingdone"));
  });
  await expectCountMatchesRevealedLines(description);

  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((nextTheme) => {
      localStorage.setItem("coordination-theme", nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    }, theme);
    await expect(showMore).toBeVisible();
    await expect(showMore).toHaveCSS("visibility", "visible");
    expect(await visibleRenderedLineCount(content)).toBe(15);
    await expectCountMatchesRevealedLines(description);
  }

  await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
  await description.evaluate((element: HTMLElement) => element.style.removeProperty("font-family"));
  await content.locator(".description").evaluate((element: HTMLElement) => element.style.removeProperty("font-size"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(description.locator(".text-disclosure")).toHaveCount(0);
});

for (const theme of ["dark", "light"] as const) {
  test(`inline code and prose on the same row count as one rendered line in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((appearance) => localStorage.setItem("coordination-theme", appearance), theme);
    await page.route("**/api/tasks/T-0001", async (route) => {
      const response = await route.fetch();
      const detail = await response.json();
      detail.task.description = Array.from(
        { length: 16 }, (_, index) => `Requirement \`${index + 1}\` stays on one row.  `,
      ).join("\n");
      await route.fulfill({ response, json: detail });
    });
    await page.goto("/tasks/T-0001");
    const description = page.getByRole("region", { name: "Description" });
    const disclosure = description.locator(".text-disclosure");
    await expect(disclosure).toHaveText("Show 1 more line");
    const content = description.locator(".task-description-prose");
    const code = content.locator("code");
    expect(await code.nth(14).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().bottom <= element.closest(".task-description-prose")!.getBoundingClientRect().bottom;
    })).toBe(true);
    expect(await code.nth(15).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().top >= element.closest(".task-description-prose")!.getBoundingClientRect().bottom;
    })).toBe(true);
    await disclosure.click();
    await expect(disclosure).toHaveText("Show less");
    expect(await content.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true);
  });

  for (const width of [1280, 420]) {
    test(`description counts follow live content and preserve expansion at ${width}px in ${theme} mode`, async ({ page }) => {
      const lines = (count: number): string => Array.from(
        { length: count }, (_, index) => `Line **${index + 1}**.  `,
      ).join("\n");
      let source = lines(16);
      await page.addInitScript((appearance) => localStorage.setItem("coordination-theme", appearance), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/tasks/T-0001", async (route) => {
        const response = await route.fetch();
        const detail = await response.json();
        detail.task.description = source;
        await route.fulfill({ response, json: detail });
      });
      await page.goto("/tasks/T-0001");
      const description = page.getByRole("region", { name: "Description" });
      const disclosure = description.locator(".text-disclosure");
      await expect(disclosure).toHaveText("Show 1 more line");
      source = lines(18);
      await expect(disclosure).toHaveText("Show 3 more lines");
      await disclosure.press("Enter");
      await expect(disclosure).toHaveText("Show less");
      source = lines(19);
      await expect(description.locator(".description")).toContainText("Line 19.");
      await expect(disclosure).toHaveText("Show less");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      expect(await visibleRenderedLineCount(description.locator(".task-description-prose"))).toBe(19);
      await disclosure.press("Space");
      await expect(disclosure).toHaveText("Show 4 more lines");
      source = lines(15);
      await expect(disclosure).toHaveCount(0);
      expect(await visibleRenderedLineCount(description.locator(".task-description-prose"))).toBe(15);
    });
  }
}

async function expectCountMatchesRevealedLines(description: Locator): Promise<void> {
  const disclosure = description.locator(".text-disclosure");
  await expect(disclosure).toHaveText(/^Show \d+ more lines?$/);
  await disclosure.click();
  await expect(disclosure).toHaveText("Show less");
  const hiddenLines = await visibleRenderedLineCount(description.locator(".task-description-prose")) - 15;
  await disclosure.click();
  await expect(disclosure).toHaveText(`Show ${hiddenLines} more ${hiddenLines === 1 ? "line" : "lines"}`);
}

async function visibleRenderedLineCount(content: Locator): Promise<number> {
  return content.evaluate((element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const lineTops: number[] = [];
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.height === 0 || rect.top >= bounds.bottom - 0.5) continue;
        if (!lineTops.some((top) => Math.abs(top - rect.top) <= 0.5)) lineTops.push(rect.top);
      }
    }
    return lineTops.length;
  });
}
