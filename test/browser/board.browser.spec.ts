import { expect, test } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { writeProcessEvolutionDefinition } from "../support/process-evolution-fixture.ts";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem(
    "coordination.desktop-notifications.consent",
    "declined",
  ));
});

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
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeDisabled();
  await expect(impact.getByRole("heading", { name: "Review startup impact" })).toBeVisible();
  await expect(impact).toContainText("T-0002 · Drag this task · former Product delivery / Retired column");
  await expect(impact).toContainText("retired-agent · failed · target agent removed · task unmapped");
  await impact.locator("li").filter({ hasText: "retired-agent" })
    .getByRole("button", { name: "Dismiss stale activation" }).click();
  await expect(impact).not.toContainText("retired-agent");
  await impact.getByRole("button", { name: "Resume with current process" }).click();
  await expect.poll(() => resumedWithCurrentProcess).toBe(true);
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(impact).toBeVisible();
  await expect(impact.getByRole("heading", { name: /Unmapped tasks.*1/ })).toBeVisible();
  await expect(impact.getByRole("heading", { name: /Stale activations.*0/ })).toBeVisible();
});

test("accepting the final stale activation removes startup impact after refresh", async ({ page }) => {
  let accepted = false;
  await page.route("**/api/automation/resume-with-current-process", async (route) => {
    accepted = true;
    await route.fulfill({
      status: 200,
      json: { accepted: true, automation: { state: "running", attemptsMayStart: true } },
    });
  });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.startup.processImpact = accepted ? undefined : {
      previousVersion: "previous-version",
      currentVersion: "current-version",
      unmappedTasks: [],
      staleActivations: [{
        activationId: "compatible-activation",
        taskId: "T-0001",
        targetAgentId: "consulting-agent",
        priorStatus: "queued",
        targetAvailable: true,
        taskMapped: true,
      }],
    };
    if (accepted) body.automation = { state: "running", attemptsMayStart: true };
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  const impact = page.locator(".process-impact");
  await expect(impact).toBeVisible();
  await impact.getByRole("button", { name: "Resume with current process" }).click();
  await expect(impact).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".process-impact")).toHaveCount(0);
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
  await expect(impact).toContainText(`${created.task.id} · Recover changed process state`);
  await impact.getByRole("button", { name: "Dismiss stale activation" }).click();
  await impact.getByRole("button", { name: new RegExp(created.task.id) }).click();
  await page.getByRole("combobox", { name: "Move task" }).selectOption("backlog");
  await expect(page.getByRole("combobox", { name: "Move task" })).toHaveValue("backlog");
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(page.locator(".process-impact")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".process-impact")).toHaveCount(0);
  await removedServer.close();
  removed.close();

  const restartedRemoved = await CoordinationApplication.start({ processDefinitionPath: definitionPath, databasePath });
  const restartedRemovedServer = await startWebServer(restartedRemoved, { host: "127.0.0.1", port: 0 });
  await page.goto(restartedRemovedServer.baseUrl);
  await expect(page.locator(".process-impact")).toHaveCount(0);
  await restartedRemovedServer.close();
  restartedRemoved.close();

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
    body.inspection.currentActivation = {
      id: "live-activation",
      targetAgentId: "consulting-agent",
      state: interruptionState === "interrupted" ? "interrupted" : "running",
      model: null,
      reasoningEffort: null,
    };
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
      conversationId: "live-conversation",
      targetAgentId: "consulting-agent",
      status: interruptionState === "interrupted" ? "queued" : "running",
      reason: { type: "agent-mention", sourceEventId: "comment-live" },
      attempts: [{
        id: "live-attempt",
        status: interruptionState === "interrupted" ? "interrupted" : "running",
        workspacePath: "C:/task-workspace",
        startedAt,
        completedAt: interruptionState === "interrupted" ? new Date().toISOString() : null,
        outcome: interruptionState === "interrupted"
          ? { status: "user-interrupted", summary: "The user interrupted this attempt." }
          : null,
        threadId: "thread-live",
        model: null,
        reasoningEffort: null,
      }],
      startupFailure: null,
      recovery: null,
      model: null,
      reasoningEffort: null,
      dismissal: { mayStartNext: true },
    }];
    await route.fulfill({ response, json: body });
  });

  await page.route("**/api/tasks/T-0002/conversations/*", async (route) => {
    const result = liveConversation([{ kind: "message", role: "agent", text: "The live run is inspectable." }]);
    const conversation = result.conversation as Record<string, unknown>;
    conversation.taskId = "T-0002";
    conversation.owningAgent = {
      id: "consulting-agent",
      name: "consulting-agent",
      historicalName: "consulting-agent",
      present: true,
    };
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0002");
  await expect(page.getByRole("region", { name: "Agent activity" })).toContainText("consulting-agent");
  await expect(page.getByRole("region", { name: "Agent activity" })).toContainText(/Running · 0m/);
  await expect(page.locator(".attempt-entry").filter({ hasText: /consulting-agent.*Running.*Attempt 1/ })).toBeVisible();
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" }).getByRole("heading", { name: "consulting-agent" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText(/Run 1 · running/);
  await page.getByRole("button", { name: "Close conversation" }).click();
  const interruptClick = page.getByRole("button", { name: "Interrupt current attempt" }).click();
  await expect(page.getByRole("button", { name: "Interrupting…" })).toBeDisabled();
  await interruptClick;
  const interruptedCurrent = page.locator(".activity-current.interrupted");
  await expect(interruptedCurrent).toContainText("consulting-agent");
  await expect(interruptedCurrent).toContainText("Interrupted · awaiting your decision");
  await expect(page.getByText("Task automation is suspended after this interruption.", { exact: false })).toBeVisible();
  await expect(page.locator(".activation-queue")).toHaveCount(0);
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

test("task details confirm individual queued and interrupted activation dismissal", async ({ page }) => {
  let activations = [
    {
      id: "interrupted-activation",
      targetAgentId: "consulting-agent",
      status: "queued",
      reason: { type: "agent-mention", sourceEventId: "comment-interrupted" },
      attempts: [{
        id: "interrupted-attempt",
        status: "interrupted",
        workspacePath: "C:/task-workspace",
        startedAt: "2026-08-08T12:00:00.000Z",
        completedAt: "2026-08-08T12:01:00.000Z",
        outcome: { status: "user-interrupted", summary: "The user interrupted this attempt." },
        threadId: "thread-interrupted",
        model: null,
        reasoningEffort: null,
      }],
      startupFailure: null,
      recovery: null,
      stale: false,
      model: null,
      reasoningEffort: null,
      dismissal: { mayStartNext: true },
    },
    {
      id: "queued-activation",
      targetAgentId: "implementing-agent",
      status: "queued",
      reason: { type: "column-entry", sourceEventId: "activity-queued" },
      attempts: [],
      startupFailure: null,
      recovery: null,
      stale: false,
      model: null,
      reasoningEffort: null,
      dismissal: { mayStartNext: false },
    },
  ];
  await page.route("**/api/activations/*/dismiss", async (route) => {
    const activationId = route.request().url().split("/").at(-2)!;
    if (activationId === "queued-activation") {
      activations = activations.map((activation) => activation.id === activationId
        ? { ...activation, status: "running" }
        : activation);
      await route.fulfill({ status: 409, json: { accepted: false, reason: "not-dismissible" } });
      return;
    }
    activations = activations.map((activation) => activation.id === activationId
      ? { ...activation, status: "dismissed" }
      : activation);
    await route.fulfill({ status: 200, json: { accepted: true, activationId } });
  });
  await page.route("**/api/tasks/T-0002", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.task.activations = activations;
    body.inspection.automationSuspended = activations[0]?.status === "queued";
    body.inspection.currentActivation = activations[0]?.status === "queued"
      ? {
          id: "interrupted-activation",
          targetAgentId: "consulting-agent",
          state: "interrupted",
          model: null,
          reasoningEffort: null,
        }
      : activations[1]?.status === "queued"
        ? {
            id: "queued-activation",
            targetAgentId: "implementing-agent",
            state: "queued",
            model: null,
            reasoningEffort: null,
          }
        : null;
    body.inspection.run = {
      status: activations.some(({ status }) => status === "queued") ? "queued" : "idle",
      activeAgentId: null,
      queuedActivationCount: activations.filter(({ status }) => status === "queued").length,
      failedActivationCount: 0,
    };
    body.activeRun = null;
    body.automation = { state: "running", attemptsMayStart: true };
    await route.fulfill({ response, json: body });
  });

  await page.goto("/tasks/T-0002");
  const current = page.locator(".activity-current.interrupted");
  const queue = page.locator(".activation-queue");
  await expect(current).toContainText("consulting-agent");
  await expect(current).toContainText("Interrupted · awaiting your decision");
  await expect(queue).not.toContainText("consulting-agent");
  await expect(queue.getByRole("button", { name: "Dismiss activation for implementing-agent" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss activation", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dismiss activation?" });
  await expect(dialog).toContainText("consulting-agent");
  await expect(dialog).toContainText("mentioned in a comment");
  await expect(dialog).toContainText("The next queued activation may start immediately.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss activation", exact: true }).click();
  await dialog.getByRole("button", { name: "Dismiss activation" }).click();
  await expect(current).toHaveCount(0);
  await expect(queue.getByRole("button", { name: "Dismiss activation for implementing-agent" })).toBeVisible();
  await queue.getByRole("button", { name: "Dismiss activation for implementing-agent" }).click();
  await dialog.getByRole("button", { name: "Dismiss activation" }).click();
  await expect(page.getByRole("alert")).toContainText("already started or changed state");
  await expect(queue.getByRole("button", { name: "Dismiss activation for implementing-agent" })).toHaveCount(0);
});

test("task details dismiss an untouched activation through the assembled application", async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-browser-dismiss-activation-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement the task.\n");
  await writeFile(definitionPath, `schemaVersion: 1
name: Dismissal proof
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep activation decisions explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: implementation
    summary: Implements tasks.
    instructions: implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver work.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`);
  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Dismiss before dispatch",
    description: "Prove the complete browser dismissal path while startup remains paused.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "browser-create-dismissible-activation",
  });
  expect(created.accepted).toBe(true);
  if (!created.accepted) return;
  const server = await startWebServer(application, { host: "127.0.0.1", port: 0 });
  try {
    await page.goto(`${server.baseUrl}/tasks/${created.task.id}`);
    await page.getByRole("button", { name: "Dismiss activation for Implementation Agent" }).click();
    await page.getByRole("dialog", { name: "Dismiss activation?" })
      .getByRole("button", { name: "Dismiss activation" }).click();
    await expect(page.getByText("No agent work is running or queued.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Task timeline" }))
      .toContainText("Activation dismissed");
  } finally {
    await server.close();
    application.close();
  }
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
  await expect(topbar.getByRole("button", { name: /Pause|Resume/ })).toBeVisible();
  await expect(topbar.getByText(/Current runs · \d+/)).toBeVisible();
  const description = page.getByRole("region", { name: "Description" });
  await expect(description.getByRole("button", { name: "Edit task" })).toBeVisible();
  await expect(description.getByText("More actions", { exact: true })).toBeVisible();
  await expect(page.getByText("Understand the full task history")).toBeVisible();
  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(relationships.getByRole("heading", { name: "Depends on" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Drag this task" })).toBeVisible();
  await expect(relationships).toContainText("Blocking");
  const attention = page.getByRole("region", { name: "Needs attention" });
  const agentActivity = page.getByRole("region", { name: "Agent activity" });
  await expect(attention.getByText("user mention", { exact: true })).toBeVisible();
  await expect(agentActivity).not.toContainText("user mention");
  await expect(page.locator('.detail-primary-column > [data-task-section="attention"] + [data-task-section="activity"]'))
    .toHaveCount(1);
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
  const attemptMetadata = attemptEntry.locator(".attempt-metadata");
  const transcriptButton = attemptEntry.getByRole("button", { name: "View conversation" });
  const [attemptMetadataBox, transcriptButtonBox] = await Promise.all([
    attemptMetadata.boundingBox(),
    transcriptButton.boundingBox(),
  ]);
  expect(attemptMetadataBox).not.toBeNull();
  expect(transcriptButtonBox).not.toBeNull();
  expect(Math.abs(
    (attemptMetadataBox!.y + attemptMetadataBox!.height / 2) -
    (transcriptButtonBox!.y + transcriptButtonBox!.height / 2),
  )).toBeLessThanOrEqual(2);
  expect(transcriptButtonBox!.x).toBeGreaterThan(attemptMetadataBox!.x + attemptMetadataBox!.width);
  const nestedComment = attemptEntry.locator(".nested-comment");
  await expect(nestedComment.locator(".entry-meta strong")).toHaveText("Commented");
  await expect(nestedComment).toContainText("Requested Implementation Agent");
  await expect(nestedComment).toHaveCSS("background-color", "rgb(255, 249, 232)");
  await expect(nestedComment.locator(".comment-consequence")).toHaveCSS("font-weight", "600");
  const authoredProse = nestedComment.locator(".authored-prose");
  expect(await authoredProse.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await nestedComment.getByRole("button", { name: /Show \d+ more lines?/ }).click();
  await expect(nestedComment.getByRole("button", { name: "Show less" })).toBeVisible();
  expect(await authoredProse.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true);
  await expect(attemptEntry.getByText("Thread information")).toHaveCount(0);
  await expect(attemptEntry).not.toContainText("thread-browser-123");
  await expect(attemptEntry.getByRole("button", { name: "Copy thread ID" })).toHaveCount(0);
  await expect(page.getByText("Token usage", { exact: true })).toHaveCount(0);
  await attemptEntry.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog.locator(".conversation-run.selected-run")).toContainText("Run 1 · completed");
  const copyThreadId = dialog.getByRole("button", { name: "Copy thread ID" });
  const closeTranscript = dialog.getByRole("button", { name: "Close conversation" });
  const tokenUsage = dialog.getByRole("region", { name: "Token usage" });
  const [usageBox, copyBox, closeBox] = await Promise.all([
    tokenUsage.boundingBox(),
    copyThreadId.boundingBox(),
    closeTranscript.boundingBox(),
  ]);
  expect(usageBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  expect(Math.abs((copyBox!.y + copyBox!.height / 2) - (closeBox!.y + closeBox!.height / 2))).toBeLessThanOrEqual(4);
  await expect(closeTranscript.locator("svg")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Implementation Agent", exact: true })).toBeVisible();
  await expect(dialog.locator(".modal-heading .conversation-origin-summary")).toHaveText("Origin · Column entry");
  await expect(dialog.locator(".transcript-content .conversation-origin-summary")).toHaveCount(0);
  await expect(dialog).toContainText("Run 1 · completed");
  await expect(dialog.locator(".conversation-run")).toContainText("Implementation Agent");
  await expect(dialog).not.toContainText("Attempt 1 · completed");
  await expect(dialog.locator(".conversation-run-metrics")).toContainText(/Runtime\s+2m 30s/);
  await expect(dialog).not.toContainText("thread-browser-123");
  await expect(dialog).toContainText("I inspected the current task.");
  await expect(tokenUsage).toHaveText(/Input 600\s*·\s*Output 600/);
  await expect(tokenUsage).not.toContainText(/cached|reasoning|total|used|%/i);
  await expect(tokenUsage).not.toContainText(/cost|currency|\$/i);
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

test("wide transcript content wraps without overflowing the dialog or page", async ({ page }) => {
  const unbroken = "C:/workspace/" + "deeply-nested-segment/".repeat(18) + "artifact.json";
  const prose = "Transcript prose remains readable within the available width even when it contains " +
    `an unbroken value such as ${unbroken}.`;
  const structuredOutput = JSON.stringify({ path: unbroken, status: "completed" }, null, 2);
  const preformattedOutput = `COMMAND\tRESULT\n${unbroken}\tcompleted`;

  await page.setViewportSize({ width: 360, height: 720 });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.conversation.runs[0].transcript.items = [
      { kind: "message", role: "agent", text: prose },
      {
        kind: "tool",
        name: "command_execution",
        status: "completed",
        summary: structuredOutput,
        output: preformattedOutput,
      },
      { kind: "diagnostic", text: unbroken },
    ];
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  const pageScrollWidthBeforeDialog = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog).toContainText(unbroken);

  const containment = await dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".transcript-content");
    const records = [...element.querySelectorAll<HTMLElement>(".transcript-item")];
    return {
      viewportWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      dialogRight: element.getBoundingClientRect().right,
      dialogOverflow: element.scrollWidth > element.clientWidth,
      contentOverflow: content === null ? true : content.scrollWidth > content.clientWidth,
      recordOverflow: records.some((record) => record.scrollWidth > record.clientWidth),
    };
  });
  expect(containment.pageScrollWidth).toBeLessThanOrEqual(pageScrollWidthBeforeDialog);
  expect(containment.dialogRight).toBeLessThanOrEqual(containment.viewportWidth);
  expect(containment.dialogOverflow).toBe(false);
  expect(containment.contentOverflow).toBe(false);
  expect(containment.recordOverflow).toBe(false);

  const toolOutput = dialog.locator(".tool-output");
  await toolOutput.getByText("View command output").click();
  const pre = toolOutput.locator("pre");
  await expect(pre).toHaveText(preformattedOutput);
  expect(await pre.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await toolOutput.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
  expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
});

test("collapsed timeline prose reports hidden rendered lines at desktop and narrow widths", async ({ page }) => {
  let authoredBody = "First line.\nSecond line.\nThird line.\nFourth line.\nFifth line.";
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const authoredComment = detail.task.comments.find((comment: { body: string }) =>
      comment.body.startsWith("Please preserve the authored context"));
    if (authoredComment !== undefined) {
      authoredComment.body = authoredBody;
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const authoredComment = page.locator(".comment-entry, .nested-comment").filter({ hasText: "First line." });
  const authoredProseId = await authoredComment.locator(".authored-prose").getAttribute("id");
  expect(authoredProseId).not.toBeNull();
  const authoredText = page.locator(`[id="${authoredProseId}"]`).locator("..");
  const disclosure = authoredText.getByRole("button", { name: "Show 1 more line" });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.press("Enter");
  await expect(authoredText.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");

  authoredBody = Array.from({ length: 10 }, (_, index) =>
    `Responsive wrapping sentence ${index + 1} stays measurable when timeline content refreshes.`).join(" ");
  await expect(authoredText).toContainText("Responsive wrapping sentence 10");
  await expect(authoredText.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  await authoredText.getByRole("button", { name: "Show less" }).click();
  const desktopDisclosure = authoredText.getByRole("button", { name: /Show \d+ more lines?/ });
  const desktopHiddenLines = Number((await desktopDisclosure.textContent())?.match(/\d+/)?.[0]);
  expect(desktopHiddenLines).toBeGreaterThan(1);

  await desktopDisclosure.click();
  await page.setViewportSize({ width: 420, height: 900 });
  await expect(authoredText.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  await authoredText.getByRole("button", { name: "Show less" }).click();
  await expect(authoredText.getByRole("button", { name: /Show \d+ more lines?/ })).toBeVisible();
  const narrowHiddenLines = Number((await authoredText.locator(".text-disclosure").textContent())?.match(/\d+/)?.[0]);
  expect(narrowHiddenLines).toBeGreaterThan(desktopHiddenLines);

  authoredBody = "Short update.";
  await expect(authoredText).toContainText("Short update.");
  await expect(authoredText.locator(".text-disclosure")).toHaveCount(0);
});

test("attempt outcomes show canonical-looking participant text without executable mention styling", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const outcome = detail.task.activations[0]?.attempts[0]?.outcome;
    if (outcome !== undefined && outcome !== null) {
      outcome.summary = "No further response from @implementer is required.";
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const outcome = page.getByRole("region", { name: "Outcome" });
  await expect(outcome).toContainText("No further response from @implementer is required.");
  await expect(outcome.locator(".canonical-mention")).toHaveCount(0);
});

test("a conversation without reported usage does not present zero as measured usage", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    delete result.conversation.runs[0].transcript.usage;
    await route.fulfill({ response, json: result });
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });

  await expect(dialog).toContainText("I inspected the current task.");
  await expect(dialog.getByRole("region", { name: "Token usage" })).toHaveCount(0);
  await expect(dialog).not.toContainText("0 total tokens");
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

test("attempt comments and movements form full-width color bands without separators", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const activation = detail.task.activations.find((candidate: { attempts: unknown[] }) => candidate.attempts.length > 0);
    const attempt = activation?.attempts[0];
    if (attempt !== undefined) {
      detail.task.activity.push({
        id: "nested-browser-movement",
        type: "task.moved",
        actor: { kind: "agent", id: "implementer" },
        occurredAt: new Date(Date.parse(attempt.startedAt) + 90_000).toISOString(),
        details: {
          fromColumnId: "implementation",
          toColumnId: "completion",
          attemptId: attempt.id,
        },
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const attempt = page.locator(".attempt-entry").filter({ hasText: "Attempt 1" });
  const article = attempt.locator("article");
  const history = attempt.locator(".attempt-history");
  const movement = attempt.locator(".nested-movement");
  const comment = attempt.locator(".nested-comment");
  await expect(movement).toHaveCSS("background-color", "rgb(243, 247, 250)");
  await expect(comment).toHaveCSS("background-color", "rgb(255, 249, 232)");
  await expect(history).toHaveCSS("border-top-width", "0px");
  await expect(movement).toHaveCSS("border-bottom-width", "0px");

  const [articleBounds, movementBounds, commentBounds] = await Promise.all([
    article.boundingBox(),
    movement.boundingBox(),
    comment.boundingBox(),
  ]);
  expect(articleBounds).not.toBeNull();
  expect(movementBounds).not.toBeNull();
  expect(commentBounds).not.toBeNull();
  expect(movementBounds!.x - articleBounds!.x).toBeLessThanOrEqual(4);
  expect(articleBounds!.x + articleBounds!.width - movementBounds!.x - movementBounds!.width).toBeLessThanOrEqual(1);
  expect(commentBounds!.x - articleBounds!.x).toBeLessThanOrEqual(4);
  expect(articleBounds!.x + articleBounds!.width - commentBounds!.x - commentBounds!.width).toBeLessThanOrEqual(1);
  expect(Math.abs(movementBounds!.y + movementBounds!.height - commentBounds!.y)).toBeLessThanOrEqual(1);
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
  const attention = page.getByRole("region", { name: "Needs attention" });
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
  const attentionBounds = await attention.boundingBox();
  const activityBounds = await activity.boundingBox();
  expect(descriptionBounds).not.toBeNull();
  expect(attentionBounds).not.toBeNull();
  expect(activityBounds).not.toBeNull();
  expect(attentionBounds!.y - (descriptionBounds!.y + descriptionBounds!.height)).toBeLessThanOrEqual(24);
  expect(activityBounds!.y - (attentionBounds!.y + attentionBounds!.height)).toBeLessThanOrEqual(24);

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
    "attention",
    "activity",
    "comment",
    "timeline",
    "workspace",
    "move",
    "relationships",
    "conversations",
  ]);
});

test("a conversation discloses when Codex replaced an unusable resumed thread", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.conversation.runs[0].attempt.threadContinuity = "replaced";
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText(
    "This run started a replacement thread, so earlier model context was not retained.",
  );
});

test("compact conversation rows stay last in the supporting column and open by keyboard", async ({ page, request }) => {
  const detail = await (await request.get("/api/tasks/T-0001")).json() as {
    task: { activations: Array<{ conversationId: string | null }> };
  };
  const conversationId = detail.task.activations.find(({ conversationId }) => conversationId !== null)?.conversationId;
  expect(conversationId).not.toBeNull();
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const taskDetail = await response.json();
    taskDetail.conversations = [
      {
        id: conversationId,
        owningAgent: {
          id: "implementer",
          name: "Implementation Agent",
          historicalName: "Implementation Agent",
          present: true,
        },
        label: "Inspect existing coordination",
        latestActivityAt: "2026-08-09T12:05:00.000Z",
        status: null,
        continuation: { available: true },
      },
      {
        id: "historical-conversation",
        owningAgent: {
          id: "implementer",
          name: "Implementation Agent",
          historicalName: "Implementation Agent",
          present: false,
        },
        label: "Verify the responsive navigation order",
        latestActivityAt: "2026-08-09T12:00:00.000Z",
        status: null,
        continuation: { available: false, reason: "owning-agent-unavailable" },
      },
    ];
    await route.fulfill({ response, json: taskDetail });
  });

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/tasks/T-0001");
  const conversations = page.getByRole("region", { name: "Conversations" });
  const rows = conversations.getByRole("button");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Implementation Agent");
  await expect(rows.nth(0)).toContainText(/ago|just now/);
  await expect(rows.nth(0)).not.toContainText("Inspect existing coordination");
  await expect(rows.nth(1)).not.toContainText("Verify the responsive navigation order");
  const [agentNameBox, activityTimeBox] = await Promise.all([
    rows.nth(0).locator("strong").boundingBox(),
    rows.nth(0).locator("time").boundingBox(),
  ]);
  expect(agentNameBox).not.toBeNull();
  expect(activityTimeBox).not.toBeNull();
  expect(activityTimeBox!.x).toBeGreaterThan(agentNameBox!.x + agentNameBox!.width);
  expect(Math.abs(
    activityTimeBox!.y + activityTimeBox!.height / 2 - (agentNameBox!.y + agentNameBox!.height / 2),
  )).toBeLessThanOrEqual(2);
  await expect(conversations).not.toContainText(/attempt|token|duration|completed|unavailable/i);
  const supportingOrder = await page.locator(".detail-column > [data-task-section]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-task-section")),
  );
  expect(supportingOrder.at(-1)).toBe("conversations");
  const [widePrimary, wideSupporting, wideConversations] = await Promise.all([
    page.locator(".detail-primary-column").boundingBox(),
    page.locator(".detail-column").boundingBox(),
    page.locator('[data-task-section="conversations"]').boundingBox(),
  ]);
  expect(widePrimary).not.toBeNull();
  expect(wideSupporting).not.toBeNull();
  expect(wideConversations).not.toBeNull();
  expect(wideConversations!.x).toBeGreaterThan(widePrimary!.x + widePrimary!.width);
  expect(Math.abs(wideConversations!.x - wideSupporting!.x)).toBeLessThanOrEqual(2);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [stickyTop, topbarBottom] = await Promise.all([
    page.locator('[data-task-section="conversations"]').evaluate((element) => element.getBoundingClientRect().top),
    page.locator(".detail-topbar").evaluate((element) => element.getBoundingClientRect().bottom),
  ]);
  expect(stickyTop).toBeGreaterThanOrEqual(topbarBottom);
  expect(stickyTop - topbarBottom).toBeLessThanOrEqual(20);

  await rows.nth(0).focus();
  await expect(rows.nth(0)).toBeFocused();
  await rows.nth(0).press("Enter");
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toBeVisible();
  await page.getByRole("button", { name: "Close conversation" }).click();

  await page.setViewportSize({ width: 600, height: 900 });
  const narrowOrder = await page.locator("[data-task-section]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-task-section")),
  );
  expect(narrowOrder.at(-1)).toBe("conversations");
  const [narrowTimeline, narrowConversations] = await Promise.all([
    page.locator('[data-task-section="timeline"]').boundingBox(),
    page.locator('[data-task-section="conversations"]').boundingBox(),
  ]);
  expect(narrowTimeline).not.toBeNull();
  expect(narrowConversations).not.toBeNull();
  expect(Math.abs(narrowConversations!.x - narrowTimeline!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(narrowConversations!.width - narrowTimeline!.width)).toBeLessThanOrEqual(2);
  expect(narrowConversations!.y).toBeGreaterThan(narrowTimeline!.y + narrowTimeline!.height);

  await page.goto("/tasks/T-0002");
  await expect(page.getByRole("region", { name: "Conversations" })).toHaveCount(0);
});

