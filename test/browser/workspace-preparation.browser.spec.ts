import { expect, test, setAppearance, runningConversationScenario, fulfillTaskScenario, contrastRatio } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) {
  test(`${theme} preparation reports live Git progress without counting a running agent`, async ({ page }) => {
    let completed: number | undefined;
    let preparing = true;
    const preparation = () => ({ taskId: "T-0001", activationId: "preparing-activation", conversationId: null, agentId: "implementer", stage: "creating", startedAt: new Date(Date.now() - 60000).toISOString(),
      progress: completed === undefined ? { stage: "Registering worktree" } : { stage: "Updating files", completed, total: 100, percent: completed } });
    await page.route("**/api/board", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.activeRuns = [];
      body.workspacePreparations = preparing ? [preparation()] : [];
      for (const board of body.boards) for (const column of board.columns) for (const task of column.tasks) {
        if (task.id === "T-0001") {
          task.run.activeAgentId = null;
          task.run.queuedActivationCount = 1;
          task.workspacePreparation = preparing ? preparation() : undefined;
        }
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto("/");
    await setAppearance(page, theme);
    const card = page.locator('[data-task-id="T-0001"]');
    await expect(card.getByText("Creating workspace", { exact: false })).toBeVisible();
    await expect(card.getByRole("progressbar")).not.toHaveAttribute("value");
    await expect(page.getByText("Current runs · 0")).toBeVisible();
    completed = 50;
    await expect(card.getByRole("progressbar")).toHaveAttribute("value", "50");
    await expect(card.getByText(/50 \/ 100/)).toBeVisible();
    preparing = false;
    await expect(card.getByRole("progressbar")).toHaveCount(0);
    await expect(card.getByText("Queued · 1")).toBeVisible();
  });
}


for (const theme of ["dark", "light"] as const) test(`${theme} task and conversation lifecycle includes interrupted startup`, async ({ page }) => {
  let phase: "preparing" | "starting" | "interrupting" | "running" | "paused" | "failed" = "preparing";
  const preparation = { taskId: "T-0001", activationId: "preparing-activation", conversationId: "preparing-conversation", agentId: "implementer", stage: "verifying" as const, startedAt: new Date().toISOString() };
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.workspacePreparation = phase === "preparing" ? preparation : undefined;
    body.workspacePreparations = phase === "preparing" ? [preparation] : [];
    body.activeRun = phase === "starting" || phase === "interrupting" || phase === "running" ? { taskId: "T-0001", attemptId: "started", agentId: "implementer", status: phase, executionStarted: phase === "running", startedAt: new Date().toISOString() } : null;
    body.activeRuns = body.activeRun === null ? [] : [body.activeRun];
    body.automation = { state: phase === "paused" ? "paused" : "running", attemptsMayStart: phase !== "paused" };
    const attempt = { ...body.task.activations.flatMap((activation: { attempts: object[] }) => activation.attempts)[0], id: "started", status: "running", startedAt: new Date().toISOString(), completedAt: null, outcome: null };
    body.task.activations = [{ ...body.task.activations[0], id: "preparing-activation", status: phase === "failed" ? "failed" : body.activeRun === null ? "queued" : "running", attempts: body.activeRun === null ? [] : [attempt], stale: false,
      recovery: phase === "failed" ? { state: "awaiting-retry", summary: "Checkout failed" } : null,
      startupFailure: null }];
    body.inspection.run = { status: "queued", queuedActivationCount: 1, failedActivationCount: 0, activeAgentId: null };
    body.inspection.automationSuspended = false;
    body.inspection.waitingOn = { taskIds: ["T-0002"] };
    body.conversations = [{ ...body.conversations[0], id: "preparing-conversation", status: phase === "preparing" ? "preparing" : phase === "starting" || phase === "running" ? phase : null }];
    await fulfillTaskScenario(route, response, body);
  });
  await page.route("**/api/tasks/T-0001/conversations/preparing-conversation*", async (route) => {
    const result = runningConversationScenario([]);
    if (!result.available) throw new Error("Fixture unavailable");
    result.conversation.id = "preparing-conversation";
    if (phase === "preparing") result.conversation.workspacePreparation = preparation;
    result.conversation.liveStatus = phase === "starting" || phase === "running" ? phase : "queued";
    await route.fulfill({ json: result });
  });
  await page.goto("/tasks/T-0001");
  await setAppearance(page, theme);
  const activity = page.getByRole("region", { name: "Agent activity" });
  await expect(activity.getByText(/Verifying workspace/).first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Preparing workspace", exact: true })).toHaveCSS("background-color", /rgb/);
  expect(await contrastRatio(activity.locator(".workspace-preparation").getByRole("status"))).toBeGreaterThanOrEqual(4.5);
  await expect(activity.getByText(/Waiting on T-0002/)).toHaveCount(0);
  await page.locator(".conversation-index-row").first().click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog.getByText(/Verifying workspace/).first()).toBeVisible();
  phase = "starting";
  await expect(dialog.getByText("Starting agent…")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(activity.getByText("Starting agent…")).toBeVisible();
  await expect(page.locator(".attempt-entry .attempt-status")).toHaveText("Starting agent");
  await expect(page.locator(".attempt-entry .attempt-timing")).not.toContainText("elapsed");
  phase = "interrupting";
  await expect(activity.getByText("Stopping startup…")).toBeVisible();
  await expect(page.getByText("Current runs · 0")).toBeVisible();
  await expect(page.locator(".attempt-entry .attempt-status")).toHaveText("Stopping startup");
  await expect(page.locator(".attempt-entry .attempt-timing")).not.toContainText("elapsed");
  phase = "running";
  await expect(activity.getByText(/Running ·/)).toBeVisible();
  phase = "paused";
  await expect(activity.getByText("Process automation is paused")).toBeVisible();
  await expect(activity.getByRole("progressbar")).toHaveCount(0);
  phase = "failed";
  await expect(activity.getByText("Failed activation needs retry or dismissal")).toBeVisible();
});
