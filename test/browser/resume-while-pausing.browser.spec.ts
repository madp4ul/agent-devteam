import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) {
  test(`${theme} Resume stays keyboard usable while existing work finishes`, async ({ page }) => {
    let state: "pausing" | "running" = "pausing";
    let resumed = 0;
    await page.route("**/api/automation/resume", async (route) => {
      resumed += 1;
      state = "running";
      await route.fulfill({ json: { accepted: true, automation: { state, attemptsMayStart: true } } });
    });
    await page.route("**/api/board", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.automation = { state, attemptsMayStart: state === "running" };
      body.activeRuns = [{ attemptId: "same-run", taskId: "T-0002", taskTitle: "Original run", boardId: "delivery", boardName: "Product delivery",
        columnId: "backlog", columnName: "Backlog", agentId: "implementer", status: "running", executionStarted: true, startedAt: "2026-11-08T12:00:00Z" }];
      await route.fulfill({ response, json: body });
    });
    await page.goto("/");
    await setAppearance(page, theme);
    const resume = page.getByRole("button", { name: "Resume automation", exact: true });
    await expect(resume).toBeEnabled();
    await expect(resume).toHaveText("Resume");
    expect(await contrastRatio(resume)).toBeGreaterThanOrEqual(4.5);
    await resume.focus();
    await expect(resume).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    expect(resumed).toBe(1);
    await expect(page.getByText("1 running")).toBeVisible();
    await page.getByText("1 running").click();
    await expect(page.getByRole("link", { name: /implementer.*T-0002/ })).toBeVisible();
  });
}