test("compact conversation dots expose running and attention without decorating idle history", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const template = detail.conversations[0];
    detail.conversations = [
      { ...template, id: "idle-conversation", status: null },
      { ...template, id: "running-conversation", status: "running" },
      { ...template, id: "attention-conversation", status: "needs-attention" },
    ];
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const rows = page.getByRole("region", { name: "Conversations" }).getByRole("button");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByRole("status")).toHaveCount(0);
  const running = rows.nth(1).getByRole("status", { name: "Conversation running" });
  await expect(running).toHaveAttribute("title", "Conversation running");
  await expect(running).toHaveCSS("background-color", "rgb(20, 80, 57)");
  const attention = rows.nth(2).getByRole("status", { name: "Conversation needs attention" });
  await expect(attention).toHaveAttribute("title", "Conversation needs attention");
  await expect(attention).toHaveCSS("background-color", "rgb(114, 80, 14)");
  await expect(rows.nth(1)).not.toContainText("running");
  await expect(rows.nth(2)).not.toContainText("needs attention");
});

test("conversation dialog contains focus, closes with Escape, and restores its opener", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const opener = page.getByRole("button", { name: "View conversation" }).first();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const close = dialog.getByRole("button", { name: "Close conversation" });
  await expect(close).toBeFocused();
  await dialog.getByRole("textbox", { name: "Follow-up message" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Copy thread ID" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("conversation continuation navigation highlights and scrolls to its authored message", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.activity.push({
      id: "selected-conversation-continuation",
      type: "conversation.continued",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-15T12:00:00.000Z",
      details: {
        conversationId: "browser-conversation",
        messageId: "selected-conversation-message",
        activationId: "selected-conversation-activation",
        messageBody: "Focus this exact authored follow-up.",
      },
    });
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      id: `selected-history-${index}`,
      kind: "message",
      role: "agent",
      text: `Prior conversation evidence ${index + 1}.`,
    }));
    const result = liveConversation(items);
    (result.conversation as Record<string, unknown>).messages = [{
      id: "selected-conversation-message",
      conversationId: "browser-conversation",
      body: "Focus this exact authored follow-up.",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-15T12:00:00.000Z",
    }];
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0001");
  const continuation = page.locator(".event-entry").filter({ hasText: "Focus this exact authored follow-up." });
  await continuation.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const selectedMessage = dialog.locator(".conversation-user-turn.selected-message-turn");
  await expect(selectedMessage).toContainText("Focus this exact authored follow-up.");
  await expect(selectedMessage).toHaveCSS("background-color", "rgb(243, 247, 250)");
  expect(await dialog.locator(".transcript-content").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
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
    detail.inspection.unresolvedAttention = [];
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
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
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

test("comment participants are discoverable and insert canonical mentions without submitting", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const comment = page.getByRole("region", { name: "Add comment" });
  const draft = comment.getByRole("textbox", { name: "Comment" });

  await draft.fill("Please ask @imp");
  const suggestions = comment.getByRole("listbox", { name: "Mention participants" });
  await expect(suggestions).toBeVisible();
  const implementer = suggestions.getByRole("option", { name: /Implementation Agent.*Builds verified changes/ });
  await expect(implementer).toHaveAttribute("aria-selected", "true");
  await expect(draft).toHaveAttribute("aria-activedescendant", "mention-participant-implementer");
  await implementer.click();
  await expect(draft).toHaveValue("Please ask @implementer ");
  await expect(suggestions).toHaveCount(0);

  await draft.pressSequentially("and notify @");
  await draft.press("ArrowDown");
  await expect(suggestions.getByRole("option", { name: /User.*person overseeing the process/i }))
    .toHaveAttribute("aria-selected", "true");
  await draft.press("Enter");
  await expect(draft).toHaveValue("Please ask @implementer and notify @user ");
  await expect(page.locator(".comment-entry")).not.toContainText("Please ask @implementer and notify @user");

  await comment.getByRole("button", { name: "Post" }).click();
  const submitted = page.locator(".comment-entry").filter({ hasText: "Please ask" });
  await expect(submitted.locator(".canonical-mention")).toHaveCount(2);
  await expect(submitted.locator(".canonical-mention").first()).toHaveAttribute("title", "Implementation Agent");
  await expect(submitted).toContainText("Requested Implementation Agent, user attention");
  const agentMention = submitted.locator(".canonical-mention.agent-mention");
  const userMention = submitted.locator(".canonical-mention.user-mention");
  const agentConsequence = submitted.locator(".comment-consequence .agent-mention");
  const userConsequence = submitted.locator(".comment-consequence .user-mention");
  await expect(agentMention).toHaveCount(1);
  await expect(userMention).toHaveCount(1);
  await expect(agentConsequence).toHaveText("Implementation Agent");
  await expect(userConsequence).toHaveText("user attention");
  const [agentMentionColor, userMentionColor, agentConsequenceColor, userConsequenceColor] = await Promise.all([
    agentMention.evaluate((element) => getComputedStyle(element).backgroundColor),
    userMention.evaluate((element) => getComputedStyle(element).backgroundColor),
    agentConsequence.evaluate((element) => getComputedStyle(element).backgroundColor),
    userConsequence.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(agentMentionColor).not.toBe(userMentionColor);
  expect(agentConsequenceColor).toBe(agentMentionColor);
  expect(userConsequenceColor).toBe(userMentionColor);
});

test("mention discovery supports dismissal and ignores email-like and inline-code text", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const comment = page.getByRole("region", { name: "Add comment" });
  const draft = comment.getByRole("textbox", { name: "Comment" });
  const suggestions = comment.getByRole("listbox", { name: "Mention participants" });

  await draft.fill("paul@imp");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Use `@imp` as an example");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Use ``@imp`` as an example");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Ask @imp");
  await expect(suggestions).toBeVisible();
  await draft.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(draft).toHaveValue("Ask @imp");
});

