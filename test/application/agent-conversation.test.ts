import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AutomationClock } from "../../src/application/automation-contract.ts";
import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
  AttemptTokenUsage,
} from "../../src/application/runtime-contract.ts";

const execFileAsync = promisify(execFile);
import {
  ControlledAgentRuntime,
  createHandoffFixture,
  PausedRetryClock,
} from "../support/handoff-fixture.ts";

test("conversation lineage stays isolated by both task and stable agent identity", async (t) => {
  const fixture = await createHandoffFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const first = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "First isolated task",
    description: "Keep this task's model lineage private.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-first-isolated-conversation",
  });
  const second = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Second isolated task",
    description: "Use a different task lineage for the same agent.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-second-isolated-conversation",
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;
  const consulted = application.addTaskComment({
    taskId: first.task.id,
    body: "@reviewer inspect this task independently.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "consult-isolated-reviewer",
  });
  assert.equal(consulted.accepted, true);
  if (!consulted.accepted) return;

  const firstImplementer = consulted.task.activations[0]?.conversationId;
  const firstReviewer = consulted.task.activations[1]?.conversationId;
  const secondImplementer = second.task.activations[0]?.conversationId;
  assert.ok(firstImplementer);
  assert.ok(firstReviewer);
  assert.ok(secondImplementer);
  assert.notEqual(firstImplementer, firstReviewer);
  assert.notEqual(firstImplementer, secondImplementer);
});

test("a source already delivered in initial history is not delivered again to its queued activation", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Deliver a queued source once",
    description: "The initial activation can already see the later queued mention source.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-pre-delivered-source-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const sourceBody = "@implementer handle this queued source after the initial activation.";
  const mentioned = application.addTaskComment({
    taskId: created.task.id,
    body: sourceBody,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "queue-pre-delivered-source",
  });
  assert.equal(mentioned.accepted, true);
  if (!mentioned.accepted) return;

  await application.resumeAutomation();
  const initial = await runtime.waitForRequest(1);
  assert.deepEqual(initial.activationContext.comments.map(({ body }) => body), [sourceBody]);
  runtime.complete({ status: "completed", summary: "Initial activation complete.", threadId: "source-thread" });
  const resumed = await runtime.waitForRequest(2);
  assert.equal(resumed.resumeThreadId, "source-thread");
  assert.equal(resumed.activationContext.sourceDelivery, "conversation-history");
  assert.deepEqual(resumed.activationContext.comments, []);
  runtime.complete({ status: "completed", summary: "Queued mention complete.", threadId: "source-thread" });
  await application.waitForAutomationIdle();
});

test("ordinary activations reuse the task-and-agent conversation and deliver only new task context", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Continue one implementation lineage",
    description: "Initial complete task description.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-continuity-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const initialComment = application.addTaskComment({
    taskId: created.task.id,
    body: "Initial authored background without a mention.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "initial-continuity-background",
  });
  assert.equal(initialComment.accepted, true);

  await application.resumeAutomation();
  const initial = await runtime.waitForRequest(1);
  assert.equal(initial.activationContext.kind, "initial");
  assert.equal(initial.activationContext.description, "Initial complete task description.");
  assert.deepEqual(initial.activationContext.comments.map(({ body }) => body), [
    "Initial authored background without a mention.",
  ]);
  runtime.complete({ status: "completed", summary: "Initial work complete.", threadId: "continuity-thread" });
  await application.waitForAutomationIdle();
  application.pauseAutomation();

  const current = application.queryTask(created.task.id);
  assert.equal(current.available, true);
  if (!current.available) return;
  const edited = application.editTask({
    taskId: created.task.id,
    title: current.task.title,
    description: "Changed task description delivered once.",
    expectedRevision: current.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "edit-continuity-description",
  });
  assert.equal(edited.accepted, true);
  const intervening = application.addTaskComment({
    taskId: created.task.id,
    body: "Intervening authored context.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "intervening-continuity-comment",
  });
  assert.equal(intervening.accepted, true);
  const mentioned = application.addTaskComment({
    taskId: created.task.id,
    body: "@implementer handle this exact resumed request in full.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "mention-continuity-owner",
  });
  assert.equal(mentioned.accepted, true);
  if (!mentioned.accepted) return;
  assert.equal(
    mentioned.task.activations[1]?.conversationId,
    mentioned.task.activations[0]?.conversationId,
  );

  await application.resumeAutomation();
  const resumed = await runtime.waitForRequest(2);
  assert.equal(resumed.resumeThreadId, "continuity-thread");
  assert.equal(resumed.attempt.number, 1);
  assert.equal(resumed.activationContext.kind, "resumed");
  assert.equal(resumed.activationContext.description, "Changed task description delivered once.");
  assert.deepEqual(resumed.activationContext.comments.map(({ body }) => body), [
    "Intervening authored context.",
    "@implementer handle this exact resumed request in full.",
  ]);
  assert.equal(resumed.activationContext.sourceDelivery, "current-context");
  runtime.complete({ status: "completed", summary: "Resumed work complete.", threadId: "continuity-thread" });
  await application.waitForAutomationIdle();
});

