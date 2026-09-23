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
  const showMore = description.getByRole("button", { name: "Show more" });

  await expect(showMore).toHaveAttribute("aria-expanded", "false");
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
  const showMore = description.getByRole("button", { name: "Show more" });
  await expect(showMore).toBeVisible();
  expect(await visibleRenderedLineCount(content)).toBe(15);

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await expect(showMore).toBeVisible();
  expect(await visibleRenderedLineCount(content)).toBe(15);

  await description.evaluate((element) => {
    (element as HTMLElement).style.fontFamily = "monospace";
  });
  await expect(showMore).toBeVisible();
  expect(await visibleRenderedLineCount(content)).toBe(15);

  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((nextTheme) => {
      localStorage.setItem("coordination-theme", nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    }, theme);
    await expect(showMore).toBeVisible();
    await expect(showMore).toHaveCSS("visibility", "visible");
    expect(await visibleRenderedLineCount(content)).toBe(15);
  }
});

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
