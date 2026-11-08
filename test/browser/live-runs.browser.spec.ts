import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) {
  test(`${theme} mixed running and preparing details occupy one non-overlapping popup`, async ({ page }, testInfo) => {
    let state: "mixed" | "running" | "preparing" | "idle" = "mixed";
    await page.route("**/api/board", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.activeRuns = state === "mixed" || state === "running" ? [{
        attemptId: "active-attempt", taskId: "T-0001", taskTitle: "Finish the current implementation",
        agentId: "implementer", boardId: "delivery", boardName: "Product delivery",
        columnId: "implementation", columnName: "Implementation", status: "running",
        executionStarted: true, startedAt: new Date(Date.now() - 120000).toISOString(),
      }] : [];
      body.workspacePreparations = state === "mixed" || state === "preparing" ? [{
        taskId: "T-0002", activationId: "preparing-activation", conversationId: null,
        agentId: "reviewer", stage: "creating", startedAt: new Date(Date.now() - 60000).toISOString(),
        progress: { stage: "Updating files", completed: 30, total: 100, percent: 30 },
      }] : [];
      await route.fulfill({ response, json: body });
    });
    await page.goto("/");
    await setAppearance(page, theme);
    const activity = page.locator(".live-runs");
    const disclosure = activity.locator("summary");
    await expect(disclosure).toHaveText("Current runs · 1 · Preparing 1");
    await disclosure.focus();
    await page.keyboard.press("Enter");
    const items = activity.getByRole("listitem");
    await expect(items).toHaveCount(2);
    const running = await items.nth(0).boundingBox();
    const preparing = await items.nth(1).boundingBox();
    expect(running).not.toBeNull();
    expect(preparing).not.toBeNull();
    expect(preparing!.y).toBeGreaterThanOrEqual(running!.y + running!.height);
    await expect(activity.getByRole("link", { name: /implementer.*T-0001/ })).toHaveAttribute("target", "_blank");
    await expect(activity.getByRole("progressbar")).toHaveAttribute("value", "30");
    await expect(activity.getByText(/Updating files · 30 \/ 100 \(30%\)/)).toBeVisible();
    expect(await contrastRatio(activity.getByRole("status"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(activity.getByText("Product delivery / Implementation"))).toBeGreaterThanOrEqual(4.5);
    await activity.locator(".live-runs-popover").screenshot({ path: testInfo.outputPath(`live-runs-${theme}.png`) });
    await disclosure.hover();
    await expect(items).toHaveCount(2);

    state = "running";
    await expect(disclosure).toHaveText("Current runs · 1");
    await expect(items).toHaveCount(1);
    await expect(activity.getByRole("progressbar")).toHaveCount(0);
    state = "preparing";
    await expect(disclosure).toHaveText("Current runs · 0 · Preparing 1");
    await expect(items).toHaveCount(1);
    await expect(activity.getByRole("progressbar")).toHaveAttribute("value", "30");
    state = "idle";
    await expect(disclosure).toHaveText("Current runs · 0");
    await expect(items).toHaveCount(0);
    await expect(activity.getByText("No active agents.")).toBeVisible();
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(activity.getByText("No active agents.")).not.toBeVisible();
  });
}

test("startup and interruption stay distinct from running elapsed time", async ({ page }) => {
  let stopping = false;
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.workspacePreparations = [];
    body.activeRuns = [{ attemptId: "starting-attempt", taskId: "T-0001", taskTitle: "Starting task",
      agentId: "implementer", boardId: "delivery", boardName: "Product delivery", columnId: "implementation", columnName: "Implementation",
      status: stopping ? "interrupting" : "starting", executionStarted: false, startedAt: "2026-11-08T12:00:00Z" }];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  const activity = page.locator(".live-runs");
  await activity.locator("summary").click();
  await expect(activity.locator("summary")).toHaveText("Current runs · 0");
  await expect(activity.getByText("Starting agent", { exact: true })).toBeVisible();
  await expect(activity.getByText(/elapsed/)).toHaveCount(0);
  stopping = true;
  await expect(activity.getByText("Stopping startup", { exact: true })).toBeVisible();
  await expect(activity.locator("summary")).toHaveText("Current runs · 0");
  await expect(activity.getByText(/elapsed/)).toHaveCount(0);
});
