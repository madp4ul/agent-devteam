import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRunLifecycle,
  type AgentRuntime,
  type AttemptTranscriptAccess,
  type AttemptTranscriptItem,
  type AttemptTokenUsage,
  type AutomationClock,
  CoordinationApplication,
} from "../../src/application/coordination-application.ts";

const execFileAsync = promisify(execFile);

test("continuing a conversation persists one authored message and activation idempotently", async (t) => {
  const fixture = await createFixture();
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
  if (conversation.available) assert.deepEqual(conversation.conversation.messages, [accepted.message]);

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
    assert.deepEqual(conversationAfterRestart.conversation.messages, [accepted.message]);
    assert.equal(conversationAfterRestart.conversation.runs.length, 1);
  }
});

test("a follow-up resumes the owning agent's thread and existing task workspace in activation order", async (t) => {
  const fixture = await createFixture();
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
    assert.equal(conversation.conversation.runs.at(-1)?.sourceMessageId, continued.message.id);
    assert.equal(conversation.conversation.runs.at(-1)?.attempt.threadContinuity, "replaced");
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
  const fixture = await createFixture();
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

  const initial = application.queryTaskConversationIndex(created.task.id);
  assert.equal(initial.available, true);
  if (!initial.available) return;
  assert.deepEqual(initial.conversations.map(({ id, label }) => ({ id, label })), [
    { id: secondConversationId, label: secondRequest },
    { id: firstConversationId, label: "Index agent conversations" },
  ]);
  assert.deepEqual(Object.keys(initial.conversations[0]!).sort(), [
    "continuation",
    "id",
    "label",
    "latestActivityAt",
    "owningAgent",
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

test("an agent comment and move hand work to the next watched-column agent", async (t) => {
  const fixture = await createFixture();
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
    title: "Complete the handoff",
    description: "Leave an implementation note and move the task to review.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-handoff-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  const implementation = await runtime.waitForRequest(1);
  assert.equal(implementation.agent.id, "implementer");
  assert.deepEqual(
    { model: implementation.agent.model, reasoningEffort: implementation.agent.reasoningEffort },
    { model: "gpt-5.6-sol", reasoningEffort: "medium" },
  );
  assert.equal(implementation.process.guidance, "Keep every handoff explicit.");
  assert.equal(implementation.board.guidance, "Move completed work to review.");
  assert.deepEqual(
    implementation.collaborators.map((agent) => ({ id: agent.id, summary: agent.summary })),
    [
      { id: "implementer", summary: "Builds the requested change." },
      { id: "reviewer", summary: "Reviews completed changes." },
    ],
  );
  assert.deepEqual(implementation.task.comments, []);
  assert.deepEqual(implementation.task.relationships, []);
  assert.deepEqual(implementation.attempt, {
    number: 1,
    precedingOutcome: null,
    thread: "fresh",
    continuationMessage: null,
  });

  const comment = application.addTaskComment({
    taskId: created.task.id,
    body: "Implementation is complete and the focused tests pass.",
    actor: { kind: "agent", id: "implementer" },
    attemptId: implementation.attemptId,
    idempotencyKey: "implementation-comment",
  });
  assert.equal(comment.accepted, true);
  if (!comment.accepted) return;
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: comment.task.revision,
    actor: { kind: "agent", id: "implementer" },
    attemptId: implementation.attemptId,
    idempotencyKey: "implementation-to-review",
  });
  assert.equal(moved.accepted, true);

  runtime.complete({
    status: "completed",
    summary: "Commented and handed the task to review.",
    threadId: "thread-implementation",
  });
  const review = await runtime.waitForRequest(2);
  assert.equal(review.agent.id, "reviewer");
  assert.deepEqual(
    { model: review.agent.model, reasoningEffort: review.agent.reasoningEffort },
    { model: "gpt-5.6-terra", reasoningEffort: "high" },
  );
  assert.equal(review.task.columnId, "review");
  assert.equal(review.task.comments[0]?.attemptId, implementation.attemptId);
  assert.equal(
    review.task.activity.find((event) => event.type === "task.moved")?.details.attemptId,
    implementation.attemptId,
  );
  assert.deepEqual(
    review.task.comments.map((entry) => ({ body: entry.body, actor: entry.actor })),
    [
      {
        body: "Implementation is complete and the focused tests pass.",
        actor: { kind: "agent", id: "implementer" },
      },
    ],
  );
  assert.doesNotMatch(
    review.task.activity.map((event) => event.type).join(" "),
    /comment/,
  );
  const duringReview = application.queryTask(created.task.id);
  assert.equal(duringReview.available, true);
  if (duringReview.available) {
    assert.equal(duringReview.task.activations[0]?.status, "completed");
    assert.equal(duringReview.task.activations[0]?.attempts[0]?.threadId, "thread-implementation");
    assert.equal(duringReview.task.activations[1]?.status, "running");
    assert.ok(duringReview.task.activations[0]?.conversationId);
    assert.ok(duringReview.task.activations[1]?.conversationId);
    assert.notEqual(
      duringReview.task.activations[0]?.conversationId,
      duringReview.task.activations[1]?.conversationId,
    );
  }

  runtime.complete({
    status: "completed",
    summary: "Review complete.",
    threadId: "thread-review",
  });
  await application.waitForAutomationIdle();
});

test("a finished attempt transcript remains inspectable after application restart", async (t) => {
  const fixture = await createFixture();
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
    assert.deepEqual(conversation.conversation.runs, [{
      activationId: activation.id,
      attempt: activation.attempts[0],
      transcript: {
        available: true,
        items: expectedTranscript,
        usage: expectedUsage,
      },
    }]);
  }
  assert.deepEqual(await application.queryAgentConversation("T-9999", conversationId), {
    available: false,
    reason: "not-found",
  });
  application.close();

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
  });
  assert.deepEqual(
    await restarted.queryAgentConversation(created.task.id, conversationId),
    conversation,
  );
});