test("reply to an agent mention preserves the draft, avoids duplicates, and focuses the composer", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.comments.push({
      id: "agent-requested-user",
      body: "I need a decision from @user before continuing.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-09T12:30:00.000Z",
    });
    detail.task.comments.push({
      id: "removed-agent-requested-user",
      body: "A removed participant wrote @user and @removed.",
      actor: { kind: "agent", id: "removed" },
      occurredAt: "2026-08-09T12:31:00.000Z",
    });
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("Here is the decision.");
  const request = page.locator(".comment-entry").filter({ hasText: "I need a decision" });
  const reply = request.getByRole("button", { name: "Reply to Implementation Agent" });
  const consequence = request.locator(".comment-consequence");
  const [consequenceBox, replyBox] = await Promise.all([consequence.boundingBox(), reply.boundingBox()]);
  expect(consequenceBox).not.toBeNull();
  expect(replyBox).not.toBeNull();
  expect(Math.abs((consequenceBox!.y + consequenceBox!.height / 2) - (replyBox!.y + replyBox!.height / 2)))
    .toBeLessThanOrEqual(2);
  expect(replyBox!.x).toBeGreaterThan(consequenceBox!.x + consequenceBox!.width);
  await reply.click();
  await expect(draft).toHaveValue("Here is the decision. @implementer ");
  await expect(draft).toBeFocused();
  await reply.click();
  await expect(draft).toHaveValue("Here is the decision. @implementer ");
  const removed = page.locator(".comment-entry").filter({ hasText: "A removed participant" });
  await expect(removed.locator(".canonical-mention")).toHaveCount(1);
  await expect(removed.getByRole("button", { name: /Reply to/ })).toHaveCount(0);
});

