import { contrastRatio, expect, test } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) {
  test(`retained history never collapses or exposes blank scrollbar regions (${theme})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
    await page.addInitScript(() => {
      const requestFrame = window.requestAnimationFrame.bind(window);
      // A busy render can deliver a frame timestamp older than animation setup time.
      window.requestAnimationFrame = (callback) => requestFrame((timestamp) => callback(timestamp - 1000));
    });
    const record = (index: number) => ({ key: `activity-retained-${index}`, kind: "activity", occurredAt: "2027-01-01", activity: {
      id: `retained-${index}`, type: "task.moved", actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01", details: { fromColumnId: "backlog", toColumnId: "implementation" } } });
    const windowPage = (start: number, size = 50) => ({ records: Array.from({ length: Math.min(size, 1000 - start) }, (_, i) => record(start + i)),
      total: 1000, start, olderCursor: start + size < 1000 ? `older:${start + size}` : null, newerCursor: start > 0 ? `newer:${Math.max(0, start - 50)}` : null, refreshCursor: `refresh:${start}` });
    await page.route("**/api/tasks/T-0001", async (route) => {
      const detail = await (await route.fetch()).json();
      await route.fulfill({ json: { ...detail, timeline: windowPage(0), movementSummary: { total: 1000 } } });
    });
    await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      const source = params.get("sourceId");
      const start = Number(source?.split("-")[1] ?? params.get("cursor")?.split(":")[1] ?? 0);
      expect(Number(params.get("pageSize") ?? 50)).toBeLessThanOrEqual(150);
      await route.fulfill({ json: { available: true, page: windowPage(start, Number(params.get("pageSize") ?? 50)) } });
    });
    await page.route("**/api/tasks/T-0001/movement-map?*", async (route) => {
      const after = Number(new URL(route.request().url()).searchParams.get("after"));
      await route.fulfill({ json: { available: true, map: { movements: after ? [] : Array.from({ length: 1000 }, (_, i) => ({ ...record(i).activity, recordId: record(i).key, sequence: 1000 - i })), cursor: 1000, total: 1000 } } });
    });
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/tasks/T-0001");
    const entries = page.locator(".timeline > [data-history-record]");
    await expect(entries).toHaveCount(50);
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "Load older timeline", exact: true }).evaluate((element) => (element as HTMLButtonElement).click());
      await expect(entries).toHaveCount(100 + i * 50);
    }
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await entries.nth(140).scrollIntoViewIfNeeded();
    const anchor = entries.nth(140);
    const top = await anchor.evaluate((element) => element.getBoundingClientRect().top);
    // Wait for a real polling round, then scroll upward through retained pages.
    await page.waitForResponse((response) => new URL(response.url()).pathname === "/api/tasks/T-0001");
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await anchor.evaluate((element, expected) => Math.abs(element.getBoundingClientRect().top - expected), top)).toBeLessThan(2);
    await page.mouse.wheel(0, -200);
    await expect(entries).toHaveCount(300);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThanOrEqual(height - 2);
    await expect(page.locator("#timeline-source-retained-299")).toHaveCount(1);
    await entries.last().scrollIntoViewIfNeeded();
    const map = page.locator('[data-testid="movement-map"]');
    await expect(map.locator(".movement-map-landmark")).toHaveCount(1000);
    for (const target of [900, 600, 800, 350, 950, 500]) {
      await map.locator(`button[data-source-id="retained-${target}"]`).evaluate((element) => (element as HTMLButtonElement).click());
      const source = page.locator(`#timeline-source-retained-${target}`);
      await expect(source).toBeFocused();
      await expect(source).toBeInViewport();
      await expect(page.locator("#timeline-source-retained-299")).toHaveCount(1);
    }
    await expect(page.locator(".timeline-window-spacer")).toHaveCount(0);
    await map.locator('button[data-source-id="retained-950"]').evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.locator("#timeline-source-retained-950")).toBeFocused();
    await page.evaluate(() => {
      const shift = document.createElement("div"); shift.id = "test-source-layout-shift"; shift.style.height = "2000px";
      document.querySelector('[data-task-section="timeline"]')!.prepend(shift);
    });
    // Hydration/docking can move the target after navigation starts; final alignment uses live geometry.
    await page.waitForTimeout(550);
    await expect(page.locator("#timeline-source-retained-950")).toBeInViewport();
    await page.evaluate(() => document.getElementById("test-source-layout-shift")!.remove());
    await map.locator('button[data-source-id="retained-0"]').evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.locator("#timeline-source-retained-0")).toBeFocused();
    await page.mouse.move(100, 400);
    await page.mouse.wheel(0, 50);
    const manualPosition = await page.evaluate(() => {
      window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2);
      return scrollY;
    });
    // Outlast the 480ms source animation: user input must have canceled its remaining frames.
    await page.waitForTimeout(550);
    expect(await page.evaluate((position) => Math.abs(scrollY - position), manualPosition)).toBeLessThan(2);
    const gap = page.locator(".timeline-history-gap button").first();
    expect(await contrastRatio(gap)).toBeGreaterThanOrEqual(4.5);
    const beforeGap = await entries.count();
    await gap.evaluate((element) => (element as HTMLButtonElement).click());
    await expect.poll(() => entries.count()).toBeGreaterThan(beforeGap);
    for (const fraction of [0.25, 0.5, 0.75]) {
      await page.evaluate((value) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value), fraction);
      await expect.poll(() => page.locator("[data-timeline-record]").evaluateAll((elements) => elements.filter((element) => {
        const bounds = element.getBoundingClientRect(); return bounds.bottom > 80 && bounds.top < innerHeight;
      }).length)).toBeGreaterThan(0);
    }
  });
}