test("a streamed Codex failure remains inspectable while its retry waits at the queue head", async (t) => {
  const fixture = await createFixture();
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

test("agent command idempotency replays stay scoped to the current task", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const first = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "First scoped task",
    description: "Never expose this task through another task's replay.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-first-scoped-task",
  });
  const second = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Second scoped task",
    description: "Reuse the agent's natural idempotency key safely.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-second-scoped-task",
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;

  const firstComment = application.addTaskComment({
    taskId: first.task.id,
    body: "First task comment",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "comment-on-current-task",
  });
  const secondComment = application.addTaskComment({
    taskId: second.task.id,
    body: "Second task comment",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "comment-on-current-task",
  });
  assert.equal(firstComment.accepted, true);
  assert.equal(secondComment.accepted, true);
  if (firstComment.accepted && secondComment.accepted) {
    assert.equal(firstComment.task.id, first.task.id);
    assert.equal(secondComment.task.id, second.task.id);
  }

  const firstMove = application.moveTask({
    taskId: first.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "move-current-task-to-review",
  });
  const secondMove = application.moveTask({
    taskId: second.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "move-current-task-to-review",
  });
  assert.equal(firstMove.accepted, true);
  assert.equal(secondMove.accepted, true);
  if (firstMove.accepted && secondMove.accepted) {
    assert.equal(firstMove.task.id, first.task.id);
    assert.equal(secondMove.task.id, second.task.id);
  }
});

class ControlledAgentRuntime implements AgentRuntime, AttemptTranscriptAccess {
  readonly requests: AgentRunRequest[] = [];
  readonly #transcripts = new Map<string, AttemptTranscriptItem[]>();
  readonly #usage = new Map<string, AttemptTokenUsage>();
  #complete: ((outcome: AgentRunOutcome) => void) | undefined;
  readonly #waiters: Array<{
    count: number;
    resolve: (request: AgentRunRequest) => void;
  }> = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started();
    for (const waiter of this.#waiters.splice(0)) {
      const matching = this.requests[waiter.count - 1];
      if (matching !== undefined) waiter.resolve(matching);
      else this.#waiters.push(waiter);
    }
    return new Promise((resolve) => {
      this.#complete = resolve;
    });
  }

  waitForRequest(count: number): Promise<AgentRunRequest> {
    const existing = this.requests[count - 1];
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve) => this.#waiters.push({ count, resolve }));
  }

  complete(outcome: AgentRunOutcome): void {
    assert.ok(this.#complete);
    this.#complete(outcome);
    this.#complete = undefined;
  }

  setTranscript(attemptId: string, transcript: AttemptTranscriptItem[]): void {
    this.#transcripts.set(attemptId, structuredClone(transcript));
  }

  setUsage(attemptId: string, usage: AttemptTokenUsage): void {
    this.#usage.set(attemptId, structuredClone(usage));
  }

  async read(attemptId: string): Promise<AttemptTranscriptItem[] | null> {
    const transcript = this.#transcripts.get(attemptId);
    return transcript === undefined ? null : structuredClone(transcript);
  }

  async readUsage(attemptId: string): Promise<AttemptTokenUsage | null> {
    return this.#usage.get(attemptId) ?? null;
  }
}

class PausedRetryClock implements AutomationClock {
  now(): Date {
    return new Date("2026-01-01T12:00:00.000Z");
  }

  waitUntil(): Promise<void> {
    return new Promise(() => {});
  }
}

async function createFixture(): Promise<{
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
  implementerInstructionsPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-handoff-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Test project\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C",
    repositoryPath,
    "-c",
    "user.name=Coordination Test",
    "-c",
    "user.email=coordination@example.invalid",
    "commit",
    "-m",
    "Initial commit",
  ]);
  const implementerInstructionsPath = join(directory, "implementer.md");
  await writeFile(implementerInstructionsPath, "Implement and hand off the task.\n");
  await writeFile(join(directory, "reviewer.md"), "Review the completed implementation.\n");
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Handoff process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep every handoff explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tasks
    summary: Builds the requested change.
    instructions: ./implementer.md
    model: gpt-5.6-sol
    reasoningEffort: medium
  - id: reviewer
    name: Code Reviewer
    role: Reviews implementations
    summary: Reviews completed changes.
    instructions: ./reviewer.md
    model: gpt-5.6-terra
    reasoningEffort: high
boards:
  - id: delivery
    name: Delivery
    guidance: Move completed work to review.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
    implementerInstructionsPath,
  };
}