test("continuing a conversation persists one authored message and activation idempotently", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  let application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Continue the implementation discussion",
    description: "Retain the owning agent and existing Codex context.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-follow-up-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  runtime.complete({ status: "completed", summary: "Initial answer.", threadId: "thread-initial" });
  await application.waitForAutomationIdle();
  const completed = application.queryTask(created.task.id);
  assert.equal(completed.available, true);
  if (!completed.available) return;
  const conversationId = completed.task.activations[0]?.conversationId;
  assert.ok(conversationId);
  application.pauseAutomation();

  const command = {
    taskId: created.task.id,
    conversationId,
    body: "\nPlease verify the edge case.\n\n",
    actor: { kind: "user" as const, id: "paul" },
    idempotencyKey: "continue-existing-conversation",
  };
  const accepted = application.continueAgentConversation(command);
  const replayed = application.continueAgentConversation(command);

  assert.equal(accepted.accepted, true);
  assert.deepEqual(replayed, accepted);
  if (!accepted.accepted) return;
  assert.equal(accepted.message.body, command.body);
  const task = application.queryTask(created.task.id);
  assert.equal(task.available, true);
  if (!task.available) return;
  const followUps = task.task.activations.filter(({ reason }) => reason.type === "user-follow-up");
  assert.equal(followUps.length, 1);
  assert.equal(followUps[0]?.conversationId, conversationId);
  assert.equal(followUps[0]?.targetAgentId, "implementer");
  assert.equal(followUps[0]?.reason.sourceEventId, accepted.message.id);
  const continuationActivity = task.task.activity.filter(({ type }) => type === "conversation.continued");
  assert.equal(continuationActivity.length, 1);
  assert.equal(continuationActivity[0]?.details.messageId, accepted.message.id);
  assert.equal(continuationActivity[0]?.details.messageBody, command.body);
  const conversation = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) assert.deepEqual(
    conversation.conversation.history.filter((entry) => entry.kind === "message").map((entry) => entry.message),
    [accepted.message],
  );

  application.close();
  application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  assert.deepEqual(application.continueAgentConversation(command), accepted);
  const afterRestart = application.queryTask(created.task.id);
  assert.equal(afterRestart.available, true);
  if (afterRestart.available) {
    assert.equal(afterRestart.task.activations.filter(({ reason }) => reason.type === "user-follow-up").length, 1);
    assert.equal(afterRestart.task.activity.filter(({ type }) => type === "conversation.continued").length, 1);
  }
  const conversationAfterRestart = await application.queryAgentConversation(
    created.task.id,
    conversationId,
  );
  assert.equal(conversationAfterRestart.available, true);
  if (conversationAfterRestart.available) {
    assert.equal(conversationAfterRestart.conversation.currentThreadId, "thread-initial");
    assert.deepEqual(conversationAfterRestart.conversation.owningAgent, {
      id: "implementer",
      name: "Implementation Agent",
      historicalName: "Implementation Agent",
      present: true,
    });
    assert.deepEqual(
      conversationAfterRestart.conversation.history.filter((entry) => entry.kind === "message").map((entry) => entry.message),
      [accepted.message],
    );
    assert.equal(
      conversationAfterRestart.conversation.history.filter((entry) => entry.kind === "activation").flatMap((entry) => entry.attemptIds).length,
      1,
    );
  }
});

