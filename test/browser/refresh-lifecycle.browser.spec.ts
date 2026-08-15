import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem(
    "coordination.desktop-notifications.consent",
    "declined",
  ));
});

test("a late board poll cannot replace a newer command refresh", async ({ page }) => {
  let boardReads = 0;
  let releaseStalePoll!: () => void;
  let markStalePollStarted!: () => void;
  const stalePollReleased = new Promise<void>((resolve) => { releaseStalePoll = resolve; });
  const stalePollStarted = new Promise<void>((resolve) => { markStalePollStarted = resolve; });

  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const readNumber = ++boardReads;
    body.startup.processName = readNumber === 1
      ? "Initial refresh"
      : readNumber === 2
        ? "Stale refresh"
        : "Newest refresh";
    body.activeRuns = readNumber === 1 ? [{
      attemptId: "stale-response-attempt",
      taskId: "T-0002",
      taskTitle: "Drag this task",
      boardId: "delivery",
      boardName: "Product delivery",
      columnId: "backlog",
      columnName: "Backlog",
      agentId: "implementer",
      status: "running",
      startedAt: new Date().toISOString(),
    }] : [];
    body.automation = readNumber === 1
      ? { state: "running", attemptsMayStart: true }
      : { state: "paused", attemptsMayStart: false };
    if (readNumber === 2) {
      markStalePollStarted();
      await stalePollReleased;
    }
    await route.fulfill({
      response,
      json: body,
      headers: { ...response.headers(), "x-refresh-read": String(readNumber) },
    });
  });
  await page.route("**/api/automation/pause", async (route) => {
    await route.fulfill({
      status: 200,
      json: { accepted: true, automation: { state: "pausing", attemptsMayStart: false } },
    });
  });

  await page.goto("/");
  const processName = page.locator(".board-brand h1");
  await expect(processName).toHaveText("Initial refresh");
  await stalePollStarted;

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(processName).toHaveText("Newest refresh");

  const staleResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/board") && response.headers()["x-refresh-read"] === "2"
  );
  releaseStalePoll();
  await staleResponse;
  await page.waitForTimeout(100);
  expect(await processName.textContent()).toBe("Newest refresh");

  await page.waitForTimeout(1_200);
  expect(boardReads).toBe(3);
});
