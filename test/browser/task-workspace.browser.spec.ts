import { expect, test } from "./browser-fixture.ts";
import { cleanWorkspaceGitScenario } from "./browser-fixture.ts";

test("task details expose lazy and provisioned task workspaces", async ({ page, context, request }) => {
  const lazyTaskResponse = await request.post("/api/tasks", {
    data: {
      boardId: "delivery",
      columnId: "backlog",
      title: "Keep this workspace lazy",
      description: "Provision only when runnable work starts.",
      idempotencyKey: "browser-lazy-workspace-task",
    },
  });
  const lazyTask = await lazyTaskResponse.json() as { task: { id: string } };
  await page.goto(`/tasks/${lazyTask.task.id}`);
  const unprovisioned = page.getByRole("region", { name: "Workspace", exact: true });
  await expect(unprovisioned).toContainText("No task workspace exists yet");
  await expect(unprovisioned).toContainText("created before the first runnable activation");
  await expect(unprovisioned.getByRole("button", { name: "Copy path" })).toHaveCount(0);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tasks/T-0001");
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  const workspaceFacts = await page.evaluate(async () => {
    const response = await fetch("/api/tasks/T-0001");
    const detail = await response.json();
    return detail.inspection.workspace as { path: string; commit: string };
  });
  const expectedPath = workspaceFacts.path;
  await expect(workspace).not.toContainText(expectedPath);
  await expect(workspace).not.toContainText("Starting ref");
  await expect(workspace).toContainText(workspaceFacts.commit.slice(0, 7));
  await expect(workspace).not.toContainText(workspaceFacts.commit);

  await workspace.getByRole("button", { name: "Copy path" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expectedPath);
  await expect(workspace.getByRole("status")).toContainText("Copied task workspace path");

  await workspace.getByRole("button", { name: "Open folder" }).click();
  await expect(workspace.getByRole("status")).toContainText("default folder application");

  await workspace.getByRole("button", { name: "More ways to open workspace" }).click();
  await workspace.getByRole("menuitem", { name: "Open in Visual Studio Code" }).click();
  await expect(workspace.getByRole("status")).toContainText("Visual Studio Code");

  await page.route("**/api/tasks/T-0001/workspace/open", (route) => route.fulfill({
    status: 503,
    json: {
      reason: "host-integration-unavailable",
      diagnostic: "Opening task workspaces is unavailable on this host.",
    },
  }));
  await workspace.getByRole("button", { name: "Open folder" }).click();
  await expect(workspace.getByRole("alert")).toContainText("unavailable on this host");

  await page.route("**/api/tasks/T-0001/workspace/open-vscode", (route) => route.fulfill({
    status: 409,
    json: {
      reason: "workspace-open-failed",
      diagnostic: "Visual Studio Code could not be found on this host.",
    },
  }));
  await workspace.getByRole("button", { name: "More ways to open workspace" }).click();
  await workspace.getByRole("menuitem", { name: "Open in Visual Studio Code" }).click();
  await expect(workspace.getByRole("alert")).toContainText("Visual Studio Code could not be found");

  await page.setViewportSize({ width: 360, height: 760 });
  const workspaceBounds = await workspace.boundingBox();
  const headingBounds = await workspace.getByRole("heading", { name: "Workspace" }).boundingBox();
  const actionBounds = await workspace.locator(".workspace-actions").boundingBox();
  const copyBounds = await workspace.getByRole("button", { name: "Copy path" }).boundingBox();
  const openBounds = await workspace.getByRole("button", { name: "Open folder" }).boundingBox();
  expect(workspaceBounds).not.toBeNull();
  expect(headingBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  expect(copyBounds).not.toBeNull();
  expect(openBounds).not.toBeNull();
  if (workspaceBounds !== null && actionBounds !== null) {
    expect(actionBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
    expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
      workspaceBounds.x + workspaceBounds.width,
    );
  }
  if (headingBounds !== null && actionBounds !== null) {
    expect(actionBounds.y).toBeGreaterThanOrEqual(headingBounds.y + headingBounds.height);
    expect(Math.abs(actionBounds.x - headingBounds.x)).toBeLessThanOrEqual(2);
  }
  expect(Math.abs(copyBounds!.height - openBounds!.height)).toBeLessThanOrEqual(1);
});


test("task workspace Git summary refreshes branch, detached, history, and clean change state", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/tasks/T-0001/workspace/git-state", async (route) => {
    reads += 1;
    await route.fulfill({
      status: 200,
      json: reads === 1
        ? {
            available: true,
            state: {
              head: { kind: "branch", name: "codex/issue-33", shortHash: "def5678" },
              history: { kind: "progress", commitsSinceTaskStart: 3 },
              changes: {
                additions: 14,
                deletions: 5,
                stagedFiles: 2,
                unstagedFiles: 2,
                untrackedFiles: 1,
              },
            },
          }
        : {
            available: true,
            state: {
              head: { kind: "detached", shortHash: "abc1234" },
              history: { kind: "diverged" },
              changes: {
                additions: 0,
                deletions: 0,
                stagedFiles: 0,
                unstagedFiles: 0,
                untrackedFiles: 0,
              },
            },
          },
    });
  });

  await page.goto("/tasks/T-0001");
  const summary = page.getByRole("region", { name: "Workspace Git summary" });
  const taskStartCommit = await page.evaluate(async () => {
    const response = await fetch("/api/tasks/T-0001");
    const detail = await response.json();
    return detail.inspection.workspace.commit as string;
  });
  await expect(summary).toContainText("Task start");
  await expect(summary).toContainText(taskStartCommit.slice(0, 7));
  await expect(summary).toContainText("codex/issue-33");
  await expect(summary).toContainText("def5678");
  await expect(summary).toContainText("3 commits since task start");
  await expect(summary).toContainText("+14");
  await expect(summary).toContainText("−5");
  await expect(summary).toContainText("2 staged");
  await expect(summary).toContainText("2 unstaged");
  await expect(summary).toContainText("1 untracked");
  const historyBounds = await summary.locator(".workspace-history-flow").boundingBox();
  const changesBounds = await summary.locator(".workspace-changes-card").boundingBox();
  expect(historyBounds).not.toBeNull();
  expect(changesBounds).not.toBeNull();
  if (historyBounds !== null && changesBounds !== null) {
    expect(historyBounds.y + historyBounds.height).toBeLessThanOrEqual(changesBounds.y);
  }

  await page.clock.fastForward(30_000);
  await expect(summary).toContainText("Detached at abc1234");
  await expect(summary).toContainText("History diverged from task start");
  await expect(summary).toContainText("No uncommitted changes");
  await expect(summary).not.toContainText("staged");
});


