import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) test(`${theme} running and preparing occupy separate mutually exclusive menus`, async ({ page }) => {
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    body.activeRuns = [{ attemptId: "active-attempt", taskId: "T-0001", taskTitle: "Current implementation", agentId: "implementer",
      boardName: "Product delivery", columnName: "Implementation", status: "running", executionStarted: true, startedAt: new Date().toISOString() }];
    body.workspacePreparations = [{ taskId: "T-0002", activationId: "preparing", conversationId: null, agentId: "reviewer", stage: "creating",
      startedAt: new Date().toISOString(), progress: { stage: "Updating files", completed: 30, total: 100, percent: 30 } }];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/"); await setAppearance(page, theme);
  await page.getByText("1 running", { exact: true }).click();
  const runs = page.getByRole("region", { name: "Agent runs", exact: true });
  await expect(runs.getByRole("region", { name: "Active runs" }).getByRole("listitem")).toHaveCount(1);
  await expect(runs.getByRole("link", { name: /T-0001.*Current implementation.*implementer/ })).toHaveAttribute("target", "_blank");
  expect(await contrastRatio(runs.getByText("Product delivery / Implementation"))).toBeGreaterThanOrEqual(4.5);
  await page.getByText("1 preparing", { exact: true }).click();
  const preparing = page.getByRole("region", { name: "Workspace preparations" });
  await expect(runs).toBeHidden();
  await expect(preparing.getByRole("progressbar")).toHaveAttribute("value", "30");
  expect(await contrastRatio(preparing.getByRole("status"))).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press("Escape"); await expect(preparing).toBeHidden();
});

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
  const activity = page.locator(".live-runs").filter({ has: page.locator("summary", { hasText: "running" }) });
  await activity.locator("summary").click();
  await expect(activity.locator("summary")).toHaveText("0 running");
  await expect(activity.getByText("Starting agent", { exact: true })).toBeVisible();
  await expect(activity.getByText(/elapsed/)).toHaveCount(0);
  stopping = true;
  await expect(activity.getByText("Stopping startup", { exact: true })).toBeVisible();
  await expect(activity.locator("summary")).toHaveText("0 running");
  await expect(activity.getByText(/elapsed/)).toHaveCount(0);
});