test("reply preserves trailing draft whitespace and is absent without an active composer", async ({ page }) => {
  let archived = false;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.comments.push({
      id: "whitespace-request",
      body: "Please answer @user.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-09T12:32:00.000Z",
    });
    if (archived) detail.task.archived = true;
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("First line\n\n");
  await page.getByRole("button", { name: "Reply to Implementation Agent" }).click();
  await expect(draft).toHaveValue("First line\n\n@implementer ");

  archived = true;
  await page.reload();
  await expect(page.getByRole("region", { name: "Add comment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reply to Implementation Agent" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("an open conversation replaces one running tool entry with its terminal evidence", async ({ page }) => {
  await page.clock.install();
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
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    reads += 1;
    const retainedMessages = Array.from({ length: 30 }, (_, index) => ({
      id: `retained-message-${index}`,
      kind: "message",
      role: "agent",
      text: `Retained transcript message ${index + 1}.`,
    }));
    await route.fulfill({
      status: 200,
      json: liveConversation(reads === 1
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
            }, ...retainedMessages]),
    });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog).toContainText("pnpm test · running");
  expect(reads).toBe(1);
  const transcriptContent = dialog.locator(".transcript-content");
  const readingPosition = await transcriptContent.evaluate((element) => {
    element.scrollTop = 120;
    return element.scrollTop;
  });
  expect(readingPosition).toBeGreaterThan(0);
  await page.clock.fastForward(2_000);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await expect(dialog).toContainText("pnpm test (exit 0) · completed");
  await expect(dialog).toContainText("All live checks passed.");
  await expect(dialog.locator(".transcript-item")).toHaveCount(31);
  expect(await transcriptContent.evaluate((element) => element.scrollTop)).toBe(readingPosition);

  await dialog.getByRole("button", { name: "Close conversation" }).click();
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText("All live checks passed.");
  await page.getByRole("dialog", { name: "Agent conversation" }).getByRole("button", { name: "Close conversation" }).click();
  await page.goto("/");
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText("All live checks passed.");
});

test("an idle open conversation discovers externally added evidence within two seconds", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    reads += 1;
    const result = liveConversation([{
      id: "external-message",
      kind: "message",
      role: "agent",
      text: reads === 1 ? "No external follow-up yet." : "An external follow-up is now visible.",
    }]);
    const conversation = result.conversation as {
      originatingActivation: { status: string };
      runs: Array<{
        attempt: {
          status: string;
          completedAt: string | null;
          outcome: { status: string; summary: string } | null;
        };
      }>;
    };
    conversation.originatingActivation.status = "completed";
    const attempt = conversation.runs[0]!.attempt;
    attempt.status = "completed";
    attempt.completedAt = "2026-08-09T12:05:00.000Z";
    attempt.outcome = { status: "completed", summary: "Idle conversation." };
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("region", { name: "Conversations" }).getByRole("button").first().click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog).toContainText("No external follow-up yet.");
  expect(reads).toBe(1);

  await page.clock.fastForward(2_000);
  await expect(dialog).toContainText("An external follow-up is now visible.");
  expect(reads).toBeGreaterThanOrEqual(2);
});

