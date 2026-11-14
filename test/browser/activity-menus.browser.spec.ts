import { mockArchivalMenuOperations } from "./browser-fixture.ts";
import { contrastRatio, expect, test } from "./browser-fixture.ts";
import type { ActivityMenuEntry } from "../../src/application/activity-menu-contract.ts";

for (const theme of ["dark", "light"] as const) test(`${theme} lifecycle menus retain results without covering the page and dismiss finished entries only`, async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
  const entry = (id: string, kind: "preparation" | "run", status: ActivityMenuEntry["status"]): ActivityMenuEntry => ({
    id, kind, taskId: "T-0001", taskTitle: `Result ${id}`, agentId: "implementer", startedAt: "2026-11-14T12:00:00Z",
    finishedAt: status === "preparing" ? null : "2026-11-14T12:01:00Z", status, summary: "Recorded result",
  });
  let preparations = [entry("active", "preparation", "preparing"), entry("prepared", "preparation", "prepared")];
  let runs = Array.from({ length: 30 }, (_, index) => entry(`run-${index}`, "run", index === 0 ? "failed" : "completed"));
  let historyReads = 0;
  await page.route("**/api/activity-menu/history", (route) => { historyReads++; return route.fulfill({ json: { preparations, runs } }); });
  await page.route("**/api/activity-menu/history/dismiss", async (route) => {
    const kind = route.request().postDataJSON().kind as string;
    const ids = (kind === "preparation" ? preparations : kind === "run" ? runs : []).map((item) => item.id);
    if (kind === "archival") operations.splice(1, 1);
    preparations = preparations.filter((item) => item.finishedAt === null || !ids.includes(item.id));
    runs = runs.filter((item) => !ids.includes(item.id));
    await route.fulfill({ json: { accepted: true } });
  });
  const operations = [{ id: "active-archive", state: "queued", label: "Delivery", target: { kind: "completion", boardId: "delivery" }, updatedAt: new Date().toISOString(),
    tasks: [{ taskId: "T-0001", title: "Queued one", state: "queued" }, { taskId: "T-0002", title: "Queued two", state: "queued" }] },
  { id: "finished-archive", state: "completed", label: "Earlier batch", target: { kind: "completion", boardId: "delivery" }, updatedAt: new Date().toISOString(),
    tasks: [{ taskId: "T-0003", title: "Dirty workspace", state: "failed", failure: { reason: "workspace-dirty" } }] }];
  await mockArchivalMenuOperations(page, () => operations);
  await page.route("**/api/activity-menu/overview", (route) => route.fulfill({ json: {
    revision: JSON.stringify([preparations, runs, operations]),
    preparations: { active: preparations.filter((item) => item.finishedAt === null).length, history: preparations.filter((item) => item.finishedAt !== null).length },
    archives: { active: operations.filter((operation) => operation.state === "queued").reduce((count, operation) => count + operation.tasks.length, 0), history: operations.filter((operation) => operation.state === "completed").length },
  } }));
  await page.goto("/");
  const controls = page.locator(".automation-control");
  await expect(controls.locator("summary")).toHaveText(["1 preparing", "0 running", "2 archiving"]);
  expect(historyReads).toBe(0);
  await expect(page.getByRole("region", { name: "Operation feedback" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Archival operations" })).toBeHidden();
  await page.getByText("1 preparing", { exact: true }).click();
  const preparing = page.getByRole("region", { name: "Workspace preparations" });
  await expect(preparing.getByRole("region", { name: "Active preparations" })).toBeVisible();
  const history = preparing.getByRole("region", { name: "History", exact: true });
  await expect(history).toContainText("Result prepared");
  await expect(history.getByText("Prepared", { exact: true })).toHaveCount(0);
  await expect(history.getByText("implementer", { exact: true })).toHaveCount(0);
  await expect(history.getByText("Recorded result", { exact: true })).toHaveCount(0);
  const activeBox = await preparing.getByRole("region", { name: "Active preparations" }).boundingBox();
  const historyBox = await history.boundingBox();
  expect(historyBox!.y).toBeGreaterThan(activeBox!.y);
  await history.getByRole("button", { name: "Dismiss history" }).click();
  await expect(history).toHaveCount(0);
  await expect(page.getByText("1 preparing", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preparing).toBeHidden();
  await expect(page.getByText("1 preparing", { exact: true })).toBeFocused();
  await page.getByText("2 archiving", { exact: true }).click();
  const archives = page.getByRole("region", { name: "Archival operations" });
  await expect(archives.getByRole("link", { name: /Dirty workspace/ })).toBeVisible();
  await archives.getByRole("button", { name: "Dismiss history" }).click();
  await expect(archives.getByRole("link", { name: /Dirty workspace/ })).toHaveCount(0);
  await expect(archives.getByText("Queued", { exact: true })).toHaveCount(2);
  await page.reload();
  await expect(page.getByText("2 archiving", { exact: true })).toBeVisible();
  await page.getByText("0 running", { exact: true }).click();
  const agentRuns = page.getByRole("region", { name: "Agent runs", exact: true });
  await expect(agentRuns.getByText("No active runs.", { exact: true })).toBeVisible();
  await expect(agentRuns.getByRole("listitem")).toHaveCount(30);
  await expect(agentRuns.getByRole("listitem").nth(1)).toHaveCSS("border-top-width", "0px");
  await expect(agentRuns.getByRole("region", { name: "History", exact: true })).toHaveCSS("border-top-width", "1px");
  await expect(agentRuns.locator(".signal.completed")).toHaveCount(29);
  await expect(agentRuns.locator(".signal.failed")).toHaveCount(1);
  await expect(agentRuns.locator("li > p")).toHaveCount(0);
  await expect(agentRuns.getByText("Recorded result", { exact: true })).toHaveCount(1);
  expect(await agentRuns.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await agentRuns.getByRole("button", { name: "Dismiss history" }).click();
  await expect(agentRuns.getByRole("listitem")).toHaveCount(0);
  await page.goto("/tasks/T-0001");
  await expect(page.locator(".automation-control summary")).toHaveText(["1 preparing", "0 running", "2 archiving"]);
  await page.setViewportSize({ width: 390, height: 720 });
  await page.getByText("2 archiving", { exact: true }).click();
  const box = await archives.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
});

for (const theme of ["dark", "light"] as const) test(`${theme} each archival task moves independently from active work into dismissible history`, async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
  const operation = { id: "five-task-batch", state: "running", label: "Delivery", target: { kind: "completion", boardId: "delivery" }, updatedAt: "2026-11-14T12:00:00Z",
    tasks: Array.from({ length: 5 }, (_, index) => ({ taskId: `T-${index + 1}`, title: `Archive task ${index + 1}`, state: index === 0 ? "running" : "queued", failure: undefined as { reason: string } | undefined })) };
  const dismissed = new Set<string>();
  await mockArchivalMenuOperations(page, () => [{ ...operation, tasks: operation.tasks.filter((task) => !dismissed.has(task.taskId)) }]);
  await page.route("**/api/activity-menu/history/dismiss", async (route) => {
    for (const task of operation.tasks) if (task.state !== "queued" && task.state !== "running") dismissed.add(task.taskId);
    await route.fulfill({ json: { accepted: true } });
  });
  await page.goto("/");
  await page.getByText("5 archiving", { exact: true }).click();
  const menu = page.getByRole("region", { name: "Archival operations" });
  const active = menu.getByRole("region", { name: "Active archivals" });
  const history = menu.getByRole("region", { name: "Archival history" });
  await expect(active.getByRole("listitem")).toHaveCount(5);
  await expect(history).toHaveCount(0);
  operation.tasks[0]!.state = "archived";
  operation.tasks[1]!.state = "running";
  await expect(page.getByText("4 archiving", { exact: true })).toBeVisible();
  await expect(active.getByRole("listitem")).toHaveCount(4);
  await expect(history.getByRole("listitem")).toHaveCount(1);
  const archived = history.getByRole("link", { name: /Archive task 1/ });
  await expect(archived.locator(".signal.completed")).toHaveText("Archived");
  expect(await contrastRatio(archived.locator(".signal.completed"))).toBeGreaterThanOrEqual(4.5);
  const titleBox = await archived.locator(".live-run-identity").boundingBox();
  const chipBox = await archived.locator(".signal").boundingBox();
  expect(chipBox!.x).toBeGreaterThanOrEqual(titleBox!.x + titleBox!.width);
  operation.tasks[1]!.state = "failed";
  operation.tasks[1]!.failure = { reason: "workspace-dirty" };
  operation.tasks[2]!.state = "running";
  await expect(page.getByText("3 archiving", { exact: true })).toBeVisible();
  const failed = history.getByRole("link", { name: /Archive task 2/ });
  await expect(failed.locator(".signal.failed")).toHaveText("Failed");
  expect(await contrastRatio(failed.locator(".signal.failed"))).toBeGreaterThanOrEqual(4.5);
  await expect(failed).toContainText("confirm individual archival");
  await expect(history.locator("li > p")).toHaveCount(0);
  await history.getByRole("button", { name: "Dismiss history" }).click();
  await expect(history).toHaveCount(0);
  await expect(active.getByRole("listitem")).toHaveCount(3);
  operation.tasks[2]!.state = "archived";
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history.getByRole("link")).toContainText("Archive task 3");
  operation.tasks[3]!.state = "archived";
  operation.tasks[4]!.state = "archived";
  operation.state = "completed";
  await expect(menu.getByText("No active archivals.", { exact: true })).toBeVisible();
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history.getByRole("listitem").nth(1)).toHaveCSS("border-top-width", "0px");
  await expect(history).toHaveCSS("border-top-width", "1px");
  await page.reload();
  await page.getByText("0 archiving", { exact: true }).click();
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history.getByRole("link", { name: /Archive task 3/ })).toBeVisible();
});