test("retiring a settled conversation preserves it and the next ordinary activation creates its replacement", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  let application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Replace a stale implementation lineage",
    description: "Start the next ordinary activation with complete current context.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-retirement-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const conversationId = created.task.activations[0]?.conversationId;
  assert.ok(conversationId);

  assert.deepEqual(application.retireAgentConversation({
    taskId: created.task.id,
    conversationId,
    reason: "The inherited approach is anchored on an obsolete constraint.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-unfinished-retirement",
  }), { accepted: false, reason: "activation-work-pending" });

  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  runtime.complete({ status: "completed", summary: "Initial work settled.", threadId: "retired-thread" });
  await application.waitForAutomationIdle();
  application.pauseAutomation();

  const command = {
    taskId: created.task.id,
    conversationId,
    reason: "The inherited approach is anchored on an obsolete constraint.",
    actor: { kind: "user" as const, id: "paul" },
    idempotencyKey: "retire-settled-conversation",
  };
  const retired = application.retireAgentConversation(command);
  assert.equal(retired.accepted, true);
  assert.deepEqual(application.retireAgentConversation(command), retired);
  if (!retired.accepted) return;
  assert.equal(retired.retirement.reason, command.reason);

  const historicalFollowUp = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Explain the earlier decision.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-retired-conversation",
  });
  assert.equal(historicalFollowUp.accepted, true);

  const mentioned = application.addTaskComment({
    taskId: created.task.id,
    body: "@implementer use a fresh approach for this ordinary request.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "activate-replacement-conversation",
  });
  assert.equal(mentioned.accepted, true);
  if (!mentioned.accepted) return;
  const replacementId = mentioned.task.activations.at(-1)?.conversationId;
  assert.ok(replacementId);
  assert.notEqual(replacementId, conversationId);

  await application.resumeAutomation();
  const retiredContinuation = await runtime.waitForRequest(2);
  assert.equal(retiredContinuation.resumeThreadId, "retired-thread");
  assert.equal(retiredContinuation.activationId, historicalFollowUp.accepted ? historicalFollowUp.activationId : "");
  runtime.complete({ status: "completed", summary: "Historical explanation supplied.", threadId: "retired-thread" });
  const replacementRequest = await runtime.waitForRequest(3);
  assert.equal(replacementRequest.activationContext.kind, "initial");
  assert.equal(replacementRequest.activationContext.description, created.task.description);
  assert.equal(replacementRequest.activationContext.replacementReason, command.reason);
  assert.equal(replacementRequest.resumeThreadId, undefined);
  runtime.complete({ status: "completed", summary: "Replacement approach complete.", threadId: "replacement-thread" });
  await application.waitForAutomationIdle();
  application.pauseAutomation();

  const index = application.queryTaskConversationIndex(created.task.id);
  assert.equal(index.available, true);
  if (index.available) {
    assert.equal(index.conversations.find(({ id }) => id === conversationId)?.retired, true);
    assert.equal(index.conversations.find(({ id }) => id === replacementId)?.retired, false);
  }
  const oldDetail = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(oldDetail.available, true);
  if (oldDetail.available) assert.deepEqual(oldDetail.conversation.retirement, retired.retirement);

  const laterHistoricalFollowUp = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Clarify the historical approach after its replacement.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-retired-conversation-after-replacement",
  });
  assert.equal(laterHistoricalFollowUp.accepted, true);
  const reordered = application.queryTaskConversationIndex(created.task.id);
  assert.equal(reordered.available, true);
  if (reordered.available) {
    assert.equal(reordered.conversations[0]?.id, conversationId);
    assert.equal(reordered.conversations[0]?.retired, true);
  }
  const stillCurrent = application.addTaskComment({
    taskId: created.task.id,
    body: "@implementer keep this ordinary work in the replacement lineage.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reuse-replacement-after-retired-follow-up",
  });
  assert.equal(stillCurrent.accepted, true);
  if (stillCurrent.accepted) assert.equal(stillCurrent.task.activations.at(-1)?.conversationId, replacementId);

  application.close();
  application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const replacement = await application.queryAgentConversation(created.task.id, replacementId);
  assert.equal(replacement.available, true);
  if (replacement.available) {
    assert.equal(replacement.conversation.replacesConversationId, conversationId);
    assert.equal(replacement.conversation.replacementReason, command.reason);
  }
});

