import { expect, test } from "./browser-fixture.ts";
import { cleanWorkspaceGitScenario, runningConversationScenario } from "./browser-fixture.ts";

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
  await expect(page.locator(".feedback")).toContainText(/Archived \d+ completed task/);
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
  await expect(page.getByRole("status")).toContainText(/Unarchived T-/);
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
      await route.fulfill({ status: 200, json: { accepted: true } });
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
