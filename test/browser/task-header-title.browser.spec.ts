import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
test(`scrolling plays visible fade and slide frames in both directions with motion preference ${reducedMotion}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await page.goto("/tasks/T-0001");
  const title = page.locator(".task-header-title");
  await expect(title).toHaveText("Inspect existing coordination");
  const frames = await title.evaluate(async (element) => {
    const results: { direction: string; opacity: number; offset: number; time: number }[] = [];
    for (const [direction, top] of [["in", 500], ["out", 0]] as const) {
      window.scrollTo(0, top);
      const started = performance.now();
      while (performance.now() - started < 350) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const style = getComputedStyle(element);
        results.push({ direction, opacity: Number(style.opacity),
          offset: new DOMMatrixReadOnly(style.transform).m42, time: performance.now() });
      }
    }
    return results;
  });
  for (const direction of ["in", "out"]) {
    const intermediate = frames.filter((frame) => frame.direction === direction && frame.opacity > 0 && frame.opacity < 1);
    expect(intermediate.length).toBeGreaterThanOrEqual(3);
    expect(intermediate.at(-1)!.time - intermediate[0]!.time).toBeGreaterThanOrEqual(60);
    expect(intermediate.some((frame) => frame.offset > 1)).toBe(true);
  }
});
}

for (const theme of ["dark", "light"] as const) {
  for (const width of [1100, 420]) {
    test(`task title appears behind the sticky header and returns to its heading in ${theme} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/tasks/T-0001");
      await setAppearance(page, theme);
      const title = page.locator(".task-header-title");
      await expect(title).toHaveText("Inspect existing coordination");
      await expect(title).toHaveAttribute("aria-hidden", "true");
      const heading = page.getByRole("heading", { name: "Inspect existing coordination", exact: true });
      const header = page.locator(".detail-topbar");
      const initialHeaderHeight = (await header.boundingBox())!.height;
      const cutoff = await heading.evaluate((element) =>
        element.getBoundingClientRect().bottom - document.querySelector(".detail-topbar")!.getBoundingClientRect().bottom);
      await page.evaluate((top) => window.scrollTo(0, top), cutoff - 8);
      await expect(title).toHaveAttribute("aria-hidden", "true");
      await page.evaluate((top) => window.scrollTo(0, top), cutoff + 8);
      await expect(title).toHaveAttribute("aria-hidden", "false");
      await expect(title).toHaveCSS("opacity", "1");
      expect((await header.boundingBox())!.height).toBe(initialHeaderHeight);
      expect(await contrastRatio(title)).toBeGreaterThan(4.5);
      const [backBounds, titleBounds, controlsBounds] = await Promise.all([
        page.getByRole("link", { name: "Back to board" }).boundingBox(),
        title.boundingBox(), page.locator(".automation-control").boundingBox(),
      ]);
      expect(titleBounds!.x).toBeGreaterThanOrEqual(backBounds!.x + backBounds!.width);
      expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(width);
      if (width === 1100) {
        expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(controlsBounds!.x);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(title).toHaveAttribute("aria-hidden", "true");
      await expect(title).toHaveCSS("opacity", "0");
      await expect(heading).toBeInViewport();
    });
  }
}

test("a long header title stays contained through live renaming and responsive resizing", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/tasks/T-0001");
  await setAppearance(page, "dark");
  const title = page.locator(".task-header-title");
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(title).toHaveAttribute("aria-hidden", "false");
  const detail = await (await page.request.get("/api/tasks/T-0001")).json();
  const renamed = "A long task title explaining the next framework improvement and its expected behavior across several views";
  const response = await page.request.patch("/api/tasks/T-0001", { data: {
    title: renamed, description: detail.task.description,
    expectedRevision: detail.task.revision, idempotencyKey: "sticky-header-rename",
  } });
  expect(response.ok()).toBe(true);
  await expect(title).toHaveText(renamed);
  await expect(title).toHaveAttribute("title", renamed);
  for (const width of [820, 420, 1100]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(title).toHaveAttribute("aria-hidden", "false");
    expect(await title.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: "test-results/task-header-title-desktop.png" });
  await page.setViewportSize({ width: 420, height: 700 });
  await page.screenshot({ path: "test-results/task-header-title-narrow.png" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(title).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(title).toHaveCount(0);
});

