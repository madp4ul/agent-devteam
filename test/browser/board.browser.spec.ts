import { expect, test } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { writeProcessEvolutionDefinition } from "../support/process-evolution-fixture.ts";

test("process changes expose startup impact and explicit stale-work recovery", async ({ page }) => {
  let staleActivations = [
    {
      activationId: "compatible-activation",
      taskId: "T-0001",
      targetAgentId: "consulting-agent",
      priorStatus: "queued",
      targetAvailable: true,
      taskMapped: true,
    },
    {
      activationId: "removed-target-activation",
      taskId: "T-0002",
      targetAgentId: "retired-agent",
      priorStatus: "failed",
      targetAvailable: false,
      taskMapped: false,
    },
  ];
  let resumedWithCurrentProcess = false;
  await page.route("**/api/activations/removed-target-activation/dismiss-stale", async (route) => {
    staleActivations = staleActivations.filter(({ activationId }) =>
      activationId !== "removed-target-activation");
    await route.fulfill({ status: 200, json: { accepted: true, activationId: "removed-target-activation" } });
  });
  await page.route("**/api/automation/resume-with-current-process", async (route) => {
    resumedWithCurrentProcess = true;
    staleActivations = [];
    await route.fulfill({
      status: 200,
      json: { accepted: true, automation: { state: "running", attemptsMayStart: true } },
    });
  });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.startup.processImpact = {
      previousVersion: "previous-version",
      currentVersion: "current-version",
      unmappedTasks: [{
        taskId: "T-0002",
        title: "Drag this task",
        boardId: "delivery",
        boardName: "Product delivery",
        columnId: "retired-column",
        columnName: "Retired column",
      }],
      staleActivations,
    };
    if (resumedWithCurrentProcess) {
      body.automation = { state: "running", attemptsMayStart: true };
    }
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  const impact = page.locator(".process-impact");
  await expect(impact.getByRole("heading", { name: "Review startup impact" })).toBeVisible();
  await expect(impact).toContainText("T-0002 Â· Drag this task Â· former Product delivery / Retired column");
  await expect(impact).toContainText("retired-agent Â· failed Â· target agent removed Â· task unmapped");
  await impact.locator("li").filter({ hasText: "retired-agent" })
    .getByRole("button", { name: "Dismiss stale activation" }).click();
  await expect(impact).not.toContainText("retired-agent");
  await impact.getByRole("button", { name: "Resume with current process" }).click();
  await expect.poll(() => resumedWithCurrentProcess).toBe(true);
  await expect(page.getByText("Automation running")).toBeVisible();
});

test("actual definition removal, user remapping, and identity restoration stay recoverable", async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-browser-process-evolution-"));
  const definitionPath = join(directory, "process.yaml");
  const databasePath = join(directory, "coordination.sqlite3");
  await writeFile(join(directory, "implementer.md"), "Implement the task.\n");
  await writeProcessEvolutionDefinition(definitionPath, { includeImplementation: true });
  const first = await CoordinationApplication.start({ processDefinitionPath: definitionPath, databasePath });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Recover changed process state",
    description: "The browser must keep removed state visible and recoverable.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "browser-create-before-definition-change",
  });
  expect(created.accepted).toBe(true);
  if (!created.accepted) return;
  first.close();

  await writeProcessEvolutionDefinition(definitionPath, { includeImplementation: false });
  const removed = await CoordinationApplication.start({ processDefinitionPath: definitionPath, databasePath });
  const removedServer = await startWebServer(removed, { host: "127.0.0.1", port: 0 });
  await page.goto(removedServer.baseUrl);
  const impact = page.locator(".process-impact");
  await expect(impact).toContainText(`${created.task.id} Â· Recover changed process state`);
  await impact.getByRole("button", { name: "Dismiss stale activation" }).click();
  await impact.getByRole("button", { name: new RegExp(created.task.id) }).click();
  await page.getByRole("button", { name: /Backlog/ }).click();
  await expect(page.getByText("Backlog", { exact: true }).first()).toBeVisible();
  await removedServer.close();
  removed.close();

  await writeProcessEvolutionDefinition(definitionPath, {
    includeImplementation: true,
    boardName: "Renamed Delivery",
    implementationName: "Restored Implementation",
  });
  const restored = await CoordinationApplication.start({ processDefinitionPath: definitionPath, databasePath });
  const restoredServer = await startWebServer(restored, { host: "127.0.0.1", port: 0 });
  await page.goto(restoredServer.baseUrl);
  await expect(page.getByRole("heading", { name: "Renamed Delivery" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(created.task.id) })).toBeVisible();
  await expect(page.locator(".process-impact")).toHaveCount(0);
  await restoredServer.close();
  restored.close();
});


