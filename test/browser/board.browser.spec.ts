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
  await page.getByRole("combobox", { name: "Move task" }).selectOption("backlog");
  await expect(page.getByRole("combobox", { name: "Move task" })).toHaveValue("backlog");
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
  await expect(page.getByRole("region", { name: "Agent activity" })).toContainText("consulting-agent");
  await expect(page.getByRole("region", { name: "Agent activity" })).toContainText(/Running · 0m/);
  await expect(page.locator(".attempt-entry").filter({ hasText: /consulting-agent.*Attempt 1.*Running/ })).toBeVisible();
  await page.getByRole("button", { name: "View transcript" }).click();
  await expect(page.getByRole("dialog", { name: "Attempt transcript" })).toContainText(/consulting-agent · running · 0m/);
  await page.getByRole("button", { name: "Close transcript" }).click();
  const interruptClick = page.getByRole("button", { name: "Interrupt current attempt" }).click();
  await expect(page.getByRole("button", { name: "Interrupting…" })).toBeDisabled();
  await interruptClick;
  await expect(page.getByText("Task automation is suspended. The interrupted activation remains first in line.")).toBeVisible();
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

test("creates in workflow columns, opens tasks directly, and restores a narrow board context", async ({ page }) => {
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
  const archivedToggle = page.getByRole("button", { name: "Show archived tasks" });
  await archivedToggle.click();
  await expect(archivedToggle).toHaveAttribute("aria-pressed", "true");
  await filter.fill("Inspect");
  const inspectedLink = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await inspectedLink.scrollIntoViewIfNeeded();
  const savedScroll = await lane.evaluate((element) => element.scrollLeft);
  await inspectedLink.click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(filter).toHaveValue("Inspect");
  await expect(archivedToggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBe(savedScroll);

  await filter.fill("");
  await expect(page.getByRole("button", { name: "Create task in Completion" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create task in Backlog" }).click();
  await expect(page.getByLabel("Starting column")).toHaveValue("backlog");
  await expect(page.getByLabel("Starting column").locator('option[value="completion"]')).toHaveCount(0);
  await page.getByLabel("Starting column").selectOption("implementation");
  await page.getByLabel("Outcome-oriented title").fill("Start a deliberate implementation");
  await page.getByLabel("Complete description").fill("Keep deliberate workflow placement without allowing completed-at-creation work.");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Created T-\d{4} in Implementation/);
  await expect(page.getByRole("link", { name: /Start a deliberate implementation/ })).toBeVisible();

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
  await expect(completion.getByRole("button", { name: "Create task in Completion" })).toHaveCount(0);
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
    (await page.locator(".board-brand h1").textContent())?.replace("Scroll refresh ", ""),
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
  const topbar = page.locator(".detail-topbar");
  await expect(topbar.getByText(/Automation (running|paused)/)).toBeVisible();
  await expect(topbar.getByText(/Current runs · \d+/)).toBeVisible();
  const description = page.getByRole("region", { name: "Description" });
  await expect(description.getByRole("button", { name: "Edit task" })).toBeVisible();
  await expect(description.getByText("More actions", { exact: true })).toBeVisible();
  await expect(page.getByText("Understand the full task history")).toBeVisible();
  await expect(page.getByRole("region", { name: "Relationships" })).toContainText(/Blocked by T-0002/);
  await expect(page.getByText(/Needs attention: user mention/)).toBeVisible();
  await expect(page.getByText("Please preserve the authored context")).toBeVisible();
  await expect(page.getByText("Please also verify the migration behavior.")).toBeVisible();
  await expect(page.getByText("Task moved")).toBeVisible();
  await expect(page.getByText(/Immutable framework event/)).toHaveCount(0);
  await expect(page.getByText(/Implementation Agent.*Attempt 1/)).toBeVisible();
  await expect(page.getByText("2m 30s")).toBeVisible();
  await expect(page.getByText("Inspected the task and completed the handoff.")).toBeVisible();
  await expect(page.getByText(/Model: Codex default/)).toHaveCount(0);
  await expect(page.getByText("Activation queued")).toHaveCount(0);
  await expect(page.getByText("Attempt started")).toHaveCount(0);
  await expect(page.getByText("Attempt completed")).toHaveCount(0);

  const movement = page.getByRole("combobox", { name: "Move task" });
  await expect(movement).toHaveValue("implementation");
  await expect(movement.locator("option")).toHaveText(["Backlog", "Implementation", "Completion"]);
  const currentColumnSource = page.getByRole("link", { name: "View move to Implementation in timeline" });
  await expect(currentColumnSource).toHaveAttribute("href", /#timeline-source-/);
  await currentColumnSource.click();
  const movementSourceId = (await currentColumnSource.getAttribute("href"))!;
  await expect(page.locator(movementSourceId)).toBeFocused();

  const movementEntry = page.locator(".movement-entry").first();
  await expect(movementEntry.locator(".timeline-marker")).toHaveText("→");
  await expect(movementEntry.locator("article")).toHaveCSS("background-color", "rgb(243, 247, 250)");
  await expect(movementEntry.locator("article")).toHaveCSS("border-left-width", "1px");
  await expect(movementEntry.locator("article")).toHaveCSS("outline-style", "none");
  await expect(movementEntry.locator("article")).toHaveClass(/timeline-source-target/);
  const relativeTimestamp = page.getByRole("region", { name: "Task timeline" }).locator("time").first();
  await expect(relativeTimestamp).toHaveAttribute("datetime", /T/);
  await expect(relativeTimestamp).toHaveAttribute("title", /\d/);
  await expect(relativeTimestamp).not.toHaveText(/\b20\d{2}\b/);

  const attemptEntry = page.locator(".attempt-entry").filter({ hasText: "Attempt 1" });
  const userComment = page.locator(".comment-entry").filter({ hasText: "Please also verify the migration behavior." });
  await expect(userComment.locator("article")).toHaveCSS("background-color", "rgb(255, 249, 232)");
  const [userCommentBox, attemptBox] = await Promise.all([userComment.boundingBox(), attemptEntry.boundingBox()]);
  expect(userCommentBox).not.toBeNull();
  expect(attemptBox).not.toBeNull();
  expect(userCommentBox!.y).toBeLessThan(attemptBox!.y);
  await expect(attemptEntry).toContainText("Triggered by You moving the task to Implementation");
  await expect(attemptEntry).toContainText("Started");
  await expect(attemptEntry.locator(".attempt-agent-name")).toHaveText("Implementation Agent");
  await expect(attemptEntry.locator(".attempt-number")).toHaveText("Attempt 1");
  const nestedComment = attemptEntry.locator(".nested-comment");
  await expect(nestedComment.locator(".entry-meta strong")).toHaveText("Commented");
  await expect(nestedComment).toContainText("Requested Implementation Agent");
  await expect(nestedComment).toHaveCSS("background-color", "rgb(255, 249, 232)");
  await expect(nestedComment.locator(".comment-consequence")).toHaveCSS("font-weight", "600");
  const authoredProse = nestedComment.locator(".authored-prose");
  expect(await authoredProse.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await nestedComment.getByRole("button", { name: "Show more" }).click();
  await expect(nestedComment.getByRole("button", { name: "Show less" })).toBeVisible();
  expect(await authoredProse.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true);
  await expect(attemptEntry.getByText("Thread information")).toHaveCount(0);
  await expect(attemptEntry).not.toContainText("thread-browser-123");
  await expect(attemptEntry.getByRole("button", { name: "Copy thread ID" })).toHaveCount(0);
  await attemptEntry.getByRole("button", { name: "View transcript" }).click();
  const dialog = page.getByRole("dialog", { name: "Attempt transcript" });
  const copyThreadId = dialog.getByRole("button", { name: "Copy thread ID" });
  const closeTranscript = dialog.getByRole("button", { name: "Close transcript" });
  const [copyBox, closeBox] = await Promise.all([copyThreadId.boundingBox(), closeTranscript.boundingBox()]);
  expect(copyBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  expect(Math.abs((copyBox!.y + copyBox!.height / 2) - (closeBox!.y + closeBox!.height / 2))).toBeLessThanOrEqual(2);
  await expect(closeTranscript.locator("svg")).toBeVisible();
  await expect(dialog).not.toContainText("thread-browser-123");
  await expect(dialog).toContainText("I inspected the current task.");
  await expect(dialog).toContainText("pnpm test (exit 0)");
  await expect(dialog.getByText("output truncated")).toBeHidden();
  await dialog.getByText("View command output").click();
  await expect(dialog).toContainText("output truncated");
  await expect(copyThreadId).toBeVisible();
  const taskScrollPosition = await page.evaluate(() => {
    window.scrollTo(0, 240);
    return window.scrollY;
  });
  expect(taskScrollPosition).toBeGreaterThan(0);
  await dialog.hover();
  for (let index = 0; index < 4; index += 1) {
    await page.mouse.wheel(0, 1_000);
  }
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(taskScrollPosition);
  await page.locator(".transcript-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();

  await description.getByRole("button", { name: "Edit task" }).click();
  await page.getByLabel("Task title").fill("Inspect all coordination evidence");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("heading", { name: "Inspect all coordination evidence" })).toBeVisible();

  await movement.press("ArrowDown");
  await expect(page.getByText(/Moved T-0001 to Completion/)).toBeVisible();

  const commentBounds = await page.getByRole("region", { name: "Add comment" }).boundingBox();
  const timelineBounds = await page.getByRole("region", { name: "Task timeline" }).boundingBox();
  expect(commentBounds).not.toBeNull();
  expect(timelineBounds).not.toBeNull();
  expect(timelineBounds!.y - (commentBounds!.y + commentBounds!.height)).toBeGreaterThanOrEqual(8);
});

test("task timeline keeps the centered record stable when polling inserts newer history", async ({ page }) => {
  let addNewHistory = false;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    if (addNewHistory) {
      const occurredAt = new Date().toISOString();
      for (let index = 0; index < 4; index += 1) {
        detail.task.comments.push({
          id: `polling-comment-${index}`,
          body: `New polling history ${index}`,
          actor: { kind: "user", id: "local-user" },
          occurredAt,
        });
      }
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const attempt = page.locator(".attempt-entry").filter({ hasText: "Attempt 1" });
  await attempt.scrollIntoViewIfNeeded();
  await attempt.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const centerBefore = await attempt.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  });

  addNewHistory = true;
  await expect(page.getByText("New polling history 3")).toBeVisible();
  const centerAfter = await attempt.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  });
  expect(Math.abs(centerAfter - centerBefore)).toBeLessThanOrEqual(2);
});

test("task timeline keeps retries separate and links each retry to the preceding attempt", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const activation = detail.task.activations.find((candidate: { attempts: unknown[] }) => candidate.attempts.length > 0);
    const first = activation?.attempts[0];
    if (activation !== undefined && first !== undefined) {
      first.status = "failed";
      first.outcome = { status: "failed", summary: "The first attempt lost its runtime connection." };
      activation.attempts.push({
        ...first,
        id: "browser-retry-attempt",
        status: "completed",
        startedAt: new Date(Date.parse(first.completedAt) + 1_000).toISOString(),
        completedAt: new Date(Date.parse(first.completedAt) + 121_000).toISOString(),
        outcome: { status: "completed", summary: "The retry completed the handoff." },
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const retry = page.locator("#timeline-source-browser-retry-attempt").locator("..");
  const first = page.locator("#timeline-source-browser-attempt").locator("..");
  await expect(retry).toBeVisible();
  await expect(first).toBeVisible();
  expect((await retry.boundingBox())!.y).toBeLessThan((await first.boundingBox())!.y);
  const trigger = retry.getByRole("link", { name: "Attempt 1 failed" });
  await expect(trigger).toHaveAttribute("href", /timeline-source-browser-attempt/);
  await trigger.click();
  await expect(first.locator("article")).toBeFocused();
});

test("task details keep board navigation pinned while scrolling long history", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await expect(page.getByRole("heading", { name: "Task timeline" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const topbar = page.locator(".detail-topbar");
  await expect(page.getByRole("link", { name: "Back to board" })).toBeVisible();
  await expect.poll(() => topbar.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
});

test("task details prioritize agent activity and preserve the responsive reading order", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.automation = { state: "paused", attemptsMayStart: false };
    detail.collaborators = [
      { id: "implementer", name: "Implementation Agent", summary: "Builds verified changes." },
      { id: "reviewer", name: "Review Agent", summary: "Reviews completed changes." },
    ];
    detail.activeRun = null;
    detail.inspection.blocking = { blocked: true, blockerTaskIds: ["T-0002"] };
    detail.inspection.automationSuspended = true;
    detail.task.activations.push(
      {
        id: "queued-implementation-one",
        targetAgentId: "implementer",
        status: "queued",
        reason: { type: "agent-mention", sourceEventId: "queued-comment-one" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: "gpt-5.6",
        reasoningEffort: "high",
        stale: false,
      },
      {
        id: "queued-implementation-two",
        targetAgentId: "implementer",
        status: "queued",
        reason: { type: "column-entry", sourceEventId: "queued-move-two" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      },
      {
        id: "queued-review",
        targetAgentId: "reviewer",
        status: "queued",
        reason: { type: "agent-mention", sourceEventId: "queued-comment-three" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      },
    );
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const description = page.getByRole("region", { name: "Description" });
  await expect(description).toBeVisible();
  const activity = page.getByRole("region", { name: "Agent activity" });
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  const movement = page.getByRole("region", { name: "Move task" });
  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(activity.getByText("Current work", { exact: true })).toHaveCount(0);
  await expect(workspace.getByText("Development files", { exact: true })).toHaveCount(0);
  await expect(movement.getByText("Workflow", { exact: true })).toHaveCount(0);
  await expect(relationships.getByText("Coordination", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Add comment" }).getByText("Authored communication", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Task timeline" }).getByText("Complete history", { exact: true })).toHaveCount(0);
  await expect(activity.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(activity).toContainText("Process automation is paused");
  await activity.getByText(/more reasons?/).click();
  await expect(activity).toContainText("Blocked by T-0002");
  await expect(activity).toContainText("Task automation is suspended");
  await expect(activity.getByText("Implementation Agent", { exact: true })).toHaveCount(2);
  await expect(activity.getByText("Review Agent", { exact: true })).toHaveCount(1);
  await expect(activity.getByText("Activated by column entry", { exact: true })).toBeVisible();
  await expect(activity).not.toContainText("Requested model");
  await expect(activity).not.toContainText("Requested reasoning");
  await expect(activity).not.toContainText("Failed activations");

  const descriptionBounds = await description.boundingBox();
  const activityBounds = await activity.boundingBox();
  expect(descriptionBounds).not.toBeNull();
  expect(activityBounds).not.toBeNull();
  expect(activityBounds!.y - (descriptionBounds!.y + descriptionBounds!.height)).toBeLessThanOrEqual(24);

  const workspaceBounds = await workspace.boundingBox();
  expect(workspaceBounds).not.toBeNull();
  expect(Math.abs(workspaceBounds!.y - descriptionBounds!.y)).toBeLessThanOrEqual(2);
  const overviewBounds = await page.locator('[data-task-section="overview"]').boundingBox();
  expect(overviewBounds).not.toBeNull();
  expect(overviewBounds!.width).toBeGreaterThan(descriptionBounds!.width * 1.25);
  await expect(page.getByText(/Revision \d+/)).toHaveCount(0);

  const primaryGaps = await page.locator(".detail-primary-column > [data-task-section]").evaluateAll((elements) =>
    elements.slice(1).map((element, index) => {
      const previous = elements[index]!.getBoundingClientRect();
      const current = element.getBoundingClientRect();
      return current.top - previous.bottom;
    }),
  );
  const secondaryGaps = await page.locator(".detail-column > [data-task-section]").evaluateAll((elements) =>
    elements.slice(1).map((element, index) => {
      const previous = elements[index]!.getBoundingClientRect();
      const current = element.getBoundingClientRect();
      return current.top - previous.bottom;
    }),
  );
  expect(new Set(primaryGaps.map(Math.round)).size).toBe(1);
  expect(new Set(secondaryGaps.map(Math.round)).size).toBe(1);

  await page.setViewportSize({ width: 600, height: 900 });
  const readingOrder = await page.locator("[data-task-section]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-task-section")),
  );
  expect(readingOrder).toEqual([
    "overview",
    "description",
    "activity",
    "comment",
    "timeline",
    "workspace",
    "move",
    "relationships",
  ]);
});

test("running agent activity uses the configured agent name and interruption control", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.automation = { state: "running", attemptsMayStart: true };
    detail.collaborators = [
      { id: "implementer", name: "Implementation Agent", summary: "Builds verified changes." },
    ];
    detail.inspection.blocking = { blocked: false, blockerTaskIds: [] };
    detail.inspection.automationSuspended = false;
    detail.activeRun = {
      attemptId: "live-attempt",
      taskId: "T-0001",
      taskTitle: detail.task.title,
      boardId: detail.board.id,
      boardName: detail.board.name,
      columnId: detail.task.columnId,
      columnName: "Implementation",
      agentId: "implementer",
      status: "running",
      startedAt: new Date(Date.now() - 65_000).toISOString(),
    };
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const activity = page.getByRole("region", { name: "Agent activity" });
  await expect(activity).toContainText("Implementation Agent");
  await expect(activity).toContainText(/1m \d+s/);
  await expect(activity.getByRole("button", { name: "Interrupt current attempt" })).toBeVisible();
});

test("live task refresh moves a singly blocked activity to idle without disturbing the reader", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    reads += 1;
    detail.automation = reads < 3
      ? { state: "running", attemptsMayStart: true }
      : { state: "paused", attemptsMayStart: false };
    detail.activeRun = null;
    detail.inspection.automationSuspended = false;
    detail.inspection.unresolvedAttention = [];
    detail.inspection.run = reads < 3
      ? { status: "queued", activeAgentId: null, queuedActivationCount: 1, failedActivationCount: 0 }
      : { status: "idle", activeAgentId: null, queuedActivationCount: 0, failedActivationCount: 0 };
    detail.task.activations = detail.task.activations.filter(
      (activation: { status: string }) => activation.status !== "queued" && activation.status !== "failed",
    );
    if (reads < 3) {
      detail.task.activations.push({
        id: "single-blocked-queue",
        targetAgentId: "implementer",
        status: "queued",
        reason: { type: "column-entry", sourceEventId: "single-blocked-move" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      });
    }
    detail.inspection.blocking = reads < 3
      ? { blocked: true, blockerTaskIds: ["T-0002"] }
      : { blocked: false, blockerTaskIds: [] };
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const activity = page.getByRole("region", { name: "Agent activity" });
  await expect(activity.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(activity).toContainText("Blocked by T-0002");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await expect(draft).toHaveAttribute("rows", "2");
  await draft.fill("Keep the reader's in-progress comment.");
  await draft.focus();
  const readingPosition = await page.evaluate(() => {
    window.scrollTo(0, 320);
    return window.scrollY;
  });
  await expect(activity).toContainText("No agent work is running or queued.");
  const idleBounds = await activity.boundingBox();
  expect(idleBounds).not.toBeNull();
  expect(idleBounds!.height).toBeLessThanOrEqual(90);
  await expect(draft).toHaveValue("Keep the reader's in-progress comment.");
  await expect(draft).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(readingPosition);
});

test("waiting reason disclosure survives authoritative reason-count changes", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    reads += 1;
    detail.activeRun = null;
    detail.inspection.blocking = { blocked: true, blockerTaskIds: ["T-0002"] };
    detail.inspection.automationSuspended = false;
    detail.automation = reads === 3
      ? { state: "running", attemptsMayStart: true }
      : { state: "paused", attemptsMayStart: false };
    detail.task.activations = detail.task.activations.filter(
      (activation: { status: string }) => activation.status !== "queued" && activation.status !== "failed",
    );
    detail.task.activations.push({
      id: "disclosure-queue",
      targetAgentId: "implementer",
      status: "queued",
      reason: { type: "column-entry", sourceEventId: "disclosure-move" },
      attempts: [],
      startupFailure: null,
      recovery: null,
      model: null,
      reasoningEffort: null,
      stale: false,
    });
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const activity = page.getByRole("region", { name: "Agent activity" });
  await activity.getByText("1 more reason").click();
  await expect(activity.getByText("Process automation is paused")).toBeVisible();
  await expect(activity.getByText("1 more reason")).toHaveCount(0);
  await expect(activity.getByText("1 more reason")).toBeVisible();
  await expect(activity.getByText("Process automation is paused")).toBeVisible();
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
        body: "An agent added this while the task page remained open. @implementer",
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
          targetAgentId: "implementer",
        },
      });
      detail.task.activations.push({
        id: "external-live-activation",
        targetAgentId: "implementer",
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
  const liveComment = page.locator(".comment-entry").filter({ hasText: "An agent added this while the task page remained open." });
  await expect(liveComment).toBeVisible();
  await expect(liveComment.locator(".canonical-mention")).toHaveText("@implementer");
  await expect(liveComment).toContainText("Requested Implementation Agent");
  await page.waitForTimeout(750);
  await expect(liveComment).toBeVisible();
  await expect(liveComment).toContainText("Requested Implementation Agent");
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
  const unprovisioned = page.getByRole("region", { name: "Workspace", exact: true });
  await expect(unprovisioned).toContainText("No task workspace exists yet");
  await expect(unprovisioned).toContainText("created before the first runnable activation");
  await expect(unprovisioned.getByRole("button", { name: "Copy path" })).toHaveCount(0);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tasks/T-0001");
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  const expectedPath = await page.evaluate(async () => {
    const response = await fetch("/api/tasks/T-0001");
    const detail = await response.json();
    return detail.inspection.workspace.path as string;
  });
  await expect(workspace).not.toContainText(expectedPath);
  await expect(workspace).not.toContainText("Starting ref");
  await expect(workspace).toContainText("0123456");
  await expect(workspace).not.toContainText("0123456789abcdef0123456789abcdef01234567");

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
  await expect(summary).toContainText("Task start");
  await expect(summary).toContainText("0123456");
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
    await route.fulfill({ status: 200, json: cleanGitState() });
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
    await route.fulfill({ status: 200, json: cleanGitState() });
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

function cleanGitState(): object {
  return {
    available: true,
    state: {
      head: { kind: "branch", name: "main", shortHash: "0123456" },
      history: { kind: "progress", commitsSinceTaskStart: 0 },
      changes: {
        additions: 0,
        deletions: 0,
        stagedFiles: 0,
        unstagedFiles: 0,
        untrackedFiles: 0,
      },
    },
  };
}

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
  await expect(automation.getByText(/Desktop notifications/)).toBeVisible();
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
  await expect(page.getByRole("button", { name: "View transcript" })).toHaveCount(0);
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

test("task details create children and dependencies through contextual controls", async ({ page }) => {
  await page.goto("/tasks/T-0002");

  await expect(page.getByText("Dependency: T-0001 → T-0002")).toBeVisible();
  await expect(page.getByLabel("Blocking task ID")).not.toBeVisible();
  await expect(page.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await page.getByText("Manage relationships", { exact: true }).click();

  const dependencyForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add dependency" }) });
  await dependencyForm.getByLabel("Blocking task ID").fill("T-0003");
  await dependencyForm.getByRole("button", { name: "Add dependency" }).click();
  await expect(page.getByRole("region", { name: "Relationships" })).toContainText("Blocked by T-0003");

  await page.getByRole("button", { name: "Create child task" }).click();
  const childDialog = page.getByRole("dialog", { name: "Create child task" });
  await expect(childDialog).toContainText("Parent T-0002");
  await expect(childDialog.getByLabel("Starting column")).toHaveValue("backlog");
  await expect(childDialog.getByLabel("Starting column").locator('option[value="completion"]')).toHaveCount(0);
  await childDialog.getByLabel("Outcome-oriented title").fill("Investigate a focused child outcome");
  await childDialog.getByLabel("Complete description").fill("Keep the child isolated from dirty parent files.");
  await expect(childDialog.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await childDialog.getByText("Advanced", { exact: true }).click();
  await childDialog.getByLabel("Starting Git ref (optional)").fill("main");
  await childDialog.getByRole("button", { name: "Create child task", exact: true }).click();
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
  const activity = page.getByRole("region", { name: "Agent activity" });
  await expect(activity).toContainText("Startup failed at repository-access");
  await expect(activity).not.toContainText("Requested model");
  await expect(activity).not.toContainText("Requested reasoning");
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
  const commentRegion = page.getByRole("region", { name: "Add comment" });
  await expect(commentRegion.getByText("Mention a collaborator", { exact: false })).toHaveCount(0);
  await expect(commentRegion.getByText("Comment", { exact: true })).toHaveCount(0);
  await commentRegion.getByRole("button", { name: "Post" }).click();
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
  await page.getByRole("combobox", { name: "Move task" }).selectOption("completion");
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);

  await page.getByRole("button", { name: "Edit task" }).click();
  const latestDetail = await (await request.get("/api/tasks/T-0002")).json() as {
    task: { revision: number };
  };
  const latestRevision = latestDetail.task.revision;
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
