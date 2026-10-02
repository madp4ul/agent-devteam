import { contrastRatio, expect, test } from "./browser-fixture.ts";

test("pins expose quiet current guidance with keyboard curation and original timeline navigation", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const pin = page.getByRole("button", { name: /^Pin comment/ }).first();
  await pin.focus();
  await page.keyboard.press("Enter");
  const collection = page.getByRole("region", { name: "Pinned comments" });
  await expect(collection).toBeVisible();
  const unpin = collection.getByRole("button", { name: /^Unpin comment/ }).first();
  const source = collection.getByRole("button", { name: "View in task history" }).first();
  for (const control of [pin, unpin, source]) {
    await expect(control.locator("svg")).toHaveCount(1);
    const centers = await control.evaluate((button) => {
      const b = button.getBoundingClientRect(); const i = button.querySelector("svg")!.getBoundingClientRect();
      return { x: Math.abs(b.x + b.width / 2 - i.x - i.width / 2), y: Math.abs(b.y + b.height / 2 - i.y - i.height / 2), width: b.width };
    });
    expect(centers.x).toBeLessThanOrEqual(1); expect(centers.y).toBeLessThanOrEqual(1);
    expect(centers.width).toBeLessThanOrEqual(30);
  }
  const [textBounds, actionBounds] = await Promise.all([
    collection.locator(".pinned-comment-content").first().boundingBox(), source.boundingBox(),
  ]);
  expect(actionBounds!.x).toBeGreaterThanOrEqual(textBounds!.x + textBounds!.width);
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const jump = collection.getByRole("button", { name: "View in task history" }).first();
    expect(await contrastRatio(jump)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(unpin)).toBeGreaterThanOrEqual(4.5);
    await expect(unpin).toHaveAttribute("aria-pressed", "true");
    await jump.click();
    await expect(page.locator('[id^="timeline-source-"]:focus')).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await collection.getByRole("button", { name: /^Unpin comment/ }).first().click();
  const undo = collection.getByRole("button", { name: /^Pin comment/ }).first();
  await expect(undo).toBeVisible();
  await expect(undo).toHaveAttribute("aria-pressed", "false");
  await expect(undo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(collection.getByRole("button", { name: /^Unpin comment/ }).first()).toBeVisible();
  await page.waitForTimeout(2200);
  await expect(collection).toBeVisible();
  await collection.getByRole("button", { name: /^Unpin comment/ }).first().click();
  await expect(collection.getByRole("button", { name: /^Pin comment/ }).first()).toBeVisible();
  await expect(collection).toHaveCount(0);
});

test("pin activity offers an expandable comment preview and a separate source icon", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch(); const detail = await response.json();
    const comment = detail.task.comments[0];
    comment.body = Array.from({ length: 8 }, (_, index) => `Guidance paragraph ${index + 1}: important shared context.`).join("\n\n");
    detail.task.activity.push({ id: "pin-reference", type: "comment.unpinned", actor: { kind: "agent", id: "implementer" },
      occurredAt: new Date().toISOString(), details: { commentId: comment.id,
        attemptId: detail.task.activations.flatMap((activation: { attempts: Array<{ id: string }> }) => activation.attempts)[0].id } });
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");
  const activity = page.locator('[data-timeline-record="pin-reference"]');
  const source = activity.getByRole("button", { name: "View in task history" });
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    expect(await contrastRatio(source)).toBeGreaterThanOrEqual(4.5);
    const centers = await source.evaluate((button) => {
      const b = button.getBoundingClientRect(); const i = button.querySelector("svg")!.getBoundingClientRect();
      return { x: Math.abs(b.x + b.width / 2 - i.x - i.width / 2), y: Math.abs(b.y + b.height / 2 - i.y - i.height / 2) };
    });
    expect(centers.x).toBeLessThanOrEqual(1); expect(centers.y).toBeLessThanOrEqual(1);
    await expect(activity.locator(".authored-prose")).toHaveCSS("text-decoration-line", "none");
  }
  await expect(activity.getByRole("button", { name: /Show .*more lines/ })).toBeVisible();
  await activity.getByRole("button", { name: /Show .*more lines/ }).click();
  await expect(activity.getByText(/Guidance paragraph 8/)).toBeVisible();
  await activity.getByRole("button", { name: "Show less" }).click();
  await expect(activity.getByText("Comment unpinned", { exact: true })).toHaveCount(1);
  await activity.getByRole("button", { name: "View in task history" }).click();
  await expect(page.locator('[id^="timeline-source-"]:focus')).toBeVisible();
});