test("live runs show the actual agent and timer while process pause drains", async ({ page }) => {
  let automationState: "running" | "pausing" | "paused" = "running";
  await page.route("**/api/automation/pause", async (route) => {
    automationState = "pausing";
    setTimeout(() => { automationState = "paused"; }, 1_200);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, automation: { state: "pausing", attemptsMayStart: false } }),
    });
  });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const task = body.boards[0].columns.flatMap((column: { tasks: unknown[] }) => column.tasks)
      .find((candidate: { id: string }) => candidate.id === "T-0002");
    task.run = {
      status: automationState === "paused" ? "idle" : "running",
      activeAgentId: automationState === "paused" ? null : "consulting-agent",
      queuedActivationCount: 0,
      failedActivationCount: 0,
    };
    body.automation = automationState === "running"
      ? { state: "running", attemptsMayStart: true }
      : { state: automationState, attemptsMayStart: false };
    body.activeRuns = automationState === "paused" ? [] : [{
      attemptId: "live-attempt",
      taskId: "T-0002",
      taskTitle: "Drag this task",
      boardId: "delivery",
      boardName: "Product delivery",
      columnId: "backlog",
      columnName: "Backlog",
      agentId: "consulting-agent",
      status: "running",
      startedAt: new Date(Date.now() - 65_000).toISOString(),
    }];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  const card = page.getByRole("link", { name: /T-0002 Drag this task/ }).locator("..");
  await expect(card).toContainText(/Active · consulting-agent · 1m/);
  await page.getByText("Current runs · 1").click();
  const runButton = page.getByRole("button", { name: /consulting-agent · T-0002.*running · 1m/ });
  await expect(runButton).toBeVisible();
  await runButton.click();
  await expect(page).toHaveURL(/\/tasks\/T-0002$/);
  await page.goto("/");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Draining active runs…" })).toBeDisabled();
  await expect(page.getByText("Automation pausing")).toBeVisible();
  await expect(page.getByText("Automation paused")).toBeVisible();
  await expect(page.getByText("No agents are changing boards.")).toBeVisible();
});

test("task interruption waits for confirmation and offers contextual continuation", async ({ page }) => {
  let interruptionState: "running" | "interrupting" | "interrupted" = "running";
  let continuedMessage: string | undefined;
  await page.route("**/api/tasks/T-0002/interrupt", async (route) => {
    interruptionState = "interrupting";
    await new Promise<void>((resolve) => setTimeout(resolve, 1_300));
    interruptionState = "interrupted";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accepted: true }) });
  });
  await page.route("**/api/tasks/T-0002/continue", async (route) => {
    continuedMessage = (route.request().postDataJSON() as { message: string }).message;
    interruptionState = "running";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accepted: true }) });
  });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const task = body.boards[0].columns.flatMap((column: { tasks: unknown[] }) => column.tasks)
      .find((candidate: { id: string }) => candidate.id === "T-0002");
    task.automationSuspended = interruptionState === "interrupted";
    task.run = interruptionState === "interrupted"
      ? { status: "queued", activeAgentId: null, queuedActivationCount: 1, failedActivationCount: 0 }
      : { status: "running", activeAgentId: "consulting-agent", queuedActivationCount: 0, failedActivationCount: 0 };
    const suspensionReason = {
      id: "automation-suspended:activity-suspended-live",
      type: "automation-suspended",
      sourceEventId: "activity-suspended-live",
      createdAt: "2026-08-08T12:00:00.000Z",
    };
    task.unresolvedAttention = interruptionState === "interrupted" ? [suspensionReason] : [];
    body.attention = interruptionState === "interrupted" ? [{
      task: {
        id: "T-0002",
        title: "Drag this task",
        boardId: "delivery",
        boardName: "Product delivery",
        columnId: "backlog",
      },
      reasons: [suspensionReason],
    }] : [];
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/tasks/T-0002", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.inspection.run = interruptionState === "interrupted"
      ? { status: "queued", activeAgentId: null, queuedActivationCount: 1, failedActivationCount: 0 }
      : { status: "running", activeAgentId: "consulting-agent", queuedActivationCount: 0, failedActivationCount: 0 };
    body.inspection.automationSuspended = interruptionState === "interrupted";
    const startedAt = new Date(Date.now() - 10_000).toISOString();
    body.activeRun = interruptionState === "interrupted" ? null : {
      attemptId: "live-attempt",
      taskId: "T-0002",
      taskTitle: "Drag this task",
      boardId: "delivery",
      boardName: "Product delivery",
      columnId: "backlog",
      columnName: "Backlog",
      agentId: "consulting-agent",
      status: interruptionState,
      startedAt,
    };
    body.task.activations = [{
      id: "live-activation",
      targetAgentId: "consulting-agent",
      status: "running",
      reason: { type: "agent-mention", sourceEventId: "comment-live" },
      attempts: [{
        id: "live-attempt",
        status: "running",
        workspacePath: "C:/task-workspace",
        startedAt,
        completedAt: null,
        outcome: null,
        threadId: "thread-live",
        model: null,
        reasoningEffort: null,
      }],
      startupFailure: null,
      recovery: null,
      model: null,
      reasoningEffort: null,
    }];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/tasks/T-0002");
  await expect(page.getByText(/Current attempt · consulting-agent · running/)).toBeVisible();
  await expect(page.locator(".attempt-entry").filter({ hasText: "consulting-agent · running" })).toBeVisible();
  await page.getByRole("button", { name: "View transcript" }).click();
  await expect(page.getByRole("dialog", { name: "Attempt transcript" })).toContainText(/consulting-agent · running · 0m/);
  await page.getByRole("button", { name: "Close transcript" }).click();
  const interruptClick = page.getByRole("button", { name: "Interrupt current attempt" }).click();
  await expect(page.getByRole("button", { name: "Interrupting…" })).toBeDisabled();
  await interruptClick;
  await expect(page.getByText(/Task automation is suspended/)).toBeVisible();
  await page.getByRole("link", { name: "Back to board" }).click();
  const suspendedCard = page.getByRole("link", { name: /T-0002 Drag this task/ }).locator("..");
  await expect(suspendedCard).not.toContainText("Automation suspended");
  await expect(suspendedCard).toContainText("Needs attention · 1");
  await expect(suspendedCard).toContainText("Queued · 1");
  const attention = page.locator(".needs-attention");
  await expect(attention).toContainText("T-0002 · Drag this task");
  await expect(attention).toContainText("automation suspended — Continue required");
  await page.getByRole("link", { name: /T-0002 Drag this task/ }).click();
  await page.getByLabel("Continuation message (optional)").fill("Continue after checking the workspace.");
  await page.getByRole("button", { name: "Continue interrupted activation" }).click();
  await expect.poll(() => continuedMessage).toBe("Continue after checking the workspace.");
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(page.getByRole("link", { name: /T-0002 Drag this task/ }).locator(".."))
    .not.toContainText("Automation suspended");
  await expect(attention).toHaveCount(0);
});

