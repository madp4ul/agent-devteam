import { contrastRatio, expect, test } from "./browser-fixture.ts";

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
    await page.route("**/api/activations/waiting-activation/dismiss", async (route) => {
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
    await expect(conversationWaiting).toContainText("Next eligible:");
    expect(await contrastRatio(conversationWaiting.locator("strong"))).toBeGreaterThanOrEqual(4.5);
    await conversationWaiting.getByRole("button", { name: "Stop retries" }).click();
    await expect(conversationWaiting).toHaveCount(0);
    expect(stopped).toBe(true);
  });
}

for (const transition of ["queued-to-running", "running-to-waiting"] as const) {
  test(`stop retries tolerates ${transition} between polling and the command`, async ({ page }) => {
    let state = transition === "queued-to-running" ? "queued" : "running";
    let dismissals = 0;
    let interruptions = 0;
    let stopped = false;
    await page.route("**/api/tasks/T-0001", async (route) => {
      const detail = await (await route.fetch()).json();
      const activation = detail.task.activations[0];
      detail.task.activations = [{ ...activation, id: "racing-activation", status: stopped ? "dismissed" : state,
        recovery: stopped ? null : { state: "waiting", episodeId: "race", activationId: "racing-activation", classification: "connection-lost",
          firstFailure: "Connection lost", latestFailure: "Connection lost", firstAt: "2027-01-01", latestAt: "2027-01-01", dueAt: "2027-01-02", retryCount: 1, failureCount: 2, retrying: state === "running" } }];
      await route.fulfill({ json: detail });
    });
    await page.route("**/api/activations/racing-activation/dismiss", async (route) => {
      dismissals++;
      if (dismissals === 1) {
        state = transition === "queued-to-running" ? "running" : "queued";
        return route.fulfill({ status: 409, json: { accepted: false, reason: "not-dismissible" } });
      }
      expect(state).toBe("queued"); stopped = true;
      await route.fulfill({ json: { accepted: true } });
    });
    await page.route("**/api/tasks/T-0001/interrupt", async (route) => {
      interruptions++;
      expect(route.request().postDataJSON().activationId).toBe("racing-activation");
      if (state === "queued") return route.fulfill({ status: 409, json: { accepted: false, reason: "not-running" } });
      state = "queued"; await route.fulfill({ json: { accepted: true, state: "interrupted" } });
    });
    await page.goto("/tasks/T-0001");
    const summary = page.getByRole("region", { name: "Runtime recovery" });
    await summary.getByRole("button", { name: "Stop retries" }).click();
    await expect(summary).toHaveCount(0);
    expect(dismissals).toBe(2); expect(interruptions).toBe(1); expect(stopped).toBe(true);
  });
}
