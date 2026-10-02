import { expect, test } from "./browser-fixture.ts";

test("task tabs identify distinct tasks and follow navigation and renaming", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Boards · Browser acceptance process · Agent Coordination");
  await page.getByRole("link", { name: /T-0001 Inspect existing coordination/ }).click();
  await expect(page).toHaveTitle("Inspect existing coordination (T-0001) · Agent Coordination");

  const other = await context.newPage();
  await other.goto("/tasks/T-0002");
  const task = await (await page.request.get("/api/tasks/T-0002")).json();
  await expect(other).toHaveTitle(`${task.task.title} (T-0002) · Agent Coordination`);
  await expect(page).toHaveTitle("Inspect existing coordination (T-0001) · Agent Coordination");

  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Renamed coordination task");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page).toHaveTitle("Renamed coordination task (T-0001) · Agent Coordination");
  await page.goBack();
  await expect(page).toHaveTitle("Boards · Browser acceptance process · Agent Coordination");
  await page.goForward();
  await expect(page).toHaveTitle("Renamed coordination task (T-0001) · Agent Coordination");
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(page).toHaveTitle("Boards · Browser acceptance process · Agent Coordination");
});

test("a task title follows renaming in another tab through live refresh", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await expect(page).toHaveTitle("Inspect existing coordination (T-0001) · Agent Coordination");
  const detail = await (await page.request.get("/api/tasks/T-0001")).json();
  const response = await page.request.patch("/api/tasks/T-0001", { data: {
    title: "Renamed from another tab",
    description: detail.task.description,
    expectedRevision: detail.task.revision,
    idempotencyKey: "page-title-live-rename",
  } });
  expect(response.ok()).toBe(true);
  await expect(page).toHaveTitle("Renamed from another tab (T-0001) · Agent Coordination");
});

for (const status of [404, 409, 500]) {
  test(`task loading and ${status} fallback clear the previous page identity`, async ({ page }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/tasks/T-0001", async (route) => {
      await released;
      await route.fulfill({ status, json: { available: false, reason: "task-not-found" } });
    });
    await page.goto("/");
    await expect(page).toHaveTitle("Boards · Browser acceptance process · Agent Coordination");
    await page.getByRole("link", { name: /T-0001 Inspect existing coordination/ }).click();
    await expect(page).toHaveTitle("Loading task (T-0001) · Agent Coordination");
    release();
    await expect(page).toHaveTitle(status === 404 || status === 409
      ? "Task unavailable (T-0001) · Agent Coordination"
      : "Unable to load task (T-0001) · Agent Coordination");
    await page.goBack();
    await expect(page).toHaveTitle("Boards · Browser acceptance process · Agent Coordination");
  });
}

for (const result of ["ready", "error", "configuration-error"] as const) {
  test(`board loading and ${result} titles replace the task identity`, async ({ page }) => {
    await page.goto("/tasks/T-0001");
    await expect(page).toHaveTitle("Inspect existing coordination (T-0001) · Agent Coordination");
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/board", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await released;
      if (result === "configuration-error") {
        body.startup = { mode: "configuration-error", diagnostics: [] };
      }
      await route.fulfill({ response, status: result === "error" ? 500 : 200, json: body });
    });
    await page.getByRole("link", { name: "Back to board" }).click();
    await expect(page).toHaveTitle("Loading boards · Agent Coordination");
    release();
    await expect(page).toHaveTitle(result === "ready"
      ? "Boards · Browser acceptance process · Agent Coordination"
      : result === "error"
        ? "Unable to load boards · Agent Coordination"
        : "Configuration error · Agent Coordination");
  });
}

test("a late task response cannot replace the title after navigating away", async ({ page }) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    await released;
    await route.fulfill({ response });
    finish();
  });
  await page.goto("/");
  await page.getByRole("link", { name: /T-0001 Inspect existing coordination/ }).click();
  await expect(page).toHaveTitle("Loading task (T-0001) · Agent Coordination");
  await page.goBack();
  await expect(page).toHaveTitle("Boards · Browser acceptance process · Agent Coordination");
  const responseArrived = page.waitForResponse("**/api/tasks/T-0001");
  release();
  await finished;
  await (await responseArrived).finished();
  await expect(page).toHaveTitle("Boards · Browser acceptance process · Agent Coordination");
});