test("live preparation titles remain visible while history is unavailable", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch(); const board = await response.json();
    board.workspacePreparations = [{ taskId: "T-0002", taskTitle: "Inspect this live preparation", activationId: "live", conversationId: null,
      agentId: "implementer", stage: "creating", startedAt: "2026-11-14T12:00:00Z" }];
    await route.fulfill({ json: board });
  });
  await page.route("**/api/activity-menu/history", async (route) => { await release.promise; await route.fulfill({ status: 503, json: { error: "Unavailable" } }); });
  try {
    await page.goto("/");
    await page.getByText("1 preparing", { exact: true }).click();
    const active = page.getByRole("region", { name: "Active preparations" });
    await expect(active.getByRole("link")).toContainText("Inspect this live preparation");
    await expect(active.getByText("implementer", { exact: true })).toHaveCount(0);
  } finally { release.resolve(); }
});

for (const theme of ["dark", "light"] as const) test(`${theme} comment errors float independently with a centered X and retain the draft`, async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
  await page.route("**/api/tasks/T-0001/comments", (route) => route.fulfill({ status: 503, json: { error: "Comment service unavailable" } }));
  await page.goto("/tasks/T-0001");
  const composer = page.getByRole("region", { name: "Add comment" });
  const draft = composer.getByRole("textbox", { name: "Comment" });
  await draft.fill("Keep this draft");
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  const feedback = page.getByRole("region", { name: "Operation feedback" });
  await expect(feedback).toBeInViewport();
  await expect(composer.getByRole("alert")).toHaveCount(0);
  await expect(draft).toHaveValue("Keep this draft");
  await page.route("**/api/tasks/T-0001", (route) => route.fulfill({ status: 503, json: { error: "Task refresh unavailable" } }));
  await expect(feedback.getByRole("alert")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Operation feedback" })).toHaveCount(1);
  expect(await feedback.evaluate((element) => element.parentElement === document.body)).toBe(true);
  await page.addStyleTag({ content: ".task-detail { min-height: 250vh; }" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(feedback).toBeInViewport();
  const close = feedback.getByRole("button", { name: "Dismiss feedback for Comment on T-0001" });
  const buttonBox = await close.boundingBox();
  const iconBox = await close.locator("svg").boundingBox();
  expect(Math.abs(buttonBox!.x + buttonBox!.width / 2 - iconBox!.x - iconBox!.width / 2)).toBeLessThan(1);
  expect(Math.abs(buttonBox!.y + buttonBox!.height / 2 - iconBox!.y - iconBox!.height / 2)).toBeLessThan(1);
  await close.focus(); await page.keyboard.press("Enter");
  await expect(feedback.getByRole("alert")).toHaveCount(1);
  await feedback.getByRole("button", { name: "Dismiss feedback for T-0001", exact: true }).click();
  await expect(feedback).toHaveCount(0);
  await expect(draft).toHaveValue("Keep this draft");
});

test("background archival controls remain available while task details are delayed or unavailable", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  await page.route("**/api/tasks/T-0001", async (route) => { await release.promise; await route.fulfill({ status: 503, json: { error: "Unavailable" } }); });
  await mockArchivalMenuOperations(page, () => [{ id: "background", state: "queued", label: "Background archive", target: { kind: "task", taskId: "T-0002" }, updatedAt: "2026-11-14T12:00:00Z",
    tasks: [{ taskId: "T-0002", title: "Background task", state: "queued" }] }]);
  try {
    await page.goto("/tasks/T-0001");
    await page.getByText("1 archiving", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Archival operations" })).toContainText("Background task");
  } finally { release.resolve(); }
  await expect(page.getByRole("alert")).toContainText("Request failed with status 503");
  await expect(page.getByText("1 archiving", { exact: true })).toBeVisible();
});

test("resource load failures use independent floating feedback", async ({ page }) => {
  await page.route("**/api/resources/R-unavailable", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/resources/R-unavailable");
  const feedback = page.getByRole("region", { name: "Operation feedback" });
  await expect(feedback.getByRole("alert")).toContainText("Resource request failed");
  await expect(page.locator("main > .feedback")).toHaveCount(0);
  await expect(page.getByText("0 running", { exact: true })).toBeVisible();
});

test("dismissing a failed individual archival never resurrects its result as floating feedback", async ({ page }) => {
  let submitted = false;
  let dismissed = false;
  const operation = { id: "failed-individual", state: "completed", label: "T-0001", target: { kind: "task", taskId: "T-0001" }, updatedAt: "2026-11-14T12:00:00Z",
    tasks: [{ taskId: "T-0001", title: "Workspace inspection failed", state: "failed", failure: { reason: "workspace-cleanup-failed", diagnostic: "Git unavailable" } }] };
  await mockArchivalMenuOperations(page, () => submitted && !dismissed ? [operation] : []);
  await page.route("**/api/tasks/T-0001/archive", async (route) => { submitted = true; await route.fulfill({ status: 202, json: { accepted: true, operation } }); });
  await page.route("**/api/activity-menu/history/dismiss", async (route) => { dismissed = true; await route.fulfill({ json: { accepted: true } }); });
  await page.goto("/tasks/T-0001");
  await page.getByText("More actions", { exact: true }).click();
  await page.getByRole("button", { name: "Archive task", exact: true }).click();
  await page.getByText("0 archiving", { exact: true }).click();
  const menu = page.getByRole("region", { name: "Archival operations" });
  await expect(menu).toContainText("Git could not inspect");
  await menu.getByRole("button", { name: "Dismiss history" }).click();
  await expect(page.getByText("0 archiving", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Operation feedback" })).toHaveCount(0);
});

test("live preparation updates preserve already requested history and stop detail reads after its menu disappears", async ({ page }) => {
  let latest = 100;
  let overviewReads = 0;
  let historyReads = 0;
  const results = () => Array.from({ length: latest }, (_, index) => ({ id: `prepared-${latest - index}`, kind: "preparation", taskId: "T-0001",
    taskTitle: `Preparation ${latest - index}`, agentId: "implementer", status: "prepared", summary: "Ready", startedAt: "2026-11-14T12:00:00Z", finishedAt: "2026-11-14T12:01:00Z" }));
  await page.route("**/api/activity-menu/overview", (route) => {
    overviewReads++;
    return route.fulfill({ json: { revision: `${latest}:${overviewReads}`, preparations: { active: 0, history: latest }, archives: { active: 0, history: 0 } } });
  });
  await page.route("**/api/activity-menu/history{,?*}", (route) => {
    historyReads++;
    const before = Number(new URL(route.request().url()).searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
    const entries = results().filter((entry) => Number(entry.id.slice(9)) < before);
    return route.fulfill({ json: { preparations: entries.slice(0, 50), runs: [], preparationCursor: entries.length > 50 ? Number(entries[49]!.id.slice(9)) : null } });
  });
  await page.route("**/api/activity-menu/history/dismiss", async (route) => { latest = 0; await route.fulfill({ json: { accepted: true } }); });
  await page.goto("/");
  await page.getByText("0 preparing", { exact: true }).click();
  const menu = page.getByRole("region", { name: "Workspace preparations" });
  await expect(menu.getByText("No active preparations.", { exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "Load older history" }).click();
  await expect(menu.getByRole("listitem")).toHaveCount(100);
  latest = 101;
  await expect(menu.getByRole("listitem")).toHaveCount(101);
  await expect(menu.getByText("T-0001 · Preparation 51", { exact: true })).toHaveCount(1);
  await expect(menu.getByRole("button", { name: "Load older history" })).toHaveCount(0);
  await menu.getByRole("button", { name: "Dismiss history" }).click();
  await expect(page.getByText("0 preparing", { exact: true })).toHaveCount(0);
  const readsAfterDismissal = historyReads;
  const ticks = overviewReads;
  await expect.poll(() => overviewReads).toBeGreaterThan(ticks + 1);
  expect(historyReads).toBe(readsAfterDismissal);
});

for (const theme of ["dark", "light"] as const) test(`${theme} success feedback expires with hover and focus control while errors persist`, async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  const feedback = page.getByRole("region", { name: "Operation feedback" });
  const success = feedback.locator("article.status");
  await expect(success.getByRole("status")).toHaveText("Updated T-0001.");
  await expect(success.locator("time, strong, .feedback")).toHaveCount(0);
  expect(await contrastRatio(success.getByRole("status"))).toBeGreaterThanOrEqual(4.5);
  await success.hover();
  await expect(success.locator(".operation-feedback-edge")).toHaveCSS("animation-play-state", "paused");
  await page.waitForTimeout(5200);
  await expect(success).toBeVisible();
  await success.getByRole("button").focus();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(5200);
  await expect(success).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(success).toHaveCount(0, { timeout: 6000 });
  await page.route("**/api/tasks/T-0001/comments", (route) => route.fulfill({ status: 503, json: { reason: "Review error: comment service unavailable" } }));
  const composer = page.getByRole("region", { name: "Add comment" });
  await composer.getByRole("textbox", { name: "Comment" }).fill("Keep my draft");
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  const error = feedback.locator("article.alert");
  await expect(error.getByRole("alert")).toContainText("Review error");
  expect(await contrastRatio(error.getByRole("alert"))).toBeGreaterThanOrEqual(4.5);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(5200);
  await expect(error).toBeVisible();
  expect(await feedback.locator(".operation-feedback-list").evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  await error.getByRole("button").click();
  await expect(feedback).toHaveCount(0);
});

for (const theme of ["dark", "light"] as const) test(`${theme} reduced-motion feedback keeps a visible draining edge and centered readable message`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  const card = page.getByRole("region", { name: "Operation feedback" }).locator("article.status");
  const edge = card.locator(".operation-feedback-edge");
  await expect(card).toBeVisible();
  await page.waitForTimeout(300);
  const initial = await edge.boundingBox();
  expect(initial!.height).toBeGreaterThan(15);
  const cardBox = await card.boundingBox();
  expect(initial!.y + initial!.height).toBeCloseTo(cardBox!.y + cardBox!.height, 0);
  expect(initial!.y - cardBox!.y).toBeLessThan(cardBox!.height * .15);
  expect(cardBox!.height).toBeLessThan(50);
  const message = card.getByRole("status");
  expect(await message.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  const textBox = await message.boundingBox();
  const closeBox = await card.getByRole("button").boundingBox();
  expect(Math.abs(textBox!.y + textBox!.height / 2 - closeBox!.y - closeBox!.height / 2)).toBeLessThan(1);
  await page.waitForTimeout(800);
  const drained = await edge.boundingBox();
  expect(drained!.height).toBeLessThan(initial!.height - 2);
  await card.hover();
  const paused = await edge.boundingBox();
  await page.waitForTimeout(300);
  expect(Math.abs((await edge.boundingBox())!.height - paused!.height)).toBeLessThan(1);
});