test("configuration errors show the invalid value with the actionable diagnostic", async ({ page }) => {
  await page.route("**/api/board", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        startup: {
          mode: "configuration-error",
          diagnostics: [{
            file: "process.yaml",
            line: 12,
            column: 24,
            invalidValue: "missing-agent",
            rule: "The referenced watching agent must exist.",
            consequence: "The process cannot be applied.",
            correction: "Reference a declared agent ID.",
          }],
          automation: { state: "blocked", attemptsMayStart: false },
        },
        automation: { state: "blocked", attemptsMayStart: false },
        boards: [],
        attention: [],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Configuration error" })).toBeVisible();
  await expect(page.getByText("Invalid value: missing-agent")).toBeVisible();
});

test("creates in any column, opens tasks directly, and restores a narrow board context", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 820 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product delivery" })).toBeVisible();
  await page.getByRole("radio", { name: "Column layout" }).check();

  const lane = page.getByTestId("board-lane");
  const overflow = await lane.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    flexWrap: getComputedStyle(element).flexWrap,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.flexWrap).toBe("nowrap");

  const filter = page.getByLabel("Filter tasks");
  await filter.fill("Inspect");
  const inspectedLink = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await inspectedLink.scrollIntoViewIfNeeded();
  const savedScroll = await lane.evaluate((element) => element.scrollLeft);
  await inspectedLink.click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(filter).toHaveValue("Inspect");
  await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBe(savedScroll);

  await filter.fill("");
  await page.getByRole("button", { name: "Create task in Completion" }).click();
  await expect(page.getByLabel("Starting column")).toHaveValue("completion");
  await page.getByLabel("Outcome-oriented title").fill("Document the completed outcome");
  await page.getByLabel("Complete description").fill("Make the created task available immediately on the board.");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Created T-\d{4} in Completion/);
  await expect(page.getByRole("link", { name: /Document the completed outcome/ })).toBeVisible();

  await page.goto("/tasks/T-0001");
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
});

