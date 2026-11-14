import { expect, test } from "./browser-fixture.ts";
import { cleanWorkspaceGitScenario } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) test(`queued archival stays actionable across columns and reload in ${theme}`, async ({ page, request }) => {
  await page.addInitScript((appearance) => localStorage.setItem("coordination-theme", appearance), theme);
  const created = await (await request.post("/api/tasks", { data: {
    boardId: "delivery", columnId: "backlog", title: "Queued browser archive", description: "Archive asynchronously.", idempotencyKey: "queued-browser-task",
  } })).json();
  await request.post(`/api/tasks/${created.task.id}/move`, { data: {
    destinationColumnId: "completion", expectedRevision: created.task.revision, idempotencyKey: "queued-browser-complete",
  } });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const board = await response.json();
    const copy = structuredClone(board.boards[0]);
    copy.id = "second";
    copy.name = "Second board";
    board.boards.push(copy);
    await route.fulfill({ response, json: board });
  });
  const operations = new Map<string, { id: string; target: { kind: string; boardId: string }; label: string; state: string; updatedAt: string; tasks: object[] }>();
  const firstReceived = Promise.withResolvers<void>();
  const releaseFirst = Promise.withResolvers<void>();
  let posts = 0;
  await page.route("**/api/archive/completed", async (route) => {
    const body = route.request().postDataJSON();
    posts += 1;
    const operation = { id: body.idempotencyKey, target: { kind: "completion", boardId: body.boardId },
      label: `${body.boardId === "delivery" ? "Product delivery" : "Second board"} · Completion`,
      state: body.boardId === "delivery" ? "running" : "queued", updatedAt: new Date().toISOString(),
      tasks: [{ taskId: created.task.id, title: created.task.title, state: body.boardId === "delivery" ? "running" : "queued" }] };
    operations.set(operation.id, operation);
    if (body.boardId === "delivery") {
      firstReceived.resolve();
      await releaseFirst.promise;
      await route.abort();
    } else await route.fulfill({ status: 202, json: { accepted: true, operation } });
  });
  await page.route("**/api/archive/operations", (route) => route.fulfill({ json: [...operations.values()] }));
  await page.route("**/api/archive/operations/*", (route) => {
    const operation = operations.get(new URL(route.request().url()).pathname.split("/").at(-1)!);
    return route.fulfill({ status: operation ? 200 : 404, json: operation ?? { reason: "not-found" } });
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const delivery = page.getByRole("region", { name: "Product delivery" });
  const second = page.getByRole("region", { name: "Second board" });
  await delivery.getByRole("button", { name: "Expand Product delivery" }).click();
  await second.getByRole("button", { name: "Expand Second board" }).click();
  const firstArchive = delivery.getByRole("button", { name: "Archive completed tasks" });
  try {
    await firstArchive.click();
    await firstReceived.promise;
    await expect(firstArchive).toBeDisabled();
    await expect(delivery.getByText("Archiving…", { exact: true })).toBeVisible();
    await second.getByRole("button", { name: "Archive completed tasks" }).click();
    const feedback = page.getByRole("region", { name: "Operation feedback" });
    await expect(feedback).toContainText("Queued · 0 of 1 processed");
    await expect(feedback).toContainText("Archiving · 0 of 1 processed");
    await expect(feedback).toBeInViewport();
    releaseFirst.resolve();
    await page.reload();
    await expect(feedback).toContainText("Archive · Product delivery · Completion");
    await expect(feedback).toContainText("Archive · Second board · Completion");
    expect(posts).toBe(2);
    for (const operation of operations.values()) {
      operation.state = "completed";
      operation.updatedAt = new Date().toISOString();
      operation.tasks = [{ taskId: created.task.id, title: created.task.title, state: "archived" }];
    }
    await expect(feedback.getByText("Archived 1 of 1 completed task(s).", { exact: true })).toHaveCount(2);
  } finally { releaseFirst.resolve(); }
});

test("archived visibility follows the latest toggle intent while archive data loads", async ({ page }) => {
  await page.route("**/api/archive", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, json: { available: true, tasks: [] } });
  });
  await page.goto("/");
  const archivedToggle = page.getByRole("button", { name: "Show archived tasks" });

  await archivedToggle.click();
  expect(await archivedToggle.getAttribute("aria-pressed")).toBe("true");
  await archivedToggle.click();
  expect(await archivedToggle.getAttribute("aria-pressed")).toBe("false");
  await page.waitForTimeout(250);
  expect(await archivedToggle.getAttribute("aria-pressed")).toBe("false");
});


