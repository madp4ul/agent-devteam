import { mockArchivalMenuOperations } from "./browser-fixture.ts";
import { expect, test } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) test(`${theme} nested archive requires review and explicit Proceed`, async ({ page, request }) => {
  await page.addInitScript((appearance) => localStorage.setItem("coordination-theme", appearance), theme);
  const created = await (await request.post("/api/tasks", { data: { boardId: "delivery", columnId: "backlog",
    title: "Inspect nested evidence", description: "Keep evidence until deliberate consent.", idempotencyKey: `nested-${theme}` } })).json();
  const taskId = created.task.id as string;
  const calls: Record<string, unknown>[] = [];
  const opens: Record<string, unknown>[] = [];
  let changed = false;
  await page.route(`**/api/tasks/${taskId}/archive`, async (route) => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.archivalPreviewToken && !changed) {
      changed = true;
      await route.fulfill({ status: 409, json: { accepted: false, reason: "workspace-preview-changed", removedWorktrees: ["previous-child"] } });
      return;
    }
    await route.fulfill({ status: body.archivalPreviewToken ? 202 : 409,
      json: body.archivalPreviewToken ? { accepted: true, operation: { id: body.idempotencyKey, state: "completed",
        tasks: [{ taskId, state: "archived" }] } } : { accepted: false, reason: "workspace-nested-worktrees" } });
  });
  await page.route(`**/api/tasks/${taskId}/archive/open`, async (route) => {
    opens.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { reason: "workspace-open-failed", diagnostic: "Editor executable is unavailable." } });
  });
  await page.route(`**/api/tasks/${taskId}/archive/preview`, (route) => route.fulfill({ json: { available: true, preview: {
    token: "reviewed-scope", worktrees: [{ path: "C:/work/tasks/T-0001", parent: true, canOpen: true, durableHead: false, ignoredFiles: 0, upstream: { kind: "none" } },
      { path: "C:/work/tasks/T-0001/evidence/long-nested-checkout", parent: false, canOpen: true, durableHead: false, ignoredFiles: 3, upstream: { kind: "none" },
        state: { head: { kind: "detached", shortHash: "abc1234" }, history: { kind: "no-task-baseline" },
          changes: { additions: 1, deletions: 0, stagedFiles: 1, unstagedFiles: 2, untrackedFiles: 1 } } }],
  } } }));
  await page.goto(`/tasks/${taskId}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await page.getByText("More actions", { exact: true }).click();
  await page.getByRole("button", { name: "Archive task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review workspace deletion" });
  await expect(dialog).toContainText("3 ignored");
  await expect(dialog).toContainText("No durable named ref");
  await expect(dialog).toContainText("No upstream");
  await dialog.getByRole("button", { name: "Open in Visual Studio Code" }).last().click();
  await expect(dialog.getByRole("alert")).toContainText("Editor executable is unavailable");
  expect(opens[0]?.path).toBe("C:/work/tasks/T-0001/evidence/long-nested-checkout");
  await dialog.getByRole("button", { name: "Abort", exact: true }).click();
  expect(calls).toHaveLength(1);
  await page.getByRole("button", { name: "Archive task", exact: true }).click();
  await page.setViewportSize({ width: 520, height: 760 });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Proceed", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => calls.length).toBe(3);
  expect(calls[2]?.archivalPreviewToken).toBe("reviewed-scope");
  await expect(dialog).toContainText("Already removed: previous-child");
  await expect(dialog.getByRole("button", { name: "Proceed", exact: true })).toBeEnabled();
  expect(calls).toHaveLength(3);
  await dialog.getByRole("button", { name: "Proceed", exact: true }).click();
  await expect.poll(() => calls.length).toBe(4);
  await expect(dialog).toHaveCount(0);
});

test("bulk archive lists each rejected task with actionable individual links", async ({ page, request }) => {
  const created = await (await request.post("/api/tasks", { data: { boardId: "delivery", columnId: "backlog",
    title: "Completed bulk task", description: "Bulk failure feedback", idempotencyKey: "bulk-feedback" } })).json();
  await request.post(`/api/tasks/${created.task.id}/move`, { data: { destinationColumnId: "completion",
    expectedRevision: created.task.revision, idempotencyKey: "bulk-complete" } });
  const operation = { id: "bulk-feedback", target: { kind: "completion", boardId: "delivery" }, label: "Product delivery · Completion", state: "completed",
    updatedAt: new Date().toISOString(), tasks: [
      { taskId: "T-0090", title: "Archived", state: "archived" },
      { taskId: "T-0091", title: "Nested evidence", state: "failed", failure: { reason: "workspace-nested-worktrees" } },
      { taskId: "T-0092", title: "Local edits", state: "failed", failure: { reason: "workspace-dirty" } },
      ...Array.from({ length: 12 }, (_, index) => ({ taskId: `T-01${index}`, title: "Long task failure detail", state: "failed", failure: { reason: "workspace-dirty" } })),
    ] };
  let submitted = false;
  const accepted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route("**/api/archive/completed", async (route) => {
    accepted.resolve();
    await release.promise;
    submitted = true;
    return route.fulfill({ status: 202, json: { accepted: true, operation } });
  });
  await mockArchivalMenuOperations(page, () => submitted ? [operation] : []);
  await page.goto("/");
  await page.getByRole("button", { name: "Expand Product delivery" }).click();
  await page.getByRole("button", { name: "Archive completed tasks" }).click();
  try { await accepted.promise; } finally { release.resolve(); }
  await page.getByText("0 archiving", { exact: true }).click();
  const feedback = page.getByRole("region", { name: "Archival operations" });
  await expect(feedback).toBeInViewport();
  await expect(feedback.getByRole("listitem")).toHaveCount(15);
  await expect(feedback.getByRole("link", { name: /T-0091.*Nested evidence/ })).toHaveAttribute("href", "/tasks/T-0091");
  await expect(feedback.getByRole("link", { name: /T-0092.*Local edits/ })).toBeVisible();
  await expect(feedback).toContainText("archive it individually");
  expect(await feedback.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(feedback).toBeHidden();
  await page.getByText("0 archiving", { exact: true }).click();
  await expect(feedback).toBeVisible();
  await page.route("**/api/activity-menu/history/dismiss", async (route) => {
    submitted = false;
    await route.fulfill({ json: { accepted: true } });
  });
  await feedback.getByRole("button", { name: "Dismiss history" }).click();
  await expect(page.getByText("0 archiving", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("0 archiving", { exact: true })).toHaveCount(0);

});

test("unavailable Git status blocks deletion but preserves safe external inspection", async ({ page, request }) => {
  const created = await (await request.post("/api/tasks", { data: { boardId: "delivery", columnId: "backlog",
    title: "Inspect unavailable status", description: "Repair before deletion", idempotencyKey: "unavailable-preview" } })).json();
  const taskId = created.task.id as string;
  await page.route(`**/api/tasks/${taskId}/archive`, (route) => route.fulfill({ status: 409, json: { reason: "workspace-nested-worktrees" } }));
  await page.route(`**/api/tasks/${taskId}/archive/preview`, (route) => route.fulfill({ json: { available: true,
    preview: { token: null, worktrees: [{ path: "C:/safe/task/nested", parent: false, canOpen: true,
      ignoredFiles: 0, durableHead: false, upstream: { kind: "unknown" }, diagnostic: "Git status unavailable" }] } } }));
  let opened = false;
  await page.route(`**/api/tasks/${taskId}/archive/open`, async (route) => { opened = true; await route.fulfill({ json: { accepted: true } }); });
  await page.goto(`/tasks/${taskId}`);
  await page.getByText("More actions", { exact: true }).click();
  await page.getByRole("button", { name: "Archive task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review workspace deletion" });
  await expect(dialog.getByRole("button", { name: "Proceed", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Open in File Explorer" }).click();
  await expect.poll(() => opened).toBe(true);
  await expect(dialog).toContainText("Open request sent");
  await expect(dialog).not.toContainText("No uncommitted changes");
});