test("row layout is compact, independently scrollable, and remembered globally", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const board = body.boards[0];
    const template = board.columns.flatMap((column: { tasks: unknown[] }) => column.tasks)[0];
    for (const [columnIndex, column] of board.columns.slice(0, 2).entries()) {
      column.tasks = Array.from({ length: 8 }, (_, taskIndex) => ({
        ...template,
        id: `LAYOUT-${columnIndex}-${taskIndex}`,
        title: `Layout card ${columnIndex}-${taskIndex}`,
        column: { id: column.id, name: column.name },
      }));
    }
    board.columns.find((column: { id: string }) => column.id === "completion").tasks = [];
    body.attention = [];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  const rowChoice = page.getByRole("radio", { name: "Row layout" });
  const columnChoice = page.getByRole("radio", { name: "Column layout" });
  await expect(rowChoice).toBeChecked();

  const backlog = page.getByTestId("column-backlog");
  const implementation = page.getByTestId("column-implementation");
  const completion = page.getByTestId("column-completion");
  await expect(page.locator(".needs-attention")).toHaveCount(0);
  await expect(backlog).toContainText("User");
  await expect(backlog).not.toContainText("No watching agent");
  await expect(backlog).toHaveClass(/user-owned/);
  await expect(implementation).toContainText("Implementation Agent");
  await expect(implementation).not.toContainText("Watched by");
  await expect(completion).not.toContainText(/User|No watching agent/);
  await expect(completion).not.toHaveClass(/user-owned/);
  await expect(backlog.getByRole("button", { name: "Create task in Backlog" })).toBeVisible();
  await expect(backlog.getByRole("button", { name: "Create task in Backlog" }).locator("svg"))
    .toBeVisible();
  await expect.poll(() => completion.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(100);
  const backlogStrip = backlog.getByTestId("task-strip");
  const implementationStrip = implementation.getByTestId("task-strip");
  const backlogPosition = await backlogStrip.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(backlogPosition).toBeGreaterThan(0);
  expect(await implementationStrip.evaluate((element) => element.scrollLeft)).toBe(0);

  await page.getByLabel("Filter tasks").fill("does not match any card");
  await expect.poll(() => backlog.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(100);
  await page.getByLabel("Filter tasks").fill("");
  await expect.poll(() => backlogStrip.evaluate((element) => element.scrollLeft)).toBe(backlogPosition);

  await columnChoice.check();
  await expect(columnChoice).toBeChecked();
  await rowChoice.check();
  await expect.poll(() => backlogStrip.evaluate((element) => element.scrollLeft)).toBe(backlogPosition);
  await columnChoice.check();
  await page.reload();
  await expect(columnChoice).toBeChecked();
  await expect(page.getByTestId("board-lane")).toHaveCSS("flex-wrap", "nowrap");
});

test("newly entered tasks are newest-first in both board layouts", async ({ page }) => {
  await page.goto("/");
  const createInBacklog = page.getByRole("button", { name: "Create task in Backlog" });
  for (const title of ["Ordering example older", "Ordering example newer"]) {
    await createInBacklog.click();
    await page.getByLabel("Outcome-oriented title").fill(title);
    await page.getByLabel("Complete description").fill("Verify current-column-entry ordering.");
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Created");
  }

  const older = page.getByRole("link", { name: /Ordering example older/ }).locator("..");
  const newer = page.getByRole("link", { name: /Ordering example newer/ }).locator("..");
  expect((await newer.boundingBox())?.x).toBeLessThan((await older.boundingBox())?.x ?? 0);

  await page.getByRole("radio", { name: "Column layout" }).check();
  expect((await newer.boundingBox())?.y).toBeLessThan((await older.boundingBox())?.y ?? 0);
});

test("automatic board refresh preserves the user's current horizontal position", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 820 });
  let boardReads = 0;
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    boardReads += 1;
    body.startup.processName = `Scroll refresh ${boardReads}`;
    const backlog = body.boards[0].columns.find((column: { id: string }) => column.id === "backlog");
    const template = backlog.tasks[0];
    backlog.tasks = Array.from({ length: 8 }, (_, index) => ({
      ...template,
      id: index === 0 ? template.id : `SCROLL-${index}`,
      title: index === 0 ? template.title : `Overflow card ${index}`,
    }));
    body.activeRuns = [{
      attemptId: "scroll-refresh-attempt",
      taskId: "T-0002",
      taskTitle: "Drag this task",
      boardId: "delivery",
      boardName: "Product delivery",
      columnId: "backlog",
      columnName: "Backlog",
      agentId: "consulting-agent",
      status: "running",
      startedAt: new Date(Date.now() - 65_000).toISOString(),
    }];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Row layout" })).toBeChecked();
  const lane = page.getByTestId("column-backlog").getByTestId("task-strip");
  const renderedBoardRead = async (): Promise<number> => Number(
    (await page.locator(".topbar .eyebrow").textContent())?.replace("Scroll refresh ", ""),
  );
  await expect(lane).toBeVisible();
  const directPosition = await lane.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  const readsAfterDirectScroll = await renderedBoardRead();
  await expect.poll(renderedBoardRead).toBeGreaterThan(readsAfterDirectScroll);
  expect(await lane.evaluate((element) => element.scrollLeft)).toBe(directPosition);

  await lane.evaluate((element) => { element.scrollLeft = 3; });
  await page.getByRole("link", { name: /T-0001 Inspect existing coordination/ }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBe(3);

  const userPosition = await lane.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  const readsAfterUserScroll = await renderedBoardRead();
  await expect.poll(renderedBoardRead).toBeGreaterThan(readsAfterUserScroll);
  expect(await lane.evaluate((element) => element.scrollLeft)).toBe(userPosition);
});