test("running workspace Git scans pause while hidden and never overlap", async ({ page, context, request }) => {
  await page.clock.install();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const detail = await (await request.get("/api/tasks/T-0001")).json();
  detail.activeRun = {
    attemptId: "live-attempt",
    activationId: "live-activation",
    taskId: "T-0001",
    agentId: "implementer",
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await page.route("**/api/tasks/T-0001", async (route) => {
    await route.fulfill({ status: 200, json: detail });
  });
  let reads = 0;
  let releaseSlowScan: (() => void) | undefined;
  await page.route("**/api/tasks/T-0001/workspace/git-state", async (route) => {
    reads += 1;
    if (reads === 2) await new Promise<void>((resolve) => { releaseSlowScan = resolve; });
    await route.fulfill({ status: 200, json: cleanWorkspaceGitScenario() });
  });

  await page.goto("/tasks/T-0001");
  await expect(page.getByRole("region", { name: "Workspace Git summary" })).toContainText(
    "No uncommitted changes",
  );
  expect(reads).toBe(1);

  await page.clock.fastForward(5_000);
  await expect.poll(() => reads).toBe(2);
  await page.clock.fastForward(20_000);
  expect(reads).toBe(2);
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  await workspace.getByRole("button", { name: "Copy path" }).click();
  await expect(workspace.getByRole("status")).toContainText("Copied task workspace path");
  await workspace.getByRole("button", { name: "Open folder" }).click();
  await expect(workspace.getByRole("status")).toContainText("default folder application");
  releaseSlowScan?.();

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(30_000);
  expect(reads).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => reads).toBe(3);
});


test("a failed workspace Git scan retains its result and recovers automatically", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/tasks/T-0001/workspace/git-state", async (route) => {
    reads += 1;
    if (reads === 2) {
      await route.fulfill({
        status: 503,
        json: { available: false, reason: "git-status-unavailable" },
      });
      return;
    }
    await route.fulfill({ status: 200, json: cleanWorkspaceGitScenario() });
  });

  await page.goto("/tasks/T-0001");
  const summary = page.getByRole("region", { name: "Workspace Git summary" });
  await expect(summary).toContainText("No uncommitted changes");
  await page.clock.fastForward(30_000);
  await expect(summary.getByText("Git status unavailable")).toBeVisible();
  await expect(summary).toContainText("No uncommitted changes");
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  await workspace.getByRole("button", { name: "More ways to open workspace" }).click();
  await workspace.getByRole("menuitem", { name: "Open in Visual Studio Code" }).click();
  await expect(workspace.getByRole("status")).toContainText("Visual Studio Code");
  await page.clock.fastForward(30_000);
  await expect(summary.getByText("Git status unavailable")).toHaveCount(0);
  expect(reads).toBe(3);
});
