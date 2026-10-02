import { contrastRatio, expect, test } from "./browser-fixture.ts";

test("pins expose quiet current guidance with keyboard curation and original timeline navigation", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const pin = page.getByRole("button", { name: /^Pin comment/ }).first();
  await pin.focus();
  await page.keyboard.press("Enter");
  const collection = page.getByRole("region", { name: "Pinned comments" });
  await expect(collection).toBeVisible();
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const jump = collection.getByRole("button", { name: "View in task history" }).first();
    expect(await contrastRatio(jump)).toBeGreaterThanOrEqual(4.5);
    await jump.click();
    await expect(page.locator('[id^="timeline-source-"]:focus')).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await collection.getByRole("button", { name: /^Unpin comment/ }).first().click();
  await expect(collection).toHaveCount(0);
});

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