test("details keep contextual controls, one timeline, and readable transcript evidence", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await expect(page.getByText("Understand the full task history")).toBeVisible();
  await expect(page.getByText(/Blocked by T-0002/)).toBeVisible();
  await expect(page.getByText(/Needs attention: user mention/)).toBeVisible();
  await expect(page.getByText("Please preserve the authored context")).toBeVisible();
  await expect(page.getByText("Task moved")).toBeVisible();
  await expect(page.getByText("Attempt 1")).toBeVisible();
  await expect(page.getByText("2m 30s")).toBeVisible();
  await expect(page.getByText("Model: Codex default · Reasoning: Codex default")).toBeVisible();

  const current = page.getByRole("button", { name: /Implementation.*Current/ });
  await expect(current).toBeDisabled();
  await expect(page.getByRole("button", { name: /Backlog.*Previous/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Completion.*Next/ })).toBeEnabled();

  const attemptEntry = page.locator(".attempt-entry").filter({ hasText: "Attempt 1" });
  await expect(attemptEntry.getByText("Thread information")).toHaveCount(0);
  await expect(attemptEntry).not.toContainText("thread-browser-123");
  await expect(attemptEntry.getByRole("button", { name: "Copy thread ID" })).toBeVisible();
  await attemptEntry.getByRole("button", { name: "View transcript" }).click();
  const dialog = page.getByRole("dialog", { name: "Attempt transcript" });
  await expect(dialog).not.toContainText("thread-browser-123");
  await expect(dialog).toContainText("I inspected the current task.");
  await expect(dialog).toContainText("pnpm test (exit 0)");
  await expect(dialog.getByText("output truncated")).toBeHidden();
  await dialog.getByText("View command output").click();
  await expect(dialog).toContainText("output truncated");
  await expect(dialog.getByRole("button", { name: "Copy thread ID" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close transcript" }).click();

  await page.getByRole("button", { name: "Edit task" }).click();
  await page.getByLabel("Task title").fill("Inspect all coordination evidence");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("heading", { name: "Inspect all coordination evidence" })).toBeVisible();

  await page.getByRole("button", { name: /Completion.*Next/ }).click();
  await expect(page.getByText(/Moved T-0001 to Completion/)).toBeVisible();
});

test("an open task reconciles external timeline changes without disturbing a focused draft", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    reads += 1;
    if (reads === 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    if (reads >= 3) {
      detail.task.comments.push({
        id: "external-live-comment",
        body: "An agent added this while the task page remained open.",
        actor: { kind: "agent", id: "implementer" },
        occurredAt: "2026-08-09T12:00:00.000Z",
      });
      detail.task.activity.push({
        id: "external-live-activation-event",
        type: "activation.created",
        actor: { kind: "framework", id: "coordination" },
        occurredAt: "2026-08-09T12:00:00.001Z",
        details: {
          activationId: "external-live-activation",
          targetAgentId: "external-reviewer",
        },
      });
      detail.task.activations.push({
        id: "external-live-activation",
        targetAgentId: "external-reviewer",
        status: "queued",
        reason: { type: "agent-mention", sourceEventId: "external-live-comment" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("Keep this unfinished user draft.");
  await draft.focus();
  await expect(page.getByText("An agent added this while the task page remained open.")).toBeVisible();
  await expect(page.getByText("Queued for external-reviewer.")).toBeVisible();
  await page.waitForTimeout(750);
  await expect(page.getByText("An agent added this while the task page remained open.")).toBeVisible();
  await expect(page.getByText("Queued for external-reviewer.")).toHaveCount(1);
  await expect(draft).toHaveValue("Keep this unfinished user draft.");
  await expect(draft).toBeFocused();
});

test("an open transcript replaces one running tool entry with its terminal evidence", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const attempt = detail.task.activations[0]?.attempts[0];
    if (attempt !== undefined) {
      attempt.status = "running";
      attempt.completedAt = null;
      attempt.outcome = null;
    }
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/attempts/browser-attempt/transcript", async (route) => {
    reads += 1;
    const retainedMessages = Array.from({ length: 30 }, (_, index) => ({
      id: `retained-message-${index}`,
      kind: "message",
      role: "agent",
      text: `Retained transcript message ${index + 1}.`,
    }));
    await route.fulfill({
      status: 200,
      json: {
        available: true,
        threadId: "thread-browser-123",
        items: reads === 1
          ? [{
              id: "live-browser-tool",
              kind: "tool",
              name: "command_execution",
              status: "running",
              summary: "pnpm test",
            }, ...retainedMessages]
          : [{
              id: "live-browser-tool",
              kind: "tool",
              name: "command_execution",
              status: "completed",
              summary: "pnpm test (exit 0)",
              output: "All live checks passed.",
            }, ...retainedMessages],
      },
    });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View transcript" }).click();
  const dialog = page.getByRole("dialog", { name: "Attempt transcript" });
  await expect(dialog).toContainText("pnpm test · running");
  const transcriptContent = dialog.locator(".transcript-content");
  const readingPosition = await transcriptContent.evaluate((element) => {
    element.scrollTop = 120;
    return element.scrollTop;
  });
  expect(readingPosition).toBeGreaterThan(0);
  await expect(dialog).toContainText("pnpm test (exit 0) · completed");
  await expect(dialog).toContainText("All live checks passed.");
  await expect(dialog.locator(".transcript-item")).toHaveCount(31);
  expect(await transcriptContent.evaluate((element) => element.scrollTop)).toBe(readingPosition);

  await dialog.getByRole("button", { name: "Close transcript" }).click();
  await page.getByRole("button", { name: "View transcript" }).click();
  await expect(page.getByRole("dialog", { name: "Attempt transcript" })).toContainText("All live checks passed.");
  await page.getByRole("dialog", { name: "Attempt transcript" }).getByRole("button", { name: "Close transcript" }).click();
  await page.goto("/");
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View transcript" }).click();
  await expect(page.getByRole("dialog", { name: "Attempt transcript" })).toContainText("All live checks passed.");
});

test("a live transcript follows appended items only while the reader is at the bottom", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const attempt = detail.task.activations[0]?.attempts[0];
    if (attempt !== undefined) {
      attempt.status = "running";
      attempt.completedAt = null;
      attempt.outcome = null;
    }
    await route.fulfill({ response, json: detail });
  });
  let reads = 0;
  await page.route("**/api/attempts/browser-attempt/transcript", async (route) => {
    reads += 1;
    const items = Array.from({ length: 40 }, (_, index) => ({
      id: `follow-message-${index}`,
      kind: "message",
      role: "agent",
      text: `Live transcript message ${index + 1}.`,
    }));
    if (reads > 1) {
      items.push({
        id: "new-bottom-message",
        kind: "message",
        role: "agent",
        text: "This newly appended message should stay visible.",
      });
    }
    await route.fulfill({
      status: 200,
      json: { available: true, threadId: "thread-browser-123", items },
    });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View transcript" }).click();
  const dialog = page.getByRole("dialog", { name: "Attempt transcript" });
  const transcriptContent = dialog.locator(".transcript-content");
  await expect(dialog).toContainText("Live transcript message 40.");
  await transcriptContent.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(dialog).toContainText("This newly appended message should stay visible.");
  await expect.poll(() => transcriptContent.evaluate((element) =>
    element.scrollHeight - element.clientHeight - element.scrollTop,
  )).toBeLessThanOrEqual(1);
});

test("task details expose lazy and provisioned task workspaces", async ({ page, context }) => {
  await page.goto("/tasks/T-0002");
  const unprovisioned = page.getByRole("region", { name: "Task workspace" });
  await expect(unprovisioned).toContainText("No task workspace exists yet");
  await expect(unprovisioned).toContainText("created before the first runnable activation");
  await expect(unprovisioned.getByRole("button", { name: "Copy path" })).toHaveCount(0);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tasks/T-0001");
  const workspace = page.getByRole("region", { name: "Task workspace" });
  const expectedPath = await page.evaluate(async () => {
    const response = await fetch("/api/tasks/T-0001");
    const detail = await response.json();
    return detail.inspection.workspace.path as string;
  });
  await expect(workspace).not.toContainText(expectedPath);
  await expect(workspace).toContainText("main");
  await expect(workspace).toContainText("0123456789abcdef0123456789abcdef01234567");

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
  const actionBounds = await workspace.locator(".workspace-actions").boundingBox();
  expect(workspaceBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  if (workspaceBounds !== null && actionBounds !== null) {
    expect(actionBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
    expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
      workspaceBounds.x + workspaceBounds.width,
    );
  }
});

test("task details create children and dependencies through contextual controls", async ({ page }) => {
  await page.goto("/tasks/T-0002");

  await expect(page.getByText("Dependency: T-0001 → T-0002")).toBeVisible();
  await expect(page.getByLabel("Blocking task ID")).not.toBeVisible();
  await expect(page.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await page.getByText("Manage relationships", { exact: true }).click();

  const dependencyForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add dependency" }) });
  await dependencyForm.getByLabel("Blocking task ID").fill("T-0003");
  await dependencyForm.getByRole("button", { name: "Add dependency" }).click();
  await expect(page.getByText("Blocked by T-0003")).toBeVisible();

  const childForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Create child task" }) });
  await childForm.getByLabel("Title").fill("Investigate a focused child outcome");
  await childForm.getByLabel("Description").fill("Keep the child isolated from dirty parent files.");
  await childForm.getByLabel("Column").selectOption("backlog");
  await childForm.getByLabel("Starting Git ref (optional)").fill("main");
  await childForm.getByRole("button", { name: "Create child" }).click();
  await expect(page.getByRole("status")).toContainText(/Created child T-\d{4}/);
  await expect(page.getByText(/Parent \/ child: T-0002/)).toBeVisible();
});

test("pre-attempt startup diagnostics remain discoverable after navigation", async ({ page }) => {
  await page.goto("/");
  const failedLink = page.getByRole("link", { name: /T-0003 Recover a workspace startup failure/ });
  const failedCard = failedLink.locator("..");
  await expect(failedCard).toContainText(/failed/i);
  await expect(failedCard).toContainText(/attention/i);
  await expect(failedCard).toContainText("Startup failed before attempt · repository-access");
  await expect(failedCard).toContainText(/Could not access project repository/);
  await failedLink.click();
  await expect(page.getByText("Startup failed before attempt")).toBeVisible();
  await expect(page.getByText(/Boundary: repository-access/)).toBeVisible();
  await expect(page.locator(".diagnostic").filter({ hasText: "Could not access project repository" }))
    .toBeVisible();
  const currentState = page.getByRole("region", { name: "Implementation" });
  await expect(currentState.getByText("Requested model").locator("..")).toContainText("Codex default");
  await expect(currentState.getByText("Requested reasoning").locator("..")).toContainText("Codex default");
  await page.getByRole("link", { name: "Back to board" }).click();
  await page.goto("/tasks/T-0003");
  await expect(page.locator(".diagnostic").filter({ hasText: "missing-project-repository" }))
    .toBeVisible();
});

test("failed activation recovery is explicit on the current attention reason", async ({ page }) => {
  await page.goto("/");
  const recovery = page.locator(".attention-groups > li").filter({
    hasText: "Recover a workspace startup failure",
  });
  await expect(recovery).toContainText(/Could not access project repository/);
  await expect(recovery.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(recovery.getByRole("button", { name: "Dismiss" })).toBeVisible();
  await recovery.getByRole("button", { name: "Retry" }).click();
  await expect(recovery).toHaveCount(0);
});

test("permission attention explains why automatic retry is unavailable", async ({ page }) => {
  await page.goto("/tasks/T-0001?attention=browser-permission-attention");
  const reason = page.locator(".attention-list li").filter({
    hasText: "Writing the protected release file requires user approval.",
  });
  await expect(reason).toContainText("Automatic retry is unavailable for permission blocks.");
  await expect(reason.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(reason.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("desktop notifications are opt-in, privacy-safe, suppressed on the active task, and navigate without resolving", async ({ page, request }) => {
  await page.addInitScript(() => {
    const notifications: Array<{
      title: string;
      options: NotificationOptions;
      onclick: (() => void) | null;
      close(): void;
    }> = [];
    class ControlledNotification {
      static permission: NotificationPermission = "default";
      static requestCount = 0;
      static async requestPermission(): Promise<NotificationPermission> {
        ControlledNotification.requestCount += 1;
        ControlledNotification.permission = "granted";
        return "granted";
      }
      readonly title: string;
      readonly options: NotificationOptions;
      onclick: (() => void) | null = null;
      constructor(title: string, options: NotificationOptions = {}) {
        this.title = title;
        this.options = options;
        notifications.push(this);
      }
      close(): void {}
    }
    Object.defineProperty(window, "Notification", { value: ControlledNotification, configurable: true });
    Object.assign(window, { __controlledNotifications: notifications, __ControlledNotification: ControlledNotification });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Desktop notifications off" })).toBeVisible();
  expect(await page.evaluate(() => Notification.permission)).toBe("default");
  await page.getByRole("button", { name: "Desktop notifications off" }).click();
  await expect(page.getByRole("button", { name: "Desktop notifications on" })).toBeVisible();
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => (window as typeof window & { __controlledNotifications: unknown[] }).__controlledNotifications.length)).toBe(0);

  await page.getByRole("link", { name: /T-0002 Drag this task/ }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0002$/);
  await page.getByRole("textbox", { name: "Comment" }).fill("@user please inspect this while I am open.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => (window as typeof window & { __controlledNotifications: unknown[] }).__controlledNotifications.length)).toBe(0);

  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(page).toHaveURL(/\/$/);
  await request.post("/api/tasks/T-0001/comments", {
    data: {
      body: "@user private comment text must not appear in the desktop notification.",
      idempotencyKey: "controlled-notification-comment",
    },
  });
  await expect.poll(() => page.evaluate(() => {
    const controlled = window as typeof window & { __controlledNotifications: unknown[] };
    return controlled.__controlledNotifications.length;
  })).toBe(1);
  const delivered = await page.evaluate(() => {
    const controlled = window as typeof window & {
      __controlledNotifications: Array<{ title: string; options: NotificationOptions }>;
      __ControlledNotification: { requestCount: number };
    };
    const notification = controlled.__controlledNotifications[0];
    return {
      title: notification?.title,
      body: notification?.options.body,
      tag: notification?.options.tag,
      requestCount: controlled.__ControlledNotification.requestCount,
    };
  });
  expect(delivered.requestCount).toBe(1);
  expect(delivered.title).toBe("Product delivery · T-0001");
  expect(delivered.body).toBe("Inspect all coordination evidence · user mention");
  expect(JSON.stringify(delivered)).not.toContain("private comment text");
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => (window as typeof window & { __controlledNotifications: unknown[] }).__controlledNotifications.length)).toBe(1);
  await page.evaluate(() => {
    const controlled = window as typeof window & {
      __controlledNotifications: Array<{ onclick: (() => void) | null }>;
    };
    controlled.__controlledNotifications[0]?.onclick?.();
  });
  await expect(page).toHaveURL(new RegExp(`/tasks/T-0001\\?attention=${delivered.tag}$`));
  await expect(page.locator(".attention-list .highlighted")).toContainText("user mention");
});

test("notification delivery failure is attempted once while durable attention remains", async ({ page, request }) => {
  await page.addInitScript(() => {
    class FailingNotification {
      static permission: NotificationPermission = "default";
      static attempts = 0;
      static async requestPermission(): Promise<NotificationPermission> {
        FailingNotification.permission = "granted";
        return "granted";
      }
      constructor() {
        FailingNotification.attempts += 1;
        throw new Error("Operating-system notification service is unavailable");
      }
    }
    Object.defineProperty(window, "Notification", { value: FailingNotification, configurable: true });
    Object.assign(window, { __FailingNotification: FailingNotification });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Desktop notifications off" }).click();
  await request.post("/api/tasks/T-0002/comments", {
    data: {
      body: "@user delivery failure must not lose this reason.",
      idempotencyKey: "failing-notification-comment",
    },
  });
  await expect.poll(() => page.evaluate(() => {
    const controlled = window as typeof window & { __FailingNotification: { attempts: number } };
    return controlled.__FailingNotification.attempts;
  })).toBe(1);
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => {
    const controlled = window as typeof window & { __FailingNotification: { attempts: number } };
    return controlled.__FailingNotification.attempts;
  })).toBe(1);
  const board = await request.get("/api/board");
  const body = await board.json() as {
    attention: Array<{ task: { id: string }; reasons: Array<{ type: string }> }>;
  };
  expect(body.attention.find((group) => group.task.id === "T-0002")?.reasons)
    .toContainEqual(expect.objectContaining({ type: "user-mention" }));
});

test("an unavailable Notification API leaves desktop delivery unavailable without affecting the board", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "Notification");
  });
  await page.goto("/");
  await expect(page.getByText("Desktop notifications unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: /Desktop notifications/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
});

test("needs attention groups by task, locates the card, opens details, and resolves independently", async ({ page }) => {
  await page.goto("/");
  const group = page.locator(".attention-groups > li").filter({ hasText: "T-0001" });
  await expect(group).toContainText("user mention");
  await group.getByRole("button", { name: "Locate card" }).click();
  await expect(page.locator('[data-task-id="T-0001"]')).toHaveClass(/highlighted/);
  await group.getByRole("button", { name: "Open details" }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  const attentionReasons = page.locator(".attention-list li");
  await expect(attentionReasons.first()).toBeVisible();
  const before = await attentionReasons.count();
  expect(before).toBeGreaterThan(0);
  await attentionReasons.first().getByRole("button", { name: "Mark addressed" }).click();
  await expect(attentionReasons).toHaveCount(before - 1);
});

test("pointer dragging moves through the same command and conflicts stay actionable", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Filter tasks").fill("Drag this task");
  const handle = page.getByRole("button", { name: "Drag T-0002" });
  const source = page.getByTestId("column-backlog");
  const destination = page.getByTestId("column-implementation");
  await handle.scrollIntoViewIfNeeded();
  const sourceBox = await handle.boundingBox();
  const targetBox = await destination.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (sourceBox === null || targetBox === null) return;
  const sourceGeometry = await source.boundingBox();
  const destinationGeometry = await destination.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await expect(destination).toHaveClass(/drop-target/);
  expect(await source.boundingBox()).toEqual(sourceGeometry);
  expect(await destination.boundingBox()).toEqual(destinationGeometry);
  await page.mouse.up();
  await expect(page.getByRole("status")).toContainText("Moved T-0002 to Implementation");
  await expect(destination.getByRole("link", { name: /T-0002 Drag this task/ })).toBeVisible();

  await page.goto("/tasks/T-0002");
  await request.post("/api/tasks/T-0002/move", {
    data: {
      destinationColumnId: "backlog",
      expectedRevision: 2,
      idempotencyKey: "concurrent-browser-move",
    },
  });
  await page.getByRole("button", { name: /Completion.*Next/ }).click();
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);

  await page.getByRole("button", { name: "Edit task" }).click();
  const latestRevision = Number(
    (await page.getByText(/Revision \d+/).textContent())?.replace("Revision ", ""),
  );
  await request.patch("/api/tasks/T-0002", {
    data: {
      title: "Concurrent authoritative title",
      description: "The browser must restore this authoritative edit after a conflict.",
      expectedRevision: latestRevision,
      idempotencyKey: "concurrent-browser-edit",
    },
  });
  await page.getByLabel("Task title").fill("Stale local title");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);
  await expect(page.getByRole("heading", { name: "Concurrent authoritative title" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Edit/ })).toHaveCount(0);
});