for (const arrival of ["latest-first", "historical-first"] as const) {
test(`live insertion and older watermark pages preserve retained positions (${arrival})`, async ({ page }) => {
  let inserted = false;
  let allowLatest = true;
  const record = (index: number) => ({ key: `activity-watermark-${index}`, kind: "activity", occurredAt: "2027-01-01", activity: {
    id: `watermark-${index}`, type: "task.moved", actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01", details: { fromColumnId: "backlog", toColumnId: "implementation" } } });
  const live = { ...record(-1), key: "activity-watermark-live", activity: { ...record(-1).activity, id: "watermark-live" } };
  const windowPage = (start: number, fresh = false) => ({ records: Array.from({ length: 50 }, (_, index) => record(start + index)),
    total: fresh && inserted ? 1001 : 1000, start: start + (fresh && inserted ? 1 : 0), olderCursor: `older:${start + 50}`, newerCursor: null, refreshCursor: `refresh:${start}` });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const detail = await (await route.fetch()).json();
    const timeline = inserted && allowLatest ? { ...windowPage(0), total: 1001, records: [live, ...windowPage(0).records.slice(0, 49)] } : windowPage(0);
    await route.fulfill({ json: { ...detail, timeline, movementSummary: { total: 1000 } } });
  });
  await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const source = params.get("sourceId");
    const start = Number(source?.split("-")[1] ?? params.get("cursor")?.split(":")[1] ?? 0);
    await route.fulfill({ json: { available: true, page: windowPage(start, source !== null || params.get("refresh") === "true") } });
  });
  await page.route("**/api/tasks/T-0001/movement-map?*", async (route) => {
    const after = Number(new URL(route.request().url()).searchParams.get("after"));
    await route.fulfill({ json: { available: true, map: { movements: after ? [] : Array.from({ length: 1000 }, (_, i) => ({ ...record(i).activity, recordId: record(i).key, sequence: 1000 - i })), cursor: 1000, total: 1000 } } });
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/tasks/T-0001");
  const entries = page.locator(".timeline > [data-history-record]");
  for (let index = 0; index < 5; index++) {
    await page.getByRole("button", { name: "Load older timeline", exact: true }).evaluate((element) => (element as HTMLButtonElement).click());
    await expect(entries).toHaveCount(100 + index * 50);
  }
  inserted = true;
  allowLatest = arrival === "latest-first";
  if (allowLatest) await expect(page.locator("#timeline-source-watermark-live")).toHaveCount(1);
  await page.getByRole("button", { name: "Load older timeline", exact: true }).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(entries).toHaveCount(arrival === "latest-first" ? 351 : 350);
  await entries.last().scrollIntoViewIfNeeded();
  const map = page.locator('[data-testid="movement-map"]');
  await expect(map.locator(".movement-map-landmark")).toHaveCount(1000);
  await map.locator('button[data-source-id="watermark-700"]').evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.locator("#timeline-source-watermark-700")).toBeFocused();
  await expect(page.getByRole("button", { name: "Load history between these entries", exact: true })).toHaveCount(1);
  await expect(page.locator("#timeline-source-watermark-349")).toHaveCount(1);
  allowLatest = true;
  await expect(page.locator("#timeline-source-watermark-live")).toHaveCount(1);
  await expect(page.locator(".timeline-section")).toHaveAttribute("data-history-start", "0");
  await expect(page.locator(".timeline-history-gap")).toHaveCount(1);
});
}