test("a follow-up resumes the owning agent's thread and existing task workspace in activation order", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  let application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Resume the implementation conversation",
    description: "Run a follow-up after the task has moved to review.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-resumed-follow-up-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  const initialRequest = await runtime.waitForRequest(1);
  runtime.complete({ status: "completed", summary: "Initial implementation answer.", threadId: "thread-owner" });
  await application.waitForAutomationIdle();
  application.pauseAutomation();
  const current = application.queryTask(created.task.id);
  assert.equal(current.available, true);
  if (!current.available) return;
  const conversationId = current.task.activations[0]?.conversationId;
  assert.ok(conversationId);
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: current.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-before-follow-up",
  });
  assert.equal(moved.accepted, true);
  const continued = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Re-check the implementation detail.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "follow-up-after-move",
  });
  assert.equal(continued.accepted, true);
  if (!continued.accepted) return;

  application.close();
  await writeFile(fixture.implementerInstructionsPath, "Use the current follow-up instructions.\n");
  await writeFile(
    fixture.definitionPath,
    (await readFile(fixture.definitionPath, "utf8")).replace(
      "name: Implementation Agent",
      "name: Renamed Implementation Agent",
    ),
  );
  application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  assert.equal((await application.resumeWithCurrentProcess()).accepted, true);

  const reviewRequest = await runtime.waitForRequest(2);
  assert.equal(reviewRequest.agent.id, "reviewer");
  runtime.complete({ status: "completed", summary: "Review complete.", threadId: "thread-reviewer" });
  const followUpRequest = await runtime.waitForRequest(3);
  assert.equal(followUpRequest.agent.id, "implementer");
  assert.equal(followUpRequest.agent.name, "Renamed Implementation Agent");
  assert.equal(followUpRequest.resumeThreadId, "thread-owner");
  assert.equal(followUpRequest.workspace.path, initialRequest.workspace.path);
  assert.equal(followUpRequest.task.columnId, "review");
  assert.equal(followUpRequest.attempt.thread, "resumed");
  assert.equal(followUpRequest.attempt.continuationMessage, "Re-check the implementation detail.");
  assert.equal(followUpRequest.agent.instructions, "Use the current follow-up instructions.\n");
  runtime.complete({
    status: "completed",
    summary: "Follow-up continued after replacing an unusable thread.",
    threadId: "thread-replacement",
    threadContinuity: "replaced",
  });
  await application.waitForAutomationIdle();
  const conversation = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.ok(conversation.conversation.history.some((entry) =>
      entry.kind === "message" && entry.message.id === continued.message.id
    ));
    assert.ok(conversation.conversation.history.some((entry) => entry.kind === "continuity-loss"));
    assert.equal(conversation.conversation.currentThreadId, "thread-replacement");
  }
  const afterReplacement = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Continue from the honest replacement lineage.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "follow-up-after-thread-replacement",
  });
  assert.equal(afterReplacement.accepted, true);
  const replacementFollowUp = await runtime.waitForRequest(4);
  assert.equal(replacementFollowUp.agent.id, "implementer");
  assert.equal(replacementFollowUp.resumeThreadId, "thread-replacement");
  runtime.complete({
    status: "completed",
    summary: "Replacement lineage continued.",
    threadId: "thread-replacement",
  });
  await application.waitForAutomationIdle();
});

