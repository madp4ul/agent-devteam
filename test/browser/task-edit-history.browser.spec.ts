import { contrastRatio, expect, fulfillTaskScenario, test } from "./browser-fixture.ts";

test("task edit entries name changed fields and show only compact before/after values", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    for (let mask = 1; mask < 8; mask += 1) {
      detail.task.activity.push({ id: `specific-edit-${mask}`, type: "task.edited", actor: { kind: "user", id: "user" },
        occurredAt: new Date().toISOString(), details: {
          changedFields: [mask & 1 ? "title" : "", mask & 2 ? "description" : "", mask & 4 ? "startingRef" : ""].filter(Boolean).join(","),
          ...(mask & 1 ? { previousTitle: "Original title", title: "Revised title" } : {}),
          ...(mask & 4 ? { previousStartingRef: "bad-base", startingRef: "8de3b8c4bb149af82a9b41be34e1bb362ff717ad" } : {}),
          previousDescription: "Long old description must not appear", description: "Long new description must not appear",
        } });
    }
    detail.task.activity.push(
      { id: "legacy-edit", type: "task.edited", actor: { kind: "user", id: "user" }, occurredAt: new Date().toISOString(), details: {} },
      { id: "legacy-ref-edit", type: "task.edited", actor: { kind: "user", id: "user" }, occurredAt: new Date().toISOString(), details: { previousStartingRef: "old-ref", startingRef: "new-ref" } },
      { id: "unchanged-edit", type: "task.edited", actor: { kind: "user", id: "user" }, occurredAt: new Date().toISOString(), details: { changedFields: "" } },
    );
    await fulfillTaskScenario(route, response, detail);
  });
  await page.goto("/tasks/T-0001");
  const summaries = ["Title updated.", "Description updated.", "Title and description updated.", "Starting ref updated.",
    "Title and starting ref updated.", "Description and starting ref updated.", "Title, description, and starting ref updated."];
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [1280, 420]) {
      await page.setViewportSize({ width, height: 900 });
      for (let mask = 1; mask < 8; mask += 1) {
        const entry = page.locator(`#timeline-source-specific-edit-${mask}`);
        const summary = entry.getByText(summaries[mask - 1]!, { exact: true });
        await expect(summary).toBeVisible();
        expect(await contrastRatio(summary)).toBeGreaterThanOrEqual(4.5);
        await expect(entry).not.toContainText("must not appear");
        if (mask & 1) await expect(entry).toContainText("Title: Original title → Revised title");
        if (mask & 4) await expect(entry).toContainText("Starting ref: bad-base → 8de3b8c4bb149af82a9b41be34e1bb362ff717ad");
        expect(await entry.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
    }
  }
  await expect(page.locator("#timeline-source-legacy-edit")).toContainText("Task details updated.");
  await expect(page.locator("#timeline-source-legacy-ref-edit")).toContainText("Starting ref: old-ref → new-ref");
  await expect(page.locator("#timeline-source-unchanged-edit")).toContainText("No task fields changed.");
});
