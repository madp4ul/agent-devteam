import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { writeProcessEvolutionDefinition } from "../support/process-evolution-fixture.ts";
import {
  clearTextSelection,
  expect,
  runningConversationScenario,
  selectedText,
  selectRenderedText,
  test,
} from "./browser-fixture.ts";

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
    body.inspection.unresolvedAttention = interruptionState === "interrupted" ? [{
      id: "automation-suspended:activity-suspended-live",
      type: "automation-suspended",
      sourceEventId: "activity-suspended-live",
      createdAt: "2026-08-08T12:00:00.000Z",
    }] : [];
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
    const result = runningConversationScenario([{ kind: "message", role: "agent", text: "The live run is inspectable." }]);
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

  await page.goto("/");
  const activeCardSignal = page.locator('[data-task-id="T-0002"] .signal.running');
  await expect(activeCardSignal).toContainText("Active · consulting-agent");
  await expect(activeCardSignal.locator(".activity-spinner")).toHaveCSS(
    "animation-name",
    "activity-spinner-spin",
  );
  await page.goto("/tasks/T-0002");
  await expect(page.getByRole("region", { name: "Agent activity" })).toContainText("consulting-agent");
  await expect(page.getByRole("region", { name: "Agent activity" })).toContainText(/Running · 0m/);
  await expect(page.locator(".attempt-entry").filter({ hasText: /consulting-agent.*Running.*Attempt 1/ })).toBeVisible();
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" }).getByRole("heading", { name: "consulting-agent" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Agent conversation" }).getByRole("status", { name: "Agent working" })).toBeVisible();
  await page.getByRole("button", { name: "Close conversation" }).click();
  const interruptClick = page.getByRole("button", { name: "Interrupt current attempt" }).click();
  const interruptingButton = page.getByRole("button", { name: "Interrupting…" });
  await expect(interruptingButton).toBeDisabled();
  await expect(interruptingButton.locator(".activity-spinner")).toHaveCSS(
    "animation-name",
    "activity-spinner-spin",
  );
  await interruptClick;
  const interruptedCurrent = page.locator(".activity-current.interrupted");
  await expect(interruptedCurrent).toContainText("consulting-agent");
  await expect(interruptedCurrent).toContainText("Interrupted · awaiting your decision");
  await expect(page.getByRole("region", { name: "Agent activity" }))
    .not.toContainText("Continuation message (optional)");
  await expect(page.getByRole("region", { name: "Needs attention" })
    .getByRole("button", { name: "Resolve interruption" })).toBeVisible();
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
  await page.getByRole("button", { name: "Resolve interruption" }).click();
  const resolution = page.getByRole("dialog", { name: "Resolve interruption" });
  await expect(resolution.getByLabel("Continuation message (optional)")).toBeFocused();
  await resolution.getByLabel("Continuation message (optional)").fill("Continue after checking the workspace.");
  await resolution.getByRole("button", { name: "Continue interrupted activation" }).click();
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
    body.inspection.unresolvedAttention = activations[0]?.status === "queued" ? [{
      id: "automation-suspended:interrupted-activity",
      type: "automation-suspended",
      sourceEventId: "interrupted-activity",
      createdAt: "2026-08-08T12:01:00.000Z",
    }] : [];
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
  await page.getByRole("button", { name: "Resolve interruption" }).click();
  await page.getByRole("dialog", { name: "Resolve interruption" })
    .getByRole("button", { name: "Dismiss activation", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dismiss activation?" });
  await expect(dialog).toContainText("consulting-agent");
  await expect(dialog).toContainText("The next queued activation may start immediately.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("dialog", { name: "Resolve interruption" })
    .getByRole("button", { name: "Dismiss activation", exact: true }).click();
  await dialog.getByRole("button", { name: "Dismiss activation" }).click();
  await expect(current).toHaveCount(0);
  await expect(queue.getByRole("button", { name: "Dismiss activation for implementing-agent" })).toBeVisible();
  await queue.getByRole("button", { name: "Dismiss activation for implementing-agent" }).click();
  await dialog.getByRole("button", { name: "Dismiss activation" }).click();
  await expect(page.getByRole("alert")).toContainText("already started or changed state");
  await expect(queue.getByRole("button", { name: "Dismiss activation for implementing-agent" })).toHaveCount(0);
});


test("interruption recovery refreshes authoritative state after a continuation race", async ({ page }) => {
  let raced = false;
  await page.route("**/api/tasks/T-0002/continue", async (route) => {
    raced = true;
    await route.fulfill({ status: 409, json: { accepted: false, reason: "not-interrupted" } });
  });
  await page.route("**/api/tasks/T-0002", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.activeRun = null;
    body.inspection.automationSuspended = !raced;
    body.inspection.currentActivation = raced ? null : {
      id: "racing-interrupted-activation",
      targetAgentId: "implementer",
      state: "interrupted",
      model: null,
      reasoningEffort: null,
    };
    body.inspection.unresolvedAttention = raced ? [] : [{
      id: "automation-suspended:racing-activity",
      type: "automation-suspended",
      sourceEventId: "racing-activity",
      createdAt: "2026-08-15T13:00:00.000Z",
    }];
    body.task.activations = raced ? [] : [{
      id: "racing-interrupted-activation",
      targetAgentId: "implementer",
      status: "queued",
      reason: { type: "column-entry", sourceEventId: "racing-move" },
      attempts: [{
        id: "racing-attempt",
        status: "interrupted",
        workspacePath: "C:/task-workspace",
        startedAt: "2026-08-15T12:59:00.000Z",
        completedAt: "2026-08-15T13:00:00.000Z",
        outcome: { status: "user-interrupted", summary: "Interrupted." },
        threadId: "racing-thread",
        model: null,
        reasoningEffort: null,
      }],
      startupFailure: null,
      recovery: null,
      stale: false,
      model: null,
      reasoningEffort: null,
      dismissal: { mayStartNext: true },
    }];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/tasks/T-0002");
  await page.getByRole("button", { name: "Resolve interruption" }).click();
  const dialog = page.getByRole("dialog", { name: "Resolve interruption" });
  await dialog.getByRole("button", { name: "Continue interrupted activation" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
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
  const selectedTaskText = await selectRenderedText(page.locator(".task-description .description strong"));
  expect(selectedTaskText).toBe("full task history");
  await expect(activity).toContainText("No agent work is running or queued.");
  const idleBounds = await activity.boundingBox();
  expect(idleBounds).not.toBeNull();
  expect(idleBounds!.height).toBeLessThanOrEqual(90);
  await expect(draft).toHaveValue("Keep the reader's in-progress comment.");
  await expect(draft).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(readingPosition);
  expect(await selectedText(page)).toBe(selectedTaskText);
  const readsAfterPreservedSelection = reads;
  await clearTextSelection(page);
  await expect.poll(() => reads).toBeGreaterThan(readsAfterPreservedSelection);
  expect(await selectedText(page)).toBe("");
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
  await page.route("**/api/attention/*/continue", async (route) => {
    continuationBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      json: { accepted: true, activationId: "permission-activation" },
    });
  });
  await page.goto("/tasks/T-0002");
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
  const runLink = page.getByRole("link", { name: /implementer.*T-0002/ });
  await expect(runLink).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await runLink.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/tasks\/T-0002$/);
  await expect(page).toHaveURL(/\/$/);
  await popup.close();
  await page.getByRole("button", { name: "Pause" }).click();
  const pausingButton = page.getByRole("button", { name: "Pausing…" });
  await expect(pausingButton).toBeDisabled();
  await expect(pausingButton.locator(".activity-spinner")).toHaveCSS(
    "animation-name",
    "activity-spinner-spin",
  );
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(page.getByText("No agents are changing boards.")).toHaveCount(0);
});
