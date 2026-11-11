import { contrastRatio, expect, test } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) test(`termination recovery and stop intent survive reload (${theme})`, async ({ page }) => {
  let stopping = false;
  let checking = false;
  const run = () => ({ taskId: "T-0001", attemptId: "blocked-attempt", activationId: "blocked-activation", agentId: "implementer",
    taskTitle: "Blocked cleanup", boardId: "delivery", boardName: "Delivery", columnId: "implementation", columnName: "Implementation",
    status: checking ? "cleaning-up" : "termination-blocked", executionStarted: true, startedAt: "2026-01-01T00:00:00Z",
    interruptionRequested: true, stopRequested: stopping,
    ...(checking ? {} : { termination: { diagnostic: "Inspection temporarily unavailable", retryAvailable: true } }) });
  const recovery = { state: "waiting", episodeId: "blocked", activationId: "blocked-activation", classification: "budget-exhausted",
    firstFailure: "Usage limit reached", latestFailure: "Usage limit reached", firstAt: "2026-01-01", latestAt: "2026-01-01",
    dueAt: "2026-01-02", failureCount: 2, retryCount: 1, retrying: true };
  await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
  await page.route("**/api/tasks/T-0001", async (route) => {
    const detail = await (await route.fetch()).json();
    detail.activeRun = run(); detail.activeRuns = [run()]; detail.automation = { state: "pausing", attemptsMayStart: false };
    detail.task.activations = [{ ...detail.task.activations[0], id: "blocked-activation", status: "running", recovery }];
    await route.fulfill({ json: detail });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const result = await (await route.fetch()).json();
    result.conversation.activeRun = run(); result.conversation.runtimeRecovery = recovery;
    result.conversation.automation = { state: "pausing", attemptsMayStart: false };
    await route.fulfill({ json: result });
  });
  await page.route("**/api/tasks/T-0001/stop-activation", async (route) => {
    expect(route.request().postDataJSON().activationId).toBe("blocked-activation");
    stopping = true; await route.fulfill({ status: 202, json: { accepted: true, state: "stopping" } });
  });
  await page.route("**/api/tasks/T-0001/retry-termination", async (route) => {
    expect(route.request().postDataJSON().attemptId).toBe("blocked-attempt");
    checking = true; await route.fulfill({ status: 202, json: { accepted: true } });
  });
  await page.goto("/tasks/T-0001");
  const cleanup = page.getByRole("region", { name: "Run cleanup" });
  await expect(cleanup).toContainText("Inspection temporarily unavailable");
  await expect(page.locator(".live-runs summary")).toContainText("Current runs · 0 · Stopping 1");
  expect(await contrastRatio(cleanup.locator("strong"))).toBeGreaterThanOrEqual(4.5);
  const waiting = page.getByRole("region", { name: "Runtime recovery" });
  await waiting.getByRole("button", { name: "Stop retries", exact: true }).click();
  await page.reload();
  await expect(waiting.getByRole("button", { name: "Stopping…", exact: true })).toBeDisabled();
  await expect(waiting).toContainText("No further retry will be dispatched");
  await expect(page.locator(".activity-current")).not.toContainText("Running ·");
  await page.getByRole("button", { name: "View conversation" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog.getByRole("button", { name: "Stopping…", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Retry termination verification" }).click();
  await expect(dialog.getByRole("region", { name: "Run cleanup" })).toContainText("Verifying agent shutdown");
});

for (const theme of ["dark", "light"] as const) {
  test(`runtime waiting remains readable and stoppable in task and conversation views (${theme})`, async ({ page }) => {
    let stopped = false;
    const recovery = { state: "waiting", episodeId: "outage", activationId: "waiting-activation", classification: "budget-exhausted",
      firstFailure: "Usage limit reached", latestFailure: "Usage limit still reached", firstAt: "2027-01-01T12:00:00Z", latestAt: "2027-01-01T13:00:00Z",
      dueAt: "2027-01-01T14:00:00Z", failureCount: 1000, retryCount: 999, retrying: false };
    await page.addInitScript((selectedTheme) => localStorage.setItem("coordination-theme", selectedTheme), theme);
    await page.route("**/api/tasks/T-0001", async (route) => {
      const detail = await (await route.fetch()).json();
      detail.task.activations = [{ ...detail.task.activations[0], id: recovery.activationId, status: stopped ? "dismissed" : "queued", recovery: stopped ? null : recovery, dismissal: stopped ? null : { mayStartNext: false } }];
      detail.inspection.unresolvedAttention = [];
      await route.fulfill({ json: detail });
    });
    await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
      const result = await (await route.fetch()).json();
      if (!stopped) result.conversation.runtimeRecovery = recovery;
      await route.fulfill({ json: result });
    });
    await page.route("**/api/tasks/T-0001/stop-activation", async (route) => {
      expect(route.request().method()).toBe("POST"); stopped = true;
      await route.fulfill({ json: { accepted: true, activationId: recovery.activationId } });
    });
    await page.goto("/tasks/T-0001");
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const summary = page.getByRole("region", { name: "Runtime recovery" });
    await expect(summary).toContainText("Codex message budget exhausted");
    await expect(summary).toContainText("999 retries · 1000 failures");
    expect(await contrastRatio(summary.locator("strong"))).toBeGreaterThanOrEqual(4.5);
    await summary.getByText("Failure details").click();
    await expect(summary).toContainText("Usage limit still reached");
    await page.getByRole("button", { name: "View conversation" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Agent conversation" });
    const conversationWaiting = dialog.getByRole("region", { name: "Runtime recovery" });
    await expect(conversationWaiting).toContainText("Earliest retry eligibility:");
    expect(await contrastRatio(conversationWaiting.locator("strong"))).toBeGreaterThanOrEqual(4.5);
    await conversationWaiting.getByRole("button", { name: "Stop retries" }).click();
    await expect(conversationWaiting).toHaveCount(0);
    expect(stopped).toBe(true);
  });
}

for (const transition of ["queued-to-running", "running-to-waiting"] as const) {
  test(`stop retries tolerates ${transition} between polling and the command`, async ({ page }) => {
    let state = transition === "queued-to-running" ? "queued" : "running";
    let stops = 0;
    let stopped = false;
    await page.route("**/api/tasks/T-0001", async (route) => {
      const detail = await (await route.fetch()).json();
      const activation = detail.task.activations[0];
      detail.task.activations = [{ ...activation, id: "racing-activation", status: stopped ? "dismissed" : state,
        recovery: stopped ? null : { state: "waiting", episodeId: "race", activationId: "racing-activation", classification: "connection-lost",
          firstFailure: "Connection lost", latestFailure: "Connection lost", firstAt: "2027-01-01", latestAt: "2027-01-01", dueAt: "2027-01-02", retryCount: 1, failureCount: 2, retrying: state === "running" } }];
      await route.fulfill({ json: detail });
    });
    await page.route("**/api/tasks/T-0001/stop-activation", async (route) => {
      stops++;
      expect(route.request().postDataJSON().activationId).toBe("racing-activation");
      state = transition === "queued-to-running" ? "running" : "queued";
      stopped = true;
      await route.fulfill({ json: { accepted: true, state: "stopped" } });
    });
    await page.goto("/tasks/T-0001");
    const summary = page.getByRole("region", { name: "Runtime recovery" });
    await summary.getByRole("button", { name: "Stop retries" }).click();
    await expect(summary).toHaveCount(0);
    expect(stops).toBe(1); expect(stopped).toBe(true);
  });
}