test("a live conversation follows appended items only while the reader is at the bottom", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const attempt = detail.task.activations[0]?.attempts[0];
    if (attempt !== undefined) {
      attempt.status = "completed";
      attempt.completedAt = "2026-08-09T12:05:00.000Z";
      attempt.outcome = { status: "completed", summary: "Historical run complete." };
    }
    await route.fulfill({ response, json: detail });
  });
  let reads = 0;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
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
      json: liveConversation(items),
    });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
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

test("a conversation follow-up retains its draft on failure and refreshes in place after retry", async ({ page }) => {
  let submitted = false;
  let followUpReads = 0;
  const submissions: Array<{ body: string; idempotencyKey: string }> = [];
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    if (route.request().method() === "POST") {
      submissions.push(route.request().postDataJSON() as { body: string; idempotencyKey: string });
      if (submissions.length === 1) {
        await route.fulfill({ status: 500, json: { error: "temporary failure" } });
        return;
      }
      submitted = true;
      await route.fulfill({
        status: 200,
        json: {
          accepted: true,
          activationId: "browser-follow-up-activation",
          message: {
            id: "browser-follow-up-message",
            conversationId: "browser-conversation",
            body: submissions.at(-1)?.body,
            actor: { kind: "user", id: "local-user" },
            occurredAt: "2026-08-09T12:06:00.000Z",
          },
        },
      });
      return;
    }
    const result = liveConversation([]);
    if (submitted) {
      followUpReads += 1;
      (result.conversation as Record<string, unknown>).messages = [{
        id: "browser-follow-up-message",
        conversationId: "browser-conversation",
        body: "Please check this edge case.\nIt affects retries.",
        actor: { kind: "user", id: "local-user" },
        occurredAt: "2026-08-09T12:06:00.000Z",
      }];
      if (followUpReads > 1) {
        (result.conversation as { originatingActivation: { status: string } }).originatingActivation.status = "completed";
        const runs = (result.conversation as Record<string, unknown>).runs as Array<Record<string, unknown>>;
        Object.assign(runs[0]!.attempt as Record<string, unknown>, {
          status: "completed",
          completedAt: "2026-08-09T12:05:00.000Z",
        });
        runs.push({
        activationId: "browser-follow-up-activation",
        sourceMessageId: "browser-follow-up-message",
        attempt: {
          id: "browser-follow-up-attempt",
          status: "completed",
          workspacePath: "C:/workspace",
          startedAt: "2026-08-09T12:06:01.000Z",
          completedAt: "2026-08-09T12:06:02.000Z",
          outcome: { status: "completed", summary: "Checked the edge case." },
          threadId: "thread-browser-123",
          model: null,
          reasoningEffort: null,
        },
        transcript: {
          available: true,
          items: [{ id: "browser-follow-up-answer", kind: "message", role: "agent", text: "The edge case is covered." }],
        },
        });
      }
    }
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const composer = dialog.getByRole("textbox", { name: "Follow-up message" });
  await composer.fill("Please check this edge case.\nIt affects retries.");
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(dialog.getByRole("alert")).toContainText("500");
  await expect(composer).toHaveValue("Please check this edge case.\nIt affects retries.");
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(composer).toHaveValue("");
  await expect(dialog).toContainText("Please check this edge case.");
  const queuedTurn = dialog.getByRole("status", { name: "Follow-up queued" });
  await expect(queuedTurn).toContainText("Waiting for Implementation Agent to finish the current run.");
  const queuedMessage = dialog.locator(".conversation-user-turn.awaiting-run .user-message");
  await expect(queuedMessage).toHaveCSS("border-right-width", "4px");
  const [messageBox, queuedBox] = await Promise.all([queuedMessage.boundingBox(), queuedTurn.boundingBox()]);
  expect(messageBox).not.toBeNull();
  expect(queuedBox).not.toBeNull();
  expect(queuedBox!.y).toBeGreaterThanOrEqual(messageBox!.y + messageBox!.height);
  await expect(dialog).toContainText("The edge case is covered.");
  await expect(queuedTurn).toHaveCount(0);
  const historyKinds = await dialog.locator(".conversation-run, .conversation-message").evaluateAll((entries) =>
    entries.map((entry) => entry.classList.contains("conversation-message") ? "message" : "run"),
  );
  expect(historyKinds).toEqual(["run", "message", "run"]);
  expect(submissions).toHaveLength(2);
  expect(submissions[1]?.idempotencyKey).toBe(submissions[0]?.idempotencyKey);
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

test("task relationships are discoverable, searchable, and recoverable", async ({ page, request }) => {
  let prerequisite = await (await request.get("/api/tasks/T-0001")).json() as {
    task: { archived: boolean; columnId: string; revision: number; title: string; description: string };
  };
  if (prerequisite.task.archived) {
    const unarchived = await request.post("/api/tasks/T-0001/unarchive", {
      data: { idempotencyKey: "restore-relationship-prerequisite" },
    });
    expect(unarchived.status()).toBe(200);
    prerequisite = await (await request.get("/api/tasks/T-0001")).json() as typeof prerequisite;
  }
  if (prerequisite.task.title !== "Inspect existing coordination") {
    const renamed = await request.patch("/api/tasks/T-0001", {
      data: {
        title: "Inspect existing coordination",
        description: prerequisite.task.description,
        expectedRevision: prerequisite.task.revision,
        idempotencyKey: "restore-relationship-prerequisite-title",
      },
    });
    expect(renamed.status()).toBe(200);
    prerequisite = await (await request.get("/api/tasks/T-0001")).json() as typeof prerequisite;
  }
  if (prerequisite.task.columnId !== "implementation") {
    const moved = await request.post("/api/tasks/T-0001/move", {
      data: {
        destinationColumnId: "implementation",
        expectedRevision: prerequisite.task.revision,
        idempotencyKey: "position-relationship-prerequisite",
      },
    });
    expect(moved.status()).toBe(200);
  }
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as {
      boards: Array<{ id: string; name: string; columns: Array<{ id: string; name: string; tasks: unknown[] }> }>;
    };
    body.boards.push({
      id: "operations",
      name: "Operations",
      columns: [
        {
          id: "investigation",
          name: "Investigation",
          tasks: [
            {
              id: "T-9001",
              title: "Cross-board investigation",
              boardId: "operations",
              column: { id: "investigation", name: "Investigation" },
              revision: 1,
              blocking: { blocked: false, blockerTaskIds: [] },
              relationships: [],
              unresolvedAttention: [],
              automationSuspended: false,
              run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
            },
            ...Array.from({ length: 8 }, (_, index) => ({
              id: `T-91${index.toString().padStart(2, "0")}`,
              title: `Additional investigation ${index + 1}`,
              boardId: "operations",
              column: { id: "investigation", name: "Investigation" },
              revision: 1,
              blocking: { blocked: false, blockerTaskIds: [] },
              relationships: [],
              unresolvedAttention: [],
              automationSuspended: false,
              run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
            })),
          ],
        },
        {
          id: "completion",
          name: "Completion",
          tasks: [{
            id: "T-9002",
            title: "Completed prerequisite",
            boardId: "operations",
            column: { id: "completion", name: "Completion" },
            revision: 2,
            blocking: { blocked: false, blockerTaskIds: [] },
            relationships: [],
            unresolvedAttention: [],
            automationSuspended: false,
            run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
          }],
        },
      ],
    });
    await route.fulfill({ response, json: body });
  });
  await page.goto("/tasks/T-0002");

  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(relationships.getByRole("heading", { name: "Blocking tasks" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Inspect existing coordination" })).toHaveAttribute("href", "/tasks/T-0001");
  await expect(relationships).toContainText("T-0001 · Product delivery / Implementation");
  await expect(relationships.getByRole("region", { name: "Blocking tasks" }).getByText("Blocking", { exact: true })).toHaveCount(0);
  const relationshipActions = relationships.getByRole("group", { name: "Add relationship" });
  const finder = relationshipActions.getByRole("combobox", { name: "Depends on" });
  const createChild = relationshipActions.getByRole("button", { name: "Create child task" });
  await expect(finder).toBeVisible();
  await expect(createChild).toBeVisible();
  const [createChildBox, finderBox] = await Promise.all([createChild.boundingBox(), finder.boundingBox()]);
  expect(createChildBox?.x).toBeLessThan(finderBox?.x ?? 0);
  const actionFrames = await relationshipActions.locator(":scope > *").evaluateAll((elements) =>
    elements.map((element) => ({
      borderWidth: getComputedStyle(element).borderWidth,
      backgroundColor: getComputedStyle(element).backgroundColor,
    })),
  );
  expect(actionFrames).toEqual([
    { borderWidth: "0px", backgroundColor: "rgba(0, 0, 0, 0)" },
    { borderWidth: "0px", backgroundColor: "rgba(0, 0, 0, 0)" },
  ]);
  await expect(relationshipActions.getByRole("listbox", { name: "Available dependency tasks" })).not.toBeVisible();
  await expect(page.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await relationships.getByRole("button", { name: "Remove blocking dependency with Inspect existing coordination" }).click();
  const finalBlockerPreview = page.getByRole("dialog", { name: "Remove blocking dependency?" });
  await expect(finalBlockerPreview).toContainText("Neither task will be deleted");
  await expect(finalBlockerPreview).toContainText("clear the final blocker");
  await finalBlockerPreview.getByRole("button", { name: "Cancel" }).click();
  await finder.focus();
  const options = page.getByRole("listbox", { name: "Available dependency tasks" });
  await expect(options).toBeVisible();
  expect(await options.evaluate((element) => getComputedStyle(element).position)).toBe("absolute");
  expect(await options.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  const overlayScroll = await options.evaluate((element) => {
    const overflow = element.scrollHeight > element.clientHeight;
    element.scrollTop = element.scrollHeight;
    return { overflow, scrollTop: element.scrollTop };
  });
  expect(overlayScroll.overflow).toBe(true);
  expect(overlayScroll.scrollTop).toBeGreaterThan(0);
  await finder.fill("Cross-board");
  await expect(options.getByRole("option", { name: /Cross-board investigation/ })).toContainText("T-9001 · Operations / Investigation");
  await finder.fill("Completed prerequisite");
  await expect(options.getByRole("option", { name: /Completed prerequisite/ })).toContainText("Completed · nonblocking");
  await finder.press("Escape");
  await expect(finder).toBeVisible();
  await expect(options).not.toBeVisible();
  await finder.focus();
  await finder.fill("Recover");
  const recoverOption = options.getByRole("option", { name: /Recover a workspace startup failure/ });
  await expect(recoverOption).toContainText("T-0003 · Product delivery / Implementation");
  await recoverOption.click();
  await expect(relationships.getByRole("heading", { name: "Depends on" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  await expect(relationships.getByRole("region", { name: "Depends on" }).getByText("Blocking", { exact: true })).toBeVisible();
  const taskTimeline = page.getByRole("region", { name: "Task timeline" });
  await expect(taskTimeline.getByText("Dependency added", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Now depends on Recover a workspace startup failure.", { exact: true })).toBeVisible();
  await expect(taskTimeline.locator("strong.relationship-task-name", {
    hasText: "Recover a workspace startup failure",
  })).toBeVisible();
  await expect(finder).toBeVisible();
  await expect(options).not.toBeVisible();
  await expect(relationships.getByText("Selected: Recover a workspace startup failure")).toHaveCount(0);
  await expect(relationships.getByRole("button", { name: "Add dependency" })).toHaveCount(0);
  await expect(relationships.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await finder.focus();
  await finder.fill("Recover");
  await expect(options.getByRole("option", { name: /Recover a workspace startup failure/ })).toHaveCount(0);
  await finder.press("Escape");

  await createChild.click();
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
  await expect(relationships.getByRole("heading", { name: "Child tasks" })).toBeVisible();
  await expect(taskTimeline.getByText("Child task added", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Investigate a focused child outcome was added as a child task.", { exact: true })).toBeVisible();
  await relationships.getByRole("link", { name: "Investigate a focused child outcome" }).click();
  const childRelationships = page.getByRole("region", { name: "Relationships" });
  const childTimeline = page.getByRole("region", { name: "Task timeline" });
  await expect(childRelationships.getByRole("heading", { name: "Parent tasks" })).toBeVisible();
  await expect(childRelationships.getByRole("link", { name: "Drag this task" })).toBeVisible();
  await expect(childRelationships.getByText("Blocking", { exact: true })).toHaveCount(0);
  await expect(childTimeline.getByText("Parent task added", { exact: true })).toBeVisible();
  await expect(childTimeline.getByText("Drag this task was added as the parent task.", { exact: true })).toBeVisible();
  await childRelationships.getByRole("link", { name: "Drag this task" }).click();

  const removeButton = relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" });
  const removeIcon = removeButton.locator("svg");
  const [buttonBounds, iconBounds] = await Promise.all([removeButton.boundingBox(), removeIcon.boundingBox()]);
  expect(buttonBounds).not.toBeNull();
  expect(iconBounds).not.toBeNull();
  if (buttonBounds !== null && iconBounds !== null) {
    expect(Math.abs((buttonBounds.x + buttonBounds.width / 2) - (iconBounds.x + iconBounds.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs((buttonBounds.y + buttonBounds.height / 2) - (iconBounds.y + iconBounds.height / 2))).toBeLessThanOrEqual(1);
  }

  await removeButton.click();
  const confirmation = page.getByRole("dialog", { name: "Remove dependency?" });
  await expect(confirmation).toContainText("Neither task will be deleted");
  await expect(confirmation).toContainText("remain blocked by other unresolved work");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  let removalAttempts = 0;
  await page.route("**/api/tasks/T-0002/relationships/*", async (route) => {
    if (route.request().method() === "DELETE" && removalAttempts++ === 0) {
      await route.fulfill({ status: 409, json: { accepted: false, reason: "relationship-conflict" } });
      return;
    }
    await route.continue();
  });
  await relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" }).click();
  await page.getByRole("dialog", { name: "Remove dependency?" }).getByRole("button", { name: "Remove relationship" }).click();
  await expect(page.getByRole("alert")).toContainText("Relationship state was refreshed");
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  await relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" }).click();
  await page.getByRole("dialog", { name: "Remove dependency?" }).getByRole("button", { name: "Remove relationship" }).click();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toHaveCount(0);
  await expect(taskTimeline.getByText("Dependency removed", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Does not depend on Recover a workspace startup failure anymore.", { exact: true })).toBeVisible();
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
  let continuationBody: unknown;
  await page.route("**/api/attention/browser-permission-attention/continue", async (route) => {
    continuationBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      json: { accepted: true, activationId: "browser-permission-activation" },
    });
  });
  await page.goto("/tasks/T-0001?attention=browser-permission-attention");
  const reason = page.locator(".attention-list li").filter({
    hasText: "Writing the protected release file requires user approval.",
  });
  await expect(reason).toContainText("Automatic retry is unavailable for permission blocks.");
  await expect(reason).toContainText("managed policy");
  await expect(reason).toContainText("completed externally");
  await expect(reason).toContainText("Auto-review can still deny the retry");
  const continueButton = reason.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeDisabled();
  await reason.getByRole("textbox", { name: "Authorization or change" }).fill(
    "I reviewed and authorize retrying the exact release-file write.",
  );
  await continueButton.click();
  await expect.poll(() => continuationBody).toMatchObject({
    message: "I reviewed and authorize retrying the exact release-file write.",
  });
  await expect(reason.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("notification consent delivers on the active task with a stable tag and informational navigation", async ({ page }) => {
  let occurrenceReady = false;
  let occurrenceDelivered = false;
  let initialized = false;
  await page.route("**/api/notification-occurrences*", async (route) => {
    if (!initialized) {
      initialized = true;
      await route.fulfill({ json: { cursor: 0, occurrences: [] } });
      return;
    }
    await route.fulfill({ json: !occurrenceReady || occurrenceDelivered ? { cursor: occurrenceDelivered ? 1 : 0, occurrences: [] } : {
      cursor: 1,
      occurrences: [{
        id: "column-entry-occurrence", type: "column-entry", occurredAt: "2026-08-14T12:00:00.000Z",
        task: { id: "T-0002", title: "Drag this task", boardId: "delivery", boardName: "Product delivery" },
        destination: { boardId: "delivery", boardName: "Product delivery", columnId: "completion", columnName: "Completion" },
      }, {
        id: "mention-occurrence", type: "user-mention", occurredAt: "2026-08-14T12:00:01.000Z",
        task: { id: "T-0002", title: "Drag this task", boardId: "delivery", boardName: "Product delivery" },
        attentionReasonId: "mention-attention",
      }],
    } });
    if (occurrenceReady) occurrenceDelivered = true;
  });
  await page.addInitScript(() => {
    localStorage.removeItem("coordination.desktop-notifications.consent");
    const notifications: Array<{ title: string; options: NotificationOptions; onclick: (() => void) | null; close(): void }> = [];
    class ControlledNotification {
      static permission: NotificationPermission = "default";
      static requestCount = 0;
      static async requestPermission(): Promise<NotificationPermission> {
        ControlledNotification.requestCount += 1;
        ControlledNotification.permission = "granted";
        return "granted";
      }
      onclick: (() => void) | null = null;
      constructor(readonly title: string, readonly options: NotificationOptions = {}) { notifications.push(this); }
      close(): void {}
    }
    Object.defineProperty(window, "Notification", { value: ControlledNotification, configurable: true });
    Object.assign(window, { __controlledNotifications: notifications, __ControlledNotification: ControlledNotification });
  });
  await page.goto("/tasks/T-0002");
  await expect(page.getByRole("dialog", { name: "Allow desktop notifications?" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, ask browser" }).click();
  occurrenceReady = true;
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __controlledNotifications: unknown[] }).__controlledNotifications.length,
  )).toBe(2);
  const delivered = await page.evaluate(() => {
    const controlled = window as typeof window & {
      __controlledNotifications: Array<{ title: string; options: NotificationOptions; onclick: (() => void) | null }>;
      __ControlledNotification: { requestCount: number };
    };
    return { notifications: controlled.__controlledNotifications.map((notification) => ({
      title: notification.title, body: notification.options.body, tag: notification.options.tag,
    })), requestCount: controlled.__ControlledNotification.requestCount };
  });
  expect(delivered).toEqual({ notifications: [
    { title: "Product delivery · T-0002", body: "Drag this task · entered Completion", tag: "column-entry-occurrence" },
    { title: "Product delivery · T-0002", body: "Drag this task · mentioned you", tag: "mention-occurrence" },
  ], requestCount: 1 });
  await page.evaluate(() => {
    const controlled = window as typeof window & { __controlledNotifications: Array<{ onclick: (() => void) | null }> };
    controlled.__controlledNotifications[0]?.onclick?.();
  });
  await expect(page).toHaveURL(/\/tasks\/T-0002$/);
  expect(new URL(page.url()).searchParams.has("attention")).toBe(false);
  await page.evaluate(() => {
    const controlled = window as typeof window & { __controlledNotifications: Array<{ onclick: (() => void) | null }> };
    controlled.__controlledNotifications[1]?.onclick?.();
  });
  await expect(page).toHaveURL(/\/tasks\/T-0002\?attention=mention-attention$/);
});

function liveConversation(items: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    available: true,
    conversation: {
      id: "browser-conversation",
      taskId: "T-0001",
      originatingActivationId: "browser-activation",
      originatingActivation: {
        id: "browser-activation",
        conversationId: "browser-conversation",
        targetAgentId: "implementer",
        status: "running",
        reason: { type: "column-entry", sourceEventId: "browser-move" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
        dismissal: null,
      },
      owningAgent: {
        id: "implementer",
        name: "Implementation Agent",
        historicalName: "Implementation Agent",
        present: true,
      },
      currentThreadId: "thread-browser-123",
      createdAt: "2026-08-09T12:00:00.000Z",
      latestActivityAt: "2026-08-09T12:05:00.000Z",
      continuation: { available: true },
      messages: [],
      runs: [{
        activationId: "browser-activation",
        attempt: {
          id: "browser-attempt",
          status: "running",
          workspacePath: "C:/workspace",
          startedAt: "2026-08-09T12:00:00.000Z",
          completedAt: null,
          outcome: null,
          threadId: "thread-browser-123",
          model: null,
          reasoningEffort: null,
        },
        transcript: { available: true, items },
      }],
    },
  };
}

test("notification delivery failure is attempted once", async ({ page }) => {
  await page.route("**/api/notification-occurrences*", async (route) => {
    const after = new URL(route.request().url()).searchParams.get("after");
    await route.fulfill({ json: after !== "0" ? { cursor: after === null ? 0 : 1, occurrences: [] } : {
      cursor: 1,
      occurrences: [{ id: "failed-occurrence", type: "failed-run", occurredAt: "2026-08-14T12:00:00.000Z",
        task: { id: "T-0002", title: "Drag this task", boardId: "delivery", boardName: "Product delivery" },
        attentionReasonId: "failed-attention" }],
    } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("coordination.desktop-notifications.consent", "accepted");
    class FailingNotification {
      static permission: NotificationPermission = "granted";
      static attempts = 0;
      static async requestPermission(): Promise<NotificationPermission> { return "granted"; }
      constructor() { FailingNotification.attempts += 1; throw new Error("Unavailable"); }
    }
    Object.defineProperty(window, "Notification", { value: FailingNotification, configurable: true });
    Object.assign(window, { __FailingNotification: FailingNotification });
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __FailingNotification: { attempts: number } }).__FailingNotification.attempts,
  )).toBe(1);
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() =>
    (window as typeof window & { __FailingNotification: { attempts: number } }).__FailingNotification.attempts,
  )).toBe(1);
});

test("an unavailable Notification API is explained in Settings and marks the gear", async ({ page }) => {
  await page.addInitScript(() => Reflect.deleteProperty(window, "Notification"));
  await page.goto("/");
  const settings = page.getByRole("button", { name: "Settings, notifications need attention" });
  await expect(settings).toBeVisible();
  await settings.click();
  await expect(page.getByText("This browser does not support desktop notifications.")).toBeVisible();
});

test("browser-local decline is reversible while browser denial remains browser-owned", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("notification-decline-test-initialized") === null) {
      localStorage.removeItem("coordination.desktop-notifications.consent");
      sessionStorage.setItem("notification-decline-test-initialized", "true");
    }
    class ControlledNotification {
      static permission: NotificationPermission = "default";
      static async requestPermission(): Promise<NotificationPermission> { return ControlledNotification.permission; }
    }
    Object.defineProperty(window, "Notification", { value: ControlledNotification, configurable: true });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "No", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Allow desktop notifications?" })).toHaveCount(0);
  await page.getByRole("button", { name: /Settings/ }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.getByText(/locally declined/)).toBeVisible();
  await expect(settings.getByRole("button", { name: "Allow notifications" })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(Notification, "permission", { value: "denied", configurable: true });
  });
  await expect(settings.getByText(/browser controls to allow them again/)).toBeVisible({ timeout: 3_000 });
  await expect(settings.getByRole("button", { name: "Allow notifications" })).toHaveCount(0);
});

test("Settings groups multiple boards and restores an authoritative rejected column value", async ({ page }) => {
  const policy = {
    enabled: true,
    causes: { userMention: true, failedRun: true },
    boards: [
      { id: "delivery", name: "Delivery", columns: [{ id: "backlog", name: "Backlog", enabled: true }] },
      { id: "release", name: "Release", columns: [{ id: "ready", name: "Ready", enabled: false }] },
    ],
  };
  await page.route("**/api/settings/notifications", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 404, json: { accepted: false, reason: "not-found", policy } });
    } else {
      await route.fulfill({ json: policy });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/ }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.getByRole("group", { name: "Delivery" })).toBeVisible();
  await expect(settings.getByRole("group", { name: "Release" })).toBeVisible();
  const backlog = settings.getByRole("checkbox", { name: "Backlog" });
  await backlog.uncheck();
  await expect(settings.getByRole("alert")).toContainText("not found");
  await expect(backlog).toBeChecked();
});

test("Settings applies policy and Appearance immediately with keyboard focus restoration", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /Settings/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  const closeSettings = dialog.getByRole("button", { name: "Close settings" });
  await expect(closeSettings.locator("svg")).toHaveCount(1);
  expect(await closeSettings.evaluate((button) => {
    const icon = button.querySelector("svg")!;
    const buttonRect = button.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    return {
      x: Math.abs(iconRect.x + iconRect.width / 2 - (buttonRect.x + buttonRect.width / 2)),
      y: Math.abs(iconRect.y + iconRect.height / 2 - (buttonRect.y + buttonRect.height / 2)),
    };
  })).toEqual({ x: 0, y: 0 });
  const notificationsCategory = dialog.getByRole("button", { name: "Notifications" });
  await expect(notificationsCategory).toHaveAttribute("aria-current", "page");
  const notificationBounds = await notificationsCategory.boundingBox();
  const notificationDialogBounds = await dialog.boundingBox();
  const global = dialog.getByRole("checkbox", { name: "Enable shared notifications" });
  await global.uncheck();
  await expect(global).not.toBeChecked();
  const cause = dialog.getByRole("checkbox", { name: "Agent mentions you" });
  await expect(cause).toBeEnabled();
  await cause.uncheck();
  await expect(cause).not.toBeChecked();
  const backlog = dialog.getByRole("checkbox", { name: "Backlog" });
  await backlog.uncheck();
  await expect(backlog).not.toBeChecked();

  await dialog.getByRole("button", { name: "Appearance" }).click();
  const appearanceBounds = await notificationsCategory.boundingBox();
  const appearanceDialogBounds = await dialog.boundingBox();
  expect(appearanceBounds?.y).toBeCloseTo(notificationBounds?.y ?? 0, 0);
  expect(appearanceDialogBounds?.height).toBeCloseTo(notificationDialogBounds?.height ?? 0, 0);
  await dialog.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await dialog.getByRole("combobox", { name: "Appearance" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 420, height: 760 });
  await trigger.click();
  await expect(dialog.getByRole("button", { name: "Notifications" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Appearance" })).toBeVisible();
  const settingsBounds = await dialog.boundingBox();
  expect(settingsBounds?.width ?? Infinity).toBeLessThanOrEqual(420);
  await dialog.getByRole("button", { name: "Notifications" }).click();
  await global.check();
  await cause.check();
  await backlog.check();
});

test("top-bar automation action transitions and Current runs navigation stay compact", async ({ page }) => {
  let automation: "running" | "pausing" | "paused" = "running";
  await page.route("**/api/automation/pause", async (route) => {
    automation = "pausing";
    setTimeout(() => { automation = "paused"; }, 400);
    await route.fulfill({ json: { accepted: true, automation: { state: "pausing", attemptsMayStart: false } } });
  });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.automation = { state: automation, attemptsMayStart: automation === "running" };
    body.activeRuns = automation === "paused" ? [] : [{
      attemptId: "compact-run", taskId: "T-0002", taskTitle: "Drag this task",
      boardId: "delivery", boardName: "Product delivery", columnId: "backlog", columnName: "Backlog",
      agentId: "implementer", status: "running", startedAt: "2026-08-14T12:00:00.000Z",
    }];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  const topbar = page.locator(".topbar");
  const segments = topbar.locator(".topbar-control");
  await expect(segments).toHaveCount(3);
  await expect(segments.first()).toHaveCSS("border-radius", "0px");
  const segmentLayout = await topbar.evaluate((element) => {
    const bar = element.getBoundingClientRect();
    const controls = [...element.querySelectorAll<HTMLElement>(".topbar-control")]
      .map((control) => control.getBoundingClientRect());
    return {
      barTop: bar.top,
      barBottom: bar.bottom,
      tops: controls.map((control) => control.top),
      bottoms: controls.map((control) => control.bottom),
      gaps: controls.slice(1).map((control, index) => control.left - controls[index]!.right),
    };
  });
  expect(segmentLayout.tops.every((top) => Math.abs(top - segmentLayout.barTop) < 1)).toBe(true);
  expect(segmentLayout.bottoms.every((bottom) => segmentLayout.barBottom - bottom < 4)).toBe(true);
  expect(segmentLayout.gaps.every((gap) => Math.abs(gap) < 1)).toBe(true);
  await page.getByText("Current runs · 1").click();
  await page.getByRole("button", { name: /implementer.*T-0002/ }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0002$/);
  await page.goto("/");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Pausing…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(page.getByText("No agents are changing boards.")).toHaveCount(0);
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

test("dropping a task into its current column is inert", async ({ page, request }) => {
  const created = await (await request.post("/api/tasks", {
    data: {
      boardId: "delivery",
      columnId: "backlog",
      title: "Drop this task back",
      description: "Returning a drag to its source column must be inert.",
      idempotencyKey: "browser-inert-drag-task",
    },
  })).json() as { task: { id: string } };
  const taskId = created.task.id;
  let moveRequests = 0;
  await page.route("**/api/tasks/*/move", async (route) => {
    moveRequests += 1;
    await route.continue();
  });
  const before = await (await request.get(`/api/tasks/${taskId}`)).json() as {
    task: { revision: number; activity: unknown[]; activations: unknown[] };
  };
  await page.goto("/");
  await page.getByLabel("Filter tasks").fill("Drop this task back");
  const handle = page.getByRole("button", { name: `Drag ${taskId}` });
  const currentColumn = page.getByTestId("column-backlog");
  const otherColumn = page.getByTestId("column-implementation");
  await handle.scrollIntoViewIfNeeded();
  const sourceBox = await handle.boundingBox();
  const targetBox = await currentColumn.boundingBox();
  const otherBox = await otherColumn.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  expect(otherBox).not.toBeNull();
  if (sourceBox === null || targetBox === null || otherBox === null) return;

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(otherBox.x + otherBox.width / 2, otherBox.y + otherBox.height / 2, { steps: 12 });
  await expect(otherColumn).toHaveClass(/drop-target/);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await expect(currentColumn).toHaveClass(/drop-target/);
  await page.mouse.up();

  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(moveRequests).toBe(0);
  const after = await (await request.get(`/api/tasks/${taskId}`)).json() as typeof before;
  expect(after.task.revision).toBe(before.task.revision);
  expect(after.task.activity).toEqual(before.task.activity);
  expect(after.task.activations).toEqual(before.task.activations);
});

test("an assembled conversation follow-up runs and remains attributable in the task timeline", async ({ page, request }) => {
  const followUpBody = [
    "Run this assembled follow-up and preserve the exact authored request.",
    "Check the application boundary.",
    "Check the runtime boundary.",
    "Check the task timeline attribution.",
    "Keep the existing workspace.",
    "Resume the existing thread.",
    "Report the final result here.",
  ].join("\n");
  const startupFailure = await (await request.get("/api/tasks/T-0003")).json() as {
    task: { activations: Array<{ id: string; status: string }> };
  };
  for (const activation of startupFailure.task.activations.filter(({ status }) => status === "queued")) {
    const dismissed = await request.post(`/api/activations/${activation.id}/dismiss`, {
      data: { idempotencyKey: `dismiss-startup-${activation.id}` },
    });
    expect(dismissed.status()).toBe(200);
  }
  const permissionDismissed = await request.post("/api/attention/browser-permission-attention/continue", {
    data: {
      message: "Continue the fixture permission activation before the follow-up.",
      idempotencyKey: "continue-browser-permission-before-follow-up",
    },
  });
  expect(permissionDismissed.status()).toBe(200);
  const before = await (await request.get("/api/tasks/T-0001")).json() as {
    task: {
      relationships: Array<{ id: string }>;
      activations: Array<{ id: string; status: string }>;
    };
  };
  for (const relationship of before.task.relationships) {
    const removed = await request.delete(`/api/tasks/T-0001/relationships/${relationship.id}`, {
      data: { idempotencyKey: `remove-before-follow-up-${relationship.id}` },
    });
    expect(removed.status()).toBe(200);
  }
  const unblocked = await (await request.get("/api/tasks/T-0001")).json() as typeof before;
  for (const activation of unblocked.task.activations.filter(
    ({ id, status }) => status === "queued" && id !== "browser-permission-activation",
  )) {
    const dismissed = await request.post(`/api/activations/${activation.id}/dismiss`, {
      data: { idempotencyKey: `dismiss-before-follow-up-${activation.id}` },
    });
    expect(dismissed.status()).toBe(200);
  }

  await page.goto("/tasks/T-0001");
  const conversations = page.getByRole("region", { name: "Conversations" });
  const originatingConversation = conversations.getByTitle("Inspect existing coordination", { exact: true });
  await originatingConversation.click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await dialog.getByRole("textbox", { name: "Follow-up message" }).fill(followUpBody);
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(dialog.getByRole("textbox", { name: "Follow-up message" })).toHaveValue("");
  await dialog.getByRole("button", { name: "Close conversation" }).click();
  await page.reload();

  const timeline = page.getByRole("region", { name: "Task timeline" });
  const continuationEntry = timeline.locator(".event-entry").filter({ hasText: "Conversation continued" });
  await expect(continuationEntry).toContainText("Run this assembled follow-up and preserve the exact authored request.");
  await expect(continuationEntry).not.toContainText("Conversation continuedConversation continued");
  const continuationText = continuationEntry.locator(".authored-prose");
  expect(await continuationText.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await continuationEntry.getByRole("button", { name: /Show \d+ more lines?/ }).click();
  await expect(continuationEntry.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect(continuationEntry).toContainText("Report the final result here.");
  await continuationEntry.getByRole("button", { name: "View conversation" }).click();
  const queuedConversation = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(queuedConversation).toContainText(followUpBody);
  await expect(queuedConversation.getByRole("status", { name: "Follow-up queued" })).toContainText(
    "Waiting for Implementation Agent's next run to start.",
  );
  await page.getByRole("button", { name: "Close conversation" }).click();
  await page.getByRole("button", { name: "Resume" }).click();
  const runningStatus = originatingConversation.getByRole("status", { name: "Conversation running" });
  await expect(runningStatus).toBeVisible();
  await originatingConversation.click();
  const runningConversation = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(runningConversation).toContainText("Run 2 · running");
  await expect(runningConversation).toContainText("Checking the assembled follow-up now.");
  await expect(runningConversation).toContainText("Verify conversation boundaries · running");
  await runningConversation.getByRole("button", { name: "Close conversation" }).click();
  await expect(timeline).toContainText("Follow-up resumed thread-browser-123");
  const followUpAttempt = timeline.locator(".attempt-entry").filter({ hasText: "Follow-up resumed thread-browser-123" });
  const triggerLink = followUpAttempt.getByRole("link", { name: "the conversation continuation" });
  await expect(triggerLink).toBeVisible();
  await triggerLink.click();
  await expect(continuationEntry.locator("article")).toBeFocused();
  await page.reload();
  await page.getByRole("region", { name: "Conversations" })
    .getByTitle("Inspect existing coordination", { exact: true }).click();
  const refreshed = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(refreshed).toContainText(followUpBody);
  await expect(refreshed).toContainText("Run 2 · completed");
  await expect(refreshed).toContainText("Assembled follow-up verified.");
});
