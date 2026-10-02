import { expect, test } from "./browser-fixture.ts";
import type { Locator } from "@playwright/test";

async function expectDocked(composer: Locator, docked: boolean): Promise<void> {
  if (docked) {
    await expect(composer).toHaveClass(/comment-panel-docked/);
    await expect.poll(() => composer.evaluate((panel) =>
      Math.abs(panel.getBoundingClientRect().bottom - innerHeight)
    )).toBeLessThanOrEqual(1);
  } else {
    await expect(composer).not.toHaveClass(/comment-panel-docked/);
  }
}

for (const theme of ["dark", "light"] as const) {
  for (const viewport of [{ width: 1100, height: 1000 }, { width: 1100, height: 1600 }, { width: 420, height: 1600 }]) {
    for (const longDescription of [false, true]) {
      test(`composer adopts initial docking for ${longDescription ? "collapsed" : "short"} description in ${theme} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.addInitScript((appearance) => localStorage.setItem("coordination-theme", appearance), theme);
        await page.route("**/api/tasks/T-0001", async (route) => {
          const response = await route.fetch();
          const detail = await response.json();
          detail.task.description = longDescription
            ? Array.from({ length: 40 }, (_, index) => `Description line ${index + 1}.`).join("  \n")
            : "A short description.";
          await route.fulfill({ response, json: detail });
        });
        await page.goto("/tasks/T-0001");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const composer = page.getByRole("region", { name: "Add comment" });
        await expect(composer).toBeAttached();
        if (longDescription) await expect(page.getByRole("region", { name: "Description" }).getByRole("button", { name: /^Show \d+ more lines?$/ })).toBeVisible();
        await expect.poll(() => composer.evaluate((panel) => {
          const flow = panel.closest(".comment-timeline-flow")!;
          const bounds = panel.getBoundingClientRect();
          const shouldDock = flow.getBoundingClientRect().top + bounds.height <= innerHeight;
          return shouldDock === panel.classList.contains("comment-panel-docked")
            && (!shouldDock || Math.abs(bounds.bottom - innerHeight) <= 1);
        })).toBe(true);
        expect(await page.evaluate(() => scrollY)).toBe(0);
        const bounds = await composer.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      });
    }
  }
}

for (const theme of ["dark", "light"] as const) {
  test(`composer follows description, content, and font layout changes without scrolling in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 1600 });
    await page.addInitScript((appearance) => localStorage.setItem("coordination-theme", appearance), theme);
    let description = Array.from({ length: 80 }, (_, index) => `Description line ${index + 1}.`).join("  \n");
    let needsAttention = false;
    await page.route("**/api/tasks/T-0001", async (route) => {
      const response = await route.fetch();
      const detail = await response.json();
      detail.task.description = description;
      detail.inspection.unresolvedAttention = needsAttention ? Array.from({ length: 20 }, (_, index) => ({
        id: `live-attention-${index}`, type: "user-mention", sourceEventId: detail.task.comments[0].id,
        createdAt: "2026-08-15T12:30:00.000Z",
      })) : [];
      await route.fulfill({ response, json: detail });
    });
    await page.goto("/tasks/T-0001");
    const composer = page.getByRole("region", { name: "Add comment" });
    const draft = composer.getByRole("textbox", { name: "Comment" });
    await expectDocked(composer, true);
    await draft.fill("Keep this draft through layout updates.");
    await page.getByRole("region", { name: "Description" }).getByRole("button", { name: /^Show \d+ more lines?$/ }).evaluate((button: HTMLButtonElement) => button.click());
    await expectDocked(composer, false);
    await page.getByRole("button", { name: "Show less", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await expectDocked(composer, true);

    await page.setViewportSize({ width: 1100, height: 600 });
    await expectDocked(composer, false);
    await page.setViewportSize({ width: 420, height: 1600 });
    await expectDocked(composer, true);

    await page.locator(".task-description-prose .description").evaluate((description: HTMLElement) => {
      description.style.fontSize = "80px";
      description.style.lineHeight = "120px";
      document.fonts.dispatchEvent(new Event("loadingdone"));
    });
    await expectDocked(composer, false);
    await page.locator(".task-description-prose .description").evaluate((description: HTMLElement) => {
      description.style.removeProperty("font-size");
      description.style.removeProperty("line-height");
      document.fonts.dispatchEvent(new Event("loadingdone"));
    });
    await expectDocked(composer, true);

    description = "A short live update.";
    await expect(page.locator("#task-description-T-0001")).toHaveText(description);
    await expectDocked(composer, true);

    needsAttention = true;
    await expect(page.getByRole("region", { name: "Needs attention" })).toBeAttached();
    await expectDocked(composer, false);
    needsAttention = false;
    await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
    await expectDocked(composer, true);
    await expect(draft).toHaveValue("Keep this draft through layout updates.");
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const [composerBounds, sidebarBounds] = await Promise.all([
      composer.boundingBox(), page.locator(".detail-sticky-controls").boundingBox(),
    ]);
    expect(sidebarBounds!.y + sidebarBounds!.height <= composerBounds!.y
      || sidebarBounds!.y >= composerBounds!.y + composerBounds!.height
      || sidebarBounds!.x >= composerBounds!.x + composerBounds!.width).toBe(true);
  });
}