test("archived tasks toggle into their retained board location and can be unarchived", async ({ page, request }) => {
  const createdResponse = await request.post("/api/tasks", {
    data: {
      boardId: "delivery",
      columnId: "backlog",
      title: "Archive this completed browser task",
      description: "Keep its coordination history while removing it from the ordinary board.",
      idempotencyKey: "create-browser-archive-task",
    },
  });
  const created = await createdResponse.json() as { task: { id: string; revision: number } };
  await request.post(`/api/tasks/${created.task.id}/move`, {
    data: {
      destinationColumnId: "completion",
      expectedRevision: created.task.revision,
      idempotencyKey: "complete-browser-archive-task",
    },
  });
  await page.goto("/");
  const automation = page.locator(".automation-control");
  await expect(automation.getByRole("button", { name: /Archived tasks|Archive completed/ })).toHaveCount(0);
  await page.setViewportSize({ width: 640, height: 760 });
  await expect(automation.getByRole("button", { name: /Settings/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Expand Product delivery" }).click();
  const completion = page.getByTestId("column-completion");

  await expect(completion.getByRole("button", { name: "Create task in Completion" })).toHaveCount(0);
  const archiveCompleted = completion.getByRole("button", { name: "Archive completed tasks" });
  const completionTitleBounds = await completion.getByRole("heading", { name: "Completion" }).boundingBox();
  const archiveBounds = await archiveCompleted.boundingBox();
  expect(completionTitleBounds).not.toBeNull();
  expect(archiveBounds).not.toBeNull();
  if (completionTitleBounds !== null && archiveBounds !== null) {
    expect(archiveBounds.y).toBeGreaterThanOrEqual(
      completionTitleBounds.y + completionTitleBounds.height,
    );
    expect(Math.abs(archiveBounds.x - completionTitleBounds.x)).toBeLessThanOrEqual(4);
  }
  await archiveCompleted.click();
  await expect(page.getByRole("region", { name: "Operation feedback" })).toContainText("Archived 1 of 1 completed task");
  await expect(page.getByRole("link", { name: /Archive this completed browser task/ })).toHaveCount(0);

  const archivedToggle = page.getByRole("button", { name: "Show archived tasks" });
  await expect(archivedToggle).toHaveAttribute("aria-pressed", "false");
  await archivedToggle.click();
  await expect(archivedToggle).toHaveAttribute("aria-pressed", "true");
  const archivedCard = completion.locator(".task-card.archived").filter({
    hasText: "Archive this completed browser task",
  });
  await expect(archivedCard).toContainText("Archived");
  await expect(archivedCard.getByRole("button", { name: /Drag/ })).toHaveCount(0);
  await archivedToggle.click();
  await expect(archivedCard).toHaveCount(0);
  await archivedToggle.click();
  await completion.getByRole("link", { name: /Archive this completed browser task/ }).click();
  await expect(page.locator(".task-heading .eyebrow")).toContainText("Archived");
  await expect(page.getByRole("button", { name: "View conversation" })).toHaveCount(0);
  const archivedEntry = page.locator(".timeline-entry").filter({ hasText: "Task archived" });
  await expect(archivedEntry).toContainText("Removed from the active board");
  await expect(archivedEntry).not.toContainText("Attempt activity");
  await page.getByRole("button", { name: "Unarchive task" }).click();
  await expect(page.getByText(/Unarchived T-/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive task" })).toBeVisible();
  const unarchivedEntry = page.locator(".timeline-entry").filter({ hasText: "Task unarchived" });
  await expect(unarchivedEntry).toContainText("Returned to the active board");
  await expect(unarchivedEntry).not.toContainText("Attempt activity");
});


test("archive is promoted only for completed tasks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create task in Backlog" }).click();
  await page.getByLabel("Outcome-oriented title").fill("Keep archival secondary");
  await page.getByLabel("Complete description").fill("Archive remains available without being promoted before Completion.");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("link", { name: /Keep archival secondary/ }).click();
  const actions = page.getByRole("region", { name: "Description" }).locator(".task-actions");
  await expect(actions.getByRole("button", { name: "Archive task" })).toHaveCount(0);
  await actions.getByText("More actions", { exact: true }).click();
  const secondaryArchive = actions.getByRole("button", { name: "Archive task" });
  await expect(secondaryArchive).toBeVisible();
  await expect(secondaryArchive).toHaveClass(/secondary/);
  const taskUrl = page.url();
  await secondaryArchive.click();
  await expect(page).toHaveURL(taskUrl);
  await expect(page.locator(".task-heading .eyebrow")).toContainText("Archived");
  await expect(page.getByRole("button", { name: "Unarchive task" })).toBeVisible();
});


test("a dirty workspace requires explicit discard confirmation before archival", async ({ page }) => {
  const archiveRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/tasks/*/archive", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    archiveRequests.push(body);
    if (body.discardWorkspaceChanges === true) {
      const taskId = new URL(route.request().url()).pathname.split("/")[3];
      await route.fulfill({ status: 202, json: { accepted: true, operation: {
        id: body.idempotencyKey, state: "completed", tasks: [{ taskId, state: "archived" }],
      } } });
      return;
    }
    await route.fulfill({ status: 409, json: { accepted: false, reason: "workspace-dirty" } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create task in Backlog" }).click();
  await page.getByLabel("Outcome-oriented title").fill("Confirm workspace discard");
  await page.getByLabel("Complete description").fill("Require a deliberate choice before deleting local workspace changes.");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("link", { name: /Confirm workspace discard/ }).click();
  const taskUrl = page.url();
  await page.getByText("More actions", { exact: true }).click();
  await page.getByRole("button", { name: "Archive task" }).click();

  const confirmation = page.getByRole("dialog", { name: "Discard workspace changes?" });
  await expect(confirmation).toContainText("permanently delete uncommitted and untracked changes");
  await confirmation.getByRole("button", { name: "Keep workspace" }).click();
  await expect(confirmation).toHaveCount(0);
  await page.getByRole("button", { name: "Archive task" }).click();
  await confirmation.getByRole("button", { name: "Discard changes and archive" }).click();
  await expect.poll(() => archiveRequests.length).toBe(3);
  await expect(page).toHaveURL(taskUrl);
  expect(archiveRequests).toHaveLength(3);
  expect(archiveRequests[0]?.discardWorkspaceChanges).toBeUndefined();
  expect(archiveRequests[1]?.discardWorkspaceChanges).toBeUndefined();
  expect(archiveRequests[2]?.discardWorkspaceChanges).toBe(true);
});