test("task conversation index stays compact, recent, distinguishable, and historically navigable", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  let application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const originalDefinition = await readFile(fixture.definitionPath, "utf8");
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Index agent conversations",
    description: "Keep task conversations easy to reach.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-conversation-index-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const secondRequest = "@implementer verify responsive conversation navigation.";
  const secondComment = application.addTaskComment({
    taskId: created.task.id,
    body: secondRequest,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "second-index-request",
  });
  assert.equal(secondComment.accepted, true);
  if (!secondComment.accepted) return;
  const firstConversationId = secondComment.task.activations[0]?.conversationId;
  const secondConversationId = secondComment.task.activations[1]?.conversationId;
  assert.ok(firstConversationId);
  assert.ok(secondConversationId);
  assert.equal(secondConversationId, firstConversationId);

  const initial = application.queryTaskConversationIndex(created.task.id);
  assert.equal(initial.available, true);
  if (!initial.available) return;
  assert.deepEqual(initial.conversations.map(({ id, label }) => ({ id, label })), [
    { id: firstConversationId, label: "Index agent conversations" },
  ]);
  assert.deepEqual(Object.keys(initial.conversations[0]!).sort(), [
    "continuation",
    "costPending",
    "hasUnpricedSettledRuns",
    "id",
    "label",
    "latestActivityAt",
    "owningAgent",
    "retired",
    "status",
  ]);
  assert.deepEqual(application.continueAgentConversation({
    taskId: created.task.id,
    conversationId: secondConversationId,
    body: "Do not continue before a usable thread exists.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-threadless-conversation",
  }), { accepted: false, reason: "thread-unavailable" });
  assert.deepEqual(application.continueAgentConversation({
    taskId: "T-9999",
    conversationId: firstConversationId,
    body: "Do not cross the task boundary.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-wrong-task-conversation",
  }), { accepted: false, reason: "not-found" });
  assert.deepEqual(application.continueAgentConversation({
    taskId: created.task.id,
    conversationId: "missing-conversation",
    body: "Do not invent a conversation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-missing-conversation",
  }), { accepted: false, reason: "not-found" });

  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  const reordered = application.queryTaskConversationIndex(created.task.id);
  assert.equal(reordered.available, true);
  if (!reordered.available) return;
  assert.equal(reordered.conversations[0]?.id, firstConversationId);

  application.pauseAutomation();
  runtime.complete({
    status: "completed",
    summary: "Indexed the existing conversations.",
    threadId: "conversation-index-thread",
  });
  await application.waitForAutomationIdle();
  application.close();
  await writeFile(
    fixture.definitionPath,
    originalDefinition.replace("name: Implementation Agent", "name: Renamed Implementation Agent"),
  );
  application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const renamed = application.queryTaskConversationIndex(created.task.id);
  assert.equal(renamed.available, true);
  if (renamed.available) {
    assert.equal(renamed.conversations.find(({ id }) => id === firstConversationId)?.owningAgent.name,
      "Renamed Implementation Agent");
  }

  application.close();
  await writeFile(
    fixture.definitionPath,
    `schemaVersion: 1
name: Handoff process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep every handoff explicit.
agents:
  - id: reviewer
    name: Code Reviewer
    role: Reviews implementations
    summary: Reviews completed changes.
    instructions: ./reviewer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Move completed work to review.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: reviewer
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const historical = application.queryTaskConversationIndex(created.task.id);
  assert.equal(historical.available, true);
  if (!historical.available) return;
  const unavailable = historical.conversations.find(({ id }) => id === firstConversationId);
  assert.deepEqual(unavailable?.owningAgent, {
    id: "implementer",
    name: "Implementation Agent",
    historicalName: "Implementation Agent",
    present: false,
  });
  assert.deepEqual(unavailable?.continuation, {
    available: false,
    reason: "owning-agent-unavailable",
  });
  const historicalDetail = await application.queryAgentConversation(
    created.task.id,
    firstConversationId,
  );
  assert.equal(historicalDetail.available, true);
  if (historicalDetail.available) {
    assert.deepEqual(historicalDetail.conversation.owningAgent, {
      id: "implementer",
      name: "Implementation Agent",
      historicalName: "Implementation Agent",
      present: false,
    });
    assert.deepEqual(historicalDetail.conversation.continuation, {
      available: false,
      reason: "owning-agent-unavailable",
    });
  }
  assert.deepEqual(application.continueAgentConversation({
    taskId: created.task.id,
    conversationId: firstConversationId,
    body: "Do not substitute the reviewer for the removed owner.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-removed-conversation-owner",
  }), { accepted: false, reason: "owning-agent-unavailable" });
  assert.deepEqual(application.queryTaskConversationIndex("T-9999"), {
    available: false,
    reason: "not-found",
  });
});

test("a finished attempt transcript remains inspectable after application restart", async (t) => {
  const fixture = await createHandoffFixture();
  await writeFile(
    fixture.definitionPath,
    (await readFile(fixture.definitionPath, "utf8")).replace(
      "agents:\n",
      `modelPricing:
  - model: gpt-5.6-sol
    usdPerMillionTokens:
      input: 5
      cachedInput: 0.5
      cacheWriteInput: 6.25
      output: 30
agents:
`,
    ),
  );
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
    transcriptAccess: runtime,
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Retain the completed transcript",
    description: "Persist inspectable evidence when the attempt finishes.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-durable-transcript-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  const runningIndex = application.queryTaskConversationIndex(created.task.id);
  assert.equal(runningIndex.available, true);
  if (runningIndex.available) {
    assert.equal(runningIndex.conversations[0]?.costPending, true);
    assert.equal(runningIndex.conversations[0]?.costEstimate, undefined);
  }
  const expectedTranscript: AttemptTranscriptItem[] = [
    { kind: "message", role: "agent", text: "The implementation is ready for review." },
  ];
  const expectedUsage: AttemptTokenUsage = {
    inputTokens: 2_400,
    cachedInputTokens: 1_800,
    cacheWriteInputTokens: 200,
    outputTokens: 600,
    reasoningOutputTokens: 350,
  };
  runtime.setTranscript(request.attemptId, expectedTranscript);
  runtime.setUsage(request.attemptId, expectedUsage);
  runtime.complete({
    status: "completed",
    summary: "Implementation complete.",
    threadId: "reused-codex-thread",
  });
  await application.waitForAutomationIdle();
  const completedTask = application.queryTask(created.task.id);
  const activation = completedTask.available
    ? completedTask.task.activations[0]
    : undefined;
  const attemptId = completedTask.available
    ? activation?.attempts[0]?.id
    : undefined;
  const conversationId = activation?.conversationId;
  assert.ok(attemptId);
  assert.ok(conversationId);
  assert.deepEqual(await application.queryAttemptTranscript(attemptId), {
    available: true,
    threadId: "reused-codex-thread",
    items: expectedTranscript,
    usage: expectedUsage,
    costEstimate: { currency: "USD", amount: 0.02215 },
  });
  const conversation = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.deepEqual(conversation.conversation.owningAgent, {
      id: "implementer",
      name: "Implementation Agent",
      historicalName: "Implementation Agent",
      present: true,
    });
    assert.equal(conversation.conversation.taskId, created.task.id);
    assert.equal(conversation.conversation.originatingActivationId, activation.id);
    assert.deepEqual(conversation.conversation.originatingActivation, activation);
    assert.equal(conversation.conversation.currentThreadId, "reused-codex-thread");
    assert.deepEqual(conversation.conversation.continuation, { available: true });
    assert.deepEqual(
      conversation.conversation.history.map((entry) => entry.kind),
      ["activation", "item"],
    );
    const activationCause = conversation.conversation.history[0];
    assert.equal(activationCause?.kind, "activation");
    if (activationCause?.kind === "activation") {
      assert.equal(activationCause.activationId, activation.id);
      assert.deepEqual(activationCause.attemptIds, [attemptId]);
      assert.equal(activationCause.status, "completed");
      assert.equal(activationCause.reason.type, "column-entry");
      assert.equal(activationCause.source.kind, "activity");
    }
    assert.deepEqual(conversation.conversation.costEstimate, {
      currency: "USD",
      amount: 0.02215,
    });
  }
  const index = application.queryTaskConversationIndex(created.task.id);
  assert.equal(index.available, true);
  if (index.available) {
    assert.deepEqual(index.conversations[0]?.costEstimate, {
      currency: "USD",
      amount: 0.02215,
    });
  }
  assert.deepEqual(await application.queryAgentConversation("T-9999", conversationId), {
    available: false,
    reason: "not-found",
  });
  application.close();
  const legacyDatabase = new DatabaseSync(fixture.databasePath);
  legacyDatabase.exec("DROP TABLE model_pricing; PRAGMA user_version = 16");
  legacyDatabase.close();
  await writeFile(
    fixture.definitionPath,
    (await readFile(fixture.definitionPath, "utf8")).replace("      input: 5\n", "      input: 50\n"),
  );

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restarted.close());
  const retainedTask = restarted.queryTask(created.task.id);
  assert.equal(retainedTask.available, true);
  if (retainedTask.available) assert.equal(retainedTask.task.columnId, "implementation");
  assert.deepEqual(await restarted.queryAttemptTranscript(attemptId), {
    available: true,
    threadId: "reused-codex-thread",
    items: expectedTranscript,
    usage: expectedUsage,
    costEstimate: { currency: "USD", amount: 0.02215 },
  });
  assert.deepEqual(
    await restarted.queryAgentConversation(created.task.id, conversationId),
    conversation,
  );
});

test("a streamed Codex failure remains inspectable while its retry waits at the queue head", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: new PausedRetryClock(),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
    transcriptAccess: runtime,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Retain the failed handoff",
    description: "The failed Codex stream must remain inspectable.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-failed-handoff",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  const failedRequest = await runtime.waitForRequest(1);
  const failedTranscript: AttemptTranscriptItem[] = [
    { kind: "diagnostic", text: "model stream disconnected" },
  ];
  runtime.setTranscript(failedRequest.attemptId, failedTranscript);
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "queue-review-behind-failing-implementation",
  });
  assert.equal(moved.accepted, true);
  runtime.complete({
    status: "failed",
    summary: "Codex could not complete the activation: model stream disconnected",
    threadId: "thread-failed-handoff",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  const failed = application.queryTask(created.task.id);
  assert.equal(failed.available, true);
  if (!failed.available) return;
  assert.equal(failed.task.activations[0]?.status, "queued");
  assert.equal(failed.task.activations[0]?.recovery?.state, "scheduled");
  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) {
    assert.deepEqual(inspection.task.currentActivation, {
      id: failed.task.activations[0]?.id,
      targetAgentId: "implementer",
      state: "queued",
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
    });
  }
  assert.deepEqual(failed.task.activations[0]?.attempts[0], {
    id: failed.task.activations[0]?.attempts[0]?.id,
    status: "failed",
    workspacePath: join(fixture.workspaceRoot, created.task.id),
    startedAt: failed.task.activations[0]?.attempts[0]?.startedAt,
    completedAt: failed.task.activations[0]?.attempts[0]?.completedAt,
    outcome: {
      status: "failed",
      summary: "Codex could not complete the activation: model stream disconnected",
    },
    threadId: "thread-failed-handoff",
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
  });
  const failedAttemptId = failed.task.activations[0]?.attempts[0]?.id;
  assert.ok(failedAttemptId);
  assert.deepEqual(await application.queryAttemptTranscript(failedAttemptId), {
    available: true,
    threadId: "thread-failed-handoff",
    items: failedTranscript,
  });
});

test("conversation cost totals preserve the known subtotal when a settled run has no usage", async (t) => {
  const fixture = await createHandoffFixture();
  await writeFile(
    fixture.definitionPath,
    (await readFile(fixture.definitionPath, "utf8")).replace(
      "agents:\n",
      `modelPricing:
  - model: gpt-5.6-sol
    usdPerMillionTokens:
      input: 1
      cachedInput: 1
      cacheWriteInput: 1
      output: 1
agents:
`,
    ),
  );
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
    transcriptAccess: runtime,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Compare complete conversation costs",
    description: "Preserve known cost without overstating completeness.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-cost-total-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const conversationId = created.task.activations[0]?.conversationId;
  assert.ok(conversationId);

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  runtime.setTranscript(first.attemptId, []);
  runtime.setUsage(first.attemptId, {
    inputTokens: 1_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  });
  runtime.complete({ status: "completed", summary: "First priced run.", threadId: "cost-thread" });
  await application.waitForAutomationIdle();

  const secondMessage = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Run the second comparison.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "second-cost-run",
  });
  assert.equal(secondMessage.accepted, true);
  const second = await runtime.waitForRequest(2);
  runtime.setTranscript(second.attemptId, []);
  runtime.setUsage(second.attemptId, {
    inputTokens: 3_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  });
  runtime.complete({ status: "completed", summary: "Second priced run.", threadId: "cost-thread" });
  await application.waitForAutomationIdle();
  const complete = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(complete.available, true);
  if (complete.available) {
    assert.deepEqual(complete.conversation.costEstimate, { currency: "USD", amount: 0.003 });
  }

  const thirdMessage = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Run without reported usage.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "unavailable-cost-run",
  });
  assert.equal(thirdMessage.accepted, true);
  await runtime.waitForRequest(3);
  runtime.complete({ status: "completed", summary: "Usage unavailable.", threadId: "cost-thread" });
  await application.waitForAutomationIdle();
  const incomplete = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(incomplete.available, true);
  if (incomplete.available) {
    assert.deepEqual(incomplete.conversation.costEstimate, { currency: "USD", amount: 0.003 });
    assert.equal(incomplete.conversation.hasUnpricedSettledRuns, true);
  }
  const index = application.queryTaskConversationIndex(created.task.id);
  assert.equal(index.available, true);
  if (index.available) {
    assert.deepEqual(index.conversations[0]?.costEstimate, { currency: "USD", amount: 0.003 });
    assert.equal(index.conversations[0]?.hasUnpricedSettledRuns, true);
  }
});

test("conversation index status follows running work and unresolved attention", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Project compact conversation status",
    description: "Keep ordinary history quiet and exceptional work visible.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-conversation-status-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const conversationId = created.task.activations[0]?.conversationId;
  assert.ok(conversationId);

  const idle = application.queryTaskConversationIndex(created.task.id);
  assert.equal(idle.available, true);
  if (idle.available) assert.equal(idle.conversations[0]?.status, null);

  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  const running = application.queryTaskConversationIndex(created.task.id);
  assert.equal(running.available, true);
  if (running.available) assert.equal(running.conversations[0]?.status, "running");

  runtime.complete({
    status: "permission-blocked",
    summary: "The user must authorize the protected operation.",
    threadId: "conversation-status-thread",
  });
  await application.waitForAutomationIdle();
  const attention = application.queryTaskConversationIndex(created.task.id);
  assert.equal(attention.available, true);
  if (attention.available) assert.equal(attention.conversations[0]?.status, "needs-attention");
});