for (const viewport of [{ width: 1100, height: 700 }, { width: 1600, height: 1000 }, { width: 900, height: 700 }]) {
test(`pinned source navigation settles the movement map without another scroll at ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch(); const detail = await response.json();
    detail.task.description = "Source navigation context.";
    detail.task.comments[0].pinned = true;
    detail.task.comments[0].body = "Long pinned source context. ".repeat(600);
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("region", { name: "Pinned comments" }).getByRole("button", { name: "View in task history" }).click();
  await page.waitForTimeout(900);
  const before = await page.getByTestId("movement-map").boundingBox();
  const controlsBefore = await page.locator(".detail-sticky-controls").boundingBox();
  await page.evaluate(() => window.scrollBy(0, 1));
  await page.waitForTimeout(200);
  const after = await page.getByTestId("movement-map").boundingBox();
  expect(Math.abs(before!.height - after!.height)).toBeLessThanOrEqual(2);
  const controlsAfter = await page.locator(".detail-sticky-controls").boundingBox();
  expect(Math.abs(controlsBefore!.y - controlsAfter!.y)).toBeLessThanOrEqual(2);
  expect(controlsBefore!.y).toBeGreaterThanOrEqual(0);
});
}

for (const archived of [false, true]) {
  test(`external pinned guidance expands, reveals its filtered source and stays ${archived ? "read-only" : "mutable"}`, async ({ page }) => {
    const body = Array.from({ length: 12 }, (_, index) => `Pinned guidance line ${index + 1}: context from another team.`).join("\n\n");
    await page.route("**/api/tasks/T-0001", async (route) => {
      const response = await route.fetch();
      const detail = await response.json();
      detail.task.comments.unshift({ id: "external-pinned", body, pinned: true,
        actor: { kind: "agent", id: "implementer" }, occurredAt: new Date().toISOString(),
        attemptId: "external-attempt", originTask: { id: "T-0099", title: "Parent requirements" } });
      if (archived) { detail.task.archived = true; detail.inspection.archived = true; }
      // Intentionally absent from the browser's agent visibility filter.
      await route.fulfill({ response, json: detail });
    });
    await page.goto("/tasks/T-0001");
    const pins = page.getByRole("region", { name: "Pinned comments" });
    const timeline = page.getByRole("region", { name: "Task timeline" });
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const origin = pins.getByRole("link", { name: "T-0099 · Parent requirements" });
      await expect(origin).toHaveAttribute("href", "/tasks/T-0099");
      expect(await contrastRatio(origin)).toBeGreaterThanOrEqual(4.5);
      await pins.getByRole("button", { name: /Show .*more lines/ }).click();
      await expect(pins.getByText(/Pinned guidance line 12/)).toBeVisible();
      await pins.getByRole("button", { name: "Show less" }).click();
      const filter = timeline.getByRole("checkbox", { name: "Visible to agents" });
      await filter.check();
      await expect(page.locator('[data-timeline-record="external-pinned"]')).toHaveCount(0);
      const jump = pins.getByRole("button", { name: "View in task history" });
      await jump.focus(); await page.keyboard.press("Enter");
      await expect(page.locator('#timeline-source-external-pinned')).toBeFocused();
      await expect(filter).not.toBeChecked();
      await expect(page.locator('[data-timeline-record="external-pinned"]')).toContainText("Parent requirements");
    }
    await expect(pins.getByRole("button", { name: /^Unpin comment/ })).toHaveCount(archived ? 0 : 1);
    if (archived) await expect(page.getByRole("button", { name: /^(?:Pin|Unpin) comment/ })).toHaveCount(0);
  });
}
