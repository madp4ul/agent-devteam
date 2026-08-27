import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";

import {
  aggregateTokenCosts,
  calculateAttemptTokenCost,
} from "../../src/application/token-cost.ts";
import {
  attemptUsageFixture,
  modelPricingFixture,
} from "../support/conversation-feature-fixtures.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";

async function startPricedConversationFixture(
  t: TestContext,
  options: {
    rates: Array<{ model: string; usdPerMillionTokens: number }>;
    title: string;
    description: string;
    idempotencyKey: string;
    cleanup?: boolean;
  },
) {
  const fixture = await createHandoffFixture();
  const pricing = options.rates.map(({ model, usdPerMillionTokens }) => `  - model: ${model}
    usdPerMillionTokens:
      input: ${usdPerMillionTokens}
      cachedInput: ${usdPerMillionTokens}
      cacheWriteInput: ${usdPerMillionTokens}
      output: ${usdPerMillionTokens}`).join("\n");
  await writeFile(
    fixture.definitionPath,
    (await readFile(fixture.definitionPath, "utf8")).replace(
      "agents:\n",
      `modelPricing:\n${pricing}\nagents:\n`,
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
  if (options.cleanup !== false) t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: options.title,
    description: options.description,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: options.idempotencyKey,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected the priced conversation task to be created.");
  const conversationId = created.task.activations[0]?.conversationId;
  assert.ok(conversationId);
  return { application, conversationId, created, fixture, runtime };
}

test("attempt cost bills ordinary input after cached and cache-write input exactly once", () => {
  assert.deepEqual(
    calculateAttemptTokenCost(
      attemptUsageFixture({
        inputTokens: 1_000,
        cachedInputTokens: 200,
        cacheWriteInputTokens: 300,
        outputTokens: 400,
        reasoningOutputTokens: 50,
      }),
      {
        usdPerMillionTokens: {
          input: 10,
          cachedInput: 2,
          cacheWriteInput: 4,
          output: 20,
        },
      },
    ),
    {
      costEstimate: { currency: "USD", amount: 0.0146 },
      costBreakdown: {
        categories: [
          { category: "input", tokens: 500, usdPerMillionTokens: 10 },
          { category: "cachedInput", tokens: 200, usdPerMillionTokens: 2 },
          { category: "cacheWriteInput", tokens: 300, usdPerMillionTokens: 4 },
          { category: "output", tokens: 400, usdPerMillionTokens: 20 },
        ],
        reasoningOutputTokens: 50,
      },
    },
  );
});

test("cost aggregation excludes running attempts and preserves pending and lower-bound facts", () => {
  assert.deepEqual(
    aggregateTokenCosts([
      {
        status: "settled",
        costEstimate: { currency: "USD", amount: 0.1 },
        costBreakdown: {
          categories: [{ category: "input", tokens: 10, usdPerMillionTokens: 1 }],
          reasoningOutputTokens: 2,
        },
      },
      { status: "settled" },
      { status: "running", priceable: true },
    ]),
    {
      costEstimate: { currency: "USD", amount: 0.1 },
      costBreakdown: {
        categories: [{ category: "input", tokens: 10, usdPerMillionTokens: 1 }],
        reasoningOutputTokens: 2,
      },
      costPending: true,
      hasUnpricedSettledRuns: true,
    },
  );
});

test("attempt cost rejects malformed and internally inconsistent usage", () => {
  const pricing = modelPricingFixture(1);
  const valid = {
    inputTokens: 10,
    cachedInputTokens: 2,
    cacheWriteInputTokens: 3,
    outputTokens: 4,
    reasoningOutputTokens: 1,
  };
  const invalidUsages = [
    { ...valid, inputTokens: -1 },
    { ...valid, cachedInputTokens: Number.NaN },
    { ...valid, cacheWriteInputTokens: Number.POSITIVE_INFINITY },
    { ...valid, outputTokens: 0.5 },
    { ...valid, reasoningOutputTokens: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, inputTokens: 4 },
  ];

  for (const usage of invalidUsages) {
    assert.equal(calculateAttemptTokenCost(usage, pricing), undefined);
  }
});

test("compact aggregation groups only matching categories and historical rates", () => {
  assert.deepEqual(
    aggregateTokenCosts([
      {
        status: "settled",
        costEstimate: { currency: "USD", amount: 0.1 },
        costBreakdown: {
          categories: [
            { category: "input", tokens: 10, usdPerMillionTokens: 1 },
            { category: "output", tokens: 20, usdPerMillionTokens: 2 },
          ],
          reasoningOutputTokens: 3,
        },
      },
      {
        status: "settled",
        costEstimate: { currency: "USD", amount: 0.2 },
        costBreakdown: {
          categories: [
            { category: "input", tokens: 30, usdPerMillionTokens: 1 },
            { category: "input", tokens: 40, usdPerMillionTokens: 4 },
          ],
          reasoningOutputTokens: 5,
        },
      },
    ], { compactBreakdown: true }),
    {
      costEstimate: { currency: "USD", amount: 0.3 },
      costBreakdown: {
        categories: [
          { category: "input", tokens: 40, usdPerMillionTokens: 1 },
          { category: "output", tokens: 20, usdPerMillionTokens: 2 },
          { category: "input", tokens: 40, usdPerMillionTokens: 4 },
        ],
        reasoningOutputTokens: 8,
      },
      costPending: false,
      hasUnpricedSettledRuns: false,
    },
  );
});

test("cost aggregation does not publish a total that exceeds finite numeric bounds", () => {
  assert.deepEqual(
    aggregateTokenCosts([
      { status: "settled", costEstimate: { currency: "USD", amount: Number.MAX_VALUE } },
      { status: "settled", costEstimate: { currency: "USD", amount: Number.MAX_VALUE } },
    ]),
    {
      costPending: false,
      hasUnpricedSettledRuns: true,
    },
  );
});

test("a completed attempt retains its snapshotted price after process pricing changes", async (t) => {
  const { application, conversationId, created, fixture, runtime } = await startPricedConversationFixture(t, {
    rates: [{ model: "gpt-5.6-sol", usdPerMillionTokens: 1 }],
    title: "Retain the completed attempt price",
    description: "Keep historical cost truthful after process edits.",
    idempotencyKey: "create-snapshotted-price-task",
    cleanup: false,
  });
  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  runtime.setTranscript(request.attemptId, []);
  runtime.setUsage(request.attemptId, attemptUsageFixture());
  runtime.complete({ status: "completed", summary: "Price snapshotted.", threadId: "price-snapshot-thread" });
  await application.waitForAutomationIdle();
  application.close();

  await writeFile(
    fixture.definitionPath,
    (await readFile(fixture.definitionPath, "utf8")).replace("      input: 1\n", "      input: 50\n"),
  );
  const restartedRuntime = new ControlledAgentRuntime();
  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: restartedRuntime,
    },
    transcriptAccess: restartedRuntime,
  });
  t.after(() => restarted.close());
  const conversation = await restarted.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.deepEqual(conversation.conversation.costEstimate, { currency: "USD", amount: 0.001 });
  }

  const continued = restarted.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Continue after the configured price changes.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-after-price-change",
  });
  assert.equal(continued.accepted, true);
  await restarted.resumeAutomation();
  const second = await restartedRuntime.waitForRequest(1);
  restartedRuntime.setTranscript(second.attemptId, []);
  restartedRuntime.setUsage(second.attemptId, attemptUsageFixture({ inputTokens: 3_000 }));
  restartedRuntime.complete({ status: "completed", summary: "New price snapshotted.", threadId: "price-snapshot-thread" });
  await restarted.waitForAutomationIdle();

  const repricedConversation = await restarted.queryAgentConversation(created.task.id, conversationId);
  assert.equal(repricedConversation.available, true);
  if (repricedConversation.available) {
    assert.deepEqual(repricedConversation.conversation.costEstimate, { currency: "USD", amount: 0.101 });
    assert.deepEqual(repricedConversation.conversation.costBreakdown, {
      categories: [
        { category: "input", tokens: 1_000, usdPerMillionTokens: 1 },
        { category: "cachedInput", tokens: 0, usdPerMillionTokens: 1 },
        { category: "cacheWriteInput", tokens: 0, usdPerMillionTokens: 1 },
        { category: "output", tokens: 0, usdPerMillionTokens: 1 },
        { category: "input", tokens: 2_000, usdPerMillionTokens: 50 },
      ],
      reasoningOutputTokens: 0,
    });
  }
});

test("conversation cost totals preserve the known subtotal when a settled run has no usage", async (t) => {
  const { application, conversationId, created, runtime } = await startPricedConversationFixture(t, {
    rates: [{ model: "gpt-5.6-sol", usdPerMillionTokens: 1 }],
    title: "Compare complete conversation costs",
    description: "Preserve known cost without overstating completeness.",
    idempotencyKey: "create-cost-total-task",
  });

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

  const fourthMessage = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Report a later cumulative checkpoint under the same price.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "recover-conversation-cost-from-checkpoint",
  });
  assert.equal(fourthMessage.accepted, true);
  const fourth = await runtime.waitForRequest(4);
  runtime.setTranscript(fourth.attemptId, []);
  runtime.setUsage(fourth.attemptId, {
    inputTokens: 6_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  });
  runtime.complete({ status: "completed", summary: "Later cumulative checkpoint.", threadId: "cost-thread" });
  await application.waitForAutomationIdle();

  assert.deepEqual(await application.queryAttemptTranscript(fourth.attemptId), {
    available: true,
    threadId: "cost-thread",
    items: [],
  });
  const recovered = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(recovered.available, true);
  if (recovered.available) {
    assert.deepEqual(recovered.conversation.costEstimate, { currency: "USD", amount: 0.006 });
    assert.deepEqual(recovered.conversation.costBreakdown, {
      categories: [
        { category: "input", tokens: 6_000, usdPerMillionTokens: 1 },
        { category: "cachedInput", tokens: 0, usdPerMillionTokens: 1 },
        { category: "cacheWriteInput", tokens: 0, usdPerMillionTokens: 1 },
        { category: "output", tokens: 0, usdPerMillionTokens: 1 },
      ],
      reasoningOutputTokens: 0,
    });
    assert.equal(recovered.conversation.hasUnpricedSettledRuns, false);
  }
});

test("continued turns price cumulative Codex usage snapshots exactly once", async (t) => {
  const { application, conversationId, created, runtime } = await startPricedConversationFixture(t, {
    rates: [{ model: "gpt-5.6-sol", usdPerMillionTokens: 1 }],
    title: "Price continued cumulative usage",
    description: "Count each metered model-call token exactly once.",
    idempotencyKey: "create-turn-local-cost-task",
  });

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  runtime.setTranscript(first.attemptId, []);
  runtime.setUsage(first.attemptId, {
    inputTokens: 50_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  });
  runtime.complete({ status: "completed", summary: "First turn.", threadId: "turn-local-cost-thread" });
  await application.waitForAutomationIdle();

  const continued = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Continue with the preceding context cached.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-turn-local-cost-task",
  });
  assert.equal(continued.accepted, true);
  const second = await runtime.waitForRequest(2);
  runtime.setTranscript(second.attemptId, []);
  runtime.setUsage(second.attemptId, {
    inputTokens: 150_000,
    cachedInputTokens: 50_000,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  });
  runtime.complete({ status: "completed", summary: "Continued turn.", threadId: "turn-local-cost-thread" });
  await application.waitForAutomationIdle();

  assert.deepEqual(await application.queryAttemptTranscript(second.attemptId), {
    available: true,
    threadId: "turn-local-cost-thread",
    items: [],
    usage: {
      inputTokens: 100_000,
      cachedInputTokens: 50_000,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
    costEstimate: { currency: "USD", amount: 0.1 },
    costBreakdown: {
      categories: [
        { category: "input", tokens: 50_000, usdPerMillionTokens: 1 },
        { category: "cachedInput", tokens: 50_000, usdPerMillionTokens: 1 },
        { category: "cacheWriteInput", tokens: 0, usdPerMillionTokens: 1 },
        { category: "output", tokens: 0, usdPerMillionTokens: 1 },
      ],
      reasoningOutputTokens: 0,
    },
  });
  const conversation = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.deepEqual(conversation.conversation.costEstimate, { currency: "USD", amount: 0.15 });
    assert.deepEqual(conversation.conversation.costBreakdown, {
      categories: [
        { category: "input", tokens: 100_000, usdPerMillionTokens: 1 },
        { category: "cachedInput", tokens: 50_000, usdPerMillionTokens: 1 },
        { category: "cacheWriteInput", tokens: 0, usdPerMillionTokens: 1 },
        { category: "output", tokens: 0, usdPerMillionTokens: 1 },
      ],
      reasoningOutputTokens: 0,
    });
  }

  const replacement = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Continue after Codex replaces the unusable thread.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "replace-turn-local-cost-thread",
  });
  assert.equal(replacement.accepted, true);
  const third = await runtime.waitForRequest(3);
  runtime.setTranscript(third.attemptId, []);
  runtime.setUsage(third.attemptId, {
    inputTokens: 20_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  });
  runtime.complete({
    status: "completed",
    summary: "Replacement thread turn.",
    threadId: "replacement-cost-thread",
    threadContinuity: "replaced",
  });
  await application.waitForAutomationIdle();

  const withReplacement = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(withReplacement.available, true);
  if (withReplacement.available) {
    assert.deepEqual(withReplacement.conversation.costEstimate, { currency: "USD", amount: 0.17 });
    assert.deepEqual(withReplacement.conversation.costBreakdown, {
      categories: [
        { category: "input", tokens: 120_000, usdPerMillionTokens: 1 },
        { category: "cachedInput", tokens: 50_000, usdPerMillionTokens: 1 },
        { category: "cacheWriteInput", tokens: 0, usdPerMillionTokens: 1 },
        { category: "output", tokens: 0, usdPerMillionTokens: 1 },
      ],
      reasoningOutputTokens: 0,
    });
  }
});

test("conversation context fill follows the latest Codex thread and survives restart", async (t) => {
  const { application, conversationId, created, fixture, runtime } = await startPricedConversationFixture(t, {
    rates: [{ model: "gpt-5.6-sol", usdPerMillionTokens: 1 }],
    title: "Show current conversation context fill",
    description: "Retain the active Codex context measurement.",
    idempotencyKey: "create-context-fill-task",
    cleanup: false,
  });

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  runtime.setTranscript(first.attemptId, []);
  runtime.setContextWindowUsage(first.attemptId, {
    usedTokens: 132_000,
    contextWindowTokens: 258_400,
    usedPercent: 49,
  });
  runtime.complete({ status: "completed", summary: "First thread measured.", threadId: "first-context-thread" });
  await application.waitForAutomationIdle();

  const continued = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Continue after Codex replaces the thread.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "replace-context-fill-thread",
  });
  assert.equal(continued.accepted, true);
  const second = await runtime.waitForRequest(2);
  runtime.setTranscript(second.attemptId, []);
  runtime.setContextWindowUsage(second.attemptId, {
    usedTokens: 36_640,
    contextWindowTokens: 258_400,
    usedPercent: 10,
  });
  runtime.complete({
    status: "completed",
    summary: "Replacement thread measured.",
    threadId: "replacement-context-thread",
    threadContinuity: "replaced",
  });
  await application.waitForAutomationIdle();
  application.close();

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restarted.close());
  const conversation = await restarted.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.deepEqual(conversation.conversation.contextWindowUsage, {
      usedTokens: 36_640,
      contextWindowTokens: 258_400,
      usedPercent: 10,
    });
  }
});

test("complete task detail owns the conversation cost summary", async (t) => {
  const {
    application,
    conversationId: implementerConversationId,
    created,
    runtime,
  } = await startPricedConversationFixture(t, {
    rates: [
      { model: "gpt-5.6-sol", usdPerMillionTokens: 1 },
      { model: "gpt-5.6-terra", usdPerMillionTokens: 2 },
    ],
    title: "Project authoritative task costs",
    description: "Present all conversation costs from the complete task projection.",
    idempotencyKey: "create-task-cost-summary",
  });
  const consulted = application.addTaskComment({
    taskId: created.task.id,
    body: "@reviewer inspect the projected costs independently.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "consult-reviewer-for-task-costs",
  });
  assert.equal(consulted.accepted, true);
  if (!consulted.accepted) return;

  const beforeUsage = application.queryUserTaskDetail(created.task.id);
  await t.test("omits a summary when conversations have no available or pending cost", () => {
    assert.equal(beforeUsage.available, true);
    if (!beforeUsage.available) return;
    assert.equal(beforeUsage.conversations.length, 2);
    assert.equal(beforeUsage.conversationCost, undefined);
  });

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  const firstRunning = application.queryUserTaskDetail(created.task.id);
  await t.test("projects pending zero for a first priceable running attempt", () => {
    assert.equal(firstRunning.available, true);
    if (!firstRunning.available) return;
    assert.deepEqual(firstRunning.conversationCost, {
      costPending: true,
      hasUnpricedSettledRuns: false,
    });
  });
  runtime.setTranscript(first.attemptId, []);
  runtime.setUsage(first.attemptId, {
    inputTokens: 1_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 10,
  });
  runtime.complete({ status: "completed", summary: "Implementation priced.", threadId: "task-cost-implementation" });

  const second = await runtime.waitForRequest(2);
  runtime.setTranscript(second.attemptId, []);
  runtime.setUsage(second.attemptId, {
    inputTokens: 2_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 20,
  });
  runtime.complete({ status: "completed", summary: "Review priced.", threadId: "task-cost-review" });
  await application.waitForAutomationIdle();

  const continued = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId: implementerConversationId,
    body: "Add a second priced implementation pass.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "second-priced-task-cost-run",
  });
  assert.equal(continued.accepted, true);
  const third = await runtime.waitForRequest(3);
  runtime.setTranscript(third.attemptId, []);
  runtime.setUsage(third.attemptId, {
    inputTokens: 4_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 40,
  });
  runtime.complete({ status: "completed", summary: "Second implementation priced.", threadId: "task-cost-implementation" });
  await application.waitForAutomationIdle();

  const settled = application.queryUserTaskDetail(created.task.id);
  await t.test("groups equal category rates without erasing historical rate changes", () => {
    assert.equal(settled.available, true);
    if (!settled.available) return;
    assert.deepEqual(settled.conversationCost, {
      costEstimate: { currency: "USD", amount: 0.008 },
      costBreakdown: {
        categories: [
          { category: "input", tokens: 4_000, usdPerMillionTokens: 1 },
          { category: "cachedInput", tokens: 0, usdPerMillionTokens: 1 },
          { category: "cacheWriteInput", tokens: 0, usdPerMillionTokens: 1 },
          { category: "output", tokens: 0, usdPerMillionTokens: 1 },
          { category: "input", tokens: 2_000, usdPerMillionTokens: 2 },
          { category: "cachedInput", tokens: 0, usdPerMillionTokens: 2 },
          { category: "cacheWriteInput", tokens: 0, usdPerMillionTokens: 2 },
          { category: "output", tokens: 0, usdPerMillionTokens: 2 },
        ],
        reasoningOutputTokens: 60,
      },
      costPending: false,
      hasUnpricedSettledRuns: false,
    });
    assert.deepEqual(
      settled.conversations.map(({ costEstimate }) => costEstimate?.amount),
      [0.004, 0.004],
    );
  });

  const unavailable = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId: implementerConversationId,
    body: "Finish without usable cost evidence.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "unavailable-task-cost-run",
  });
  assert.equal(unavailable.accepted, true);
  await runtime.waitForRequest(4);
  runtime.complete({ status: "completed", summary: "Usage unavailable.", threadId: "task-cost-implementation" });
  await application.waitForAutomationIdle();

  const lowerBound = application.queryUserTaskDetail(created.task.id);
  await t.test("retains the known-cost lower bound when settled usage is unavailable", () => {
    assert.equal(lowerBound.available, true);
    if (lowerBound.available) {
      assert.deepEqual(lowerBound.conversationCost?.costEstimate, { currency: "USD", amount: 0.008 });
      assert.equal(lowerBound.conversationCost?.hasUnpricedSettledRuns, true);
    }
  });
});

test("process cost statistics aggregate retained tasks without repricing history", async (t) => {
  const {
    application,
    conversationId: firstConversationId,
    created: firstTask,
    fixture,
    runtime,
  } = await startPricedConversationFixture(t, {
    rates: [
      { model: "gpt-5.6-sol", usdPerMillionTokens: 1 },
      { model: "gpt-5.6-terra", usdPerMillionTokens: 2 },
    ],
    title: "Retain project cost history",
    description: "Aggregate both agent conversations after archival.",
    idempotencyKey: "create-retained-project-cost-task",
    cleanup: false,
  });
  const review = application.addTaskComment({
    taskId: firstTask.task.id,
    body: "@reviewer contribute an independent priced conversation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "add-project-cost-review-conversation",
  });
  assert.equal(review.accepted, true);

  await application.resumeAutomation();
  const implementationRun = await runtime.waitForRequest(1);
  runtime.setTranscript(implementationRun.attemptId, []);
  runtime.setUsage(implementationRun.attemptId, attemptUsageFixture({ inputTokens: 1_000 }));
  runtime.complete({ status: "completed", summary: "Implementation priced.", threadId: "project-cost-implementation" });
  const reviewRun = await runtime.waitForRequest(2);
  runtime.setTranscript(reviewRun.attemptId, []);
  runtime.setUsage(reviewRun.attemptId, attemptUsageFixture({ inputTokens: 2_000 }));
  runtime.complete({ status: "completed", summary: "Review priced.", threadId: "project-cost-review" });
  await application.waitForAutomationIdle();

  const currentFirstTask = application.queryTaskInspectionForUser(firstTask.task.id);
  assert.equal(currentFirstTask.available, true);
  if (!currentFirstTask.available) return;
  const completed = application.moveTask({
    taskId: firstTask.task.id,
    destinationColumnId: "completion",
    expectedRevision: currentFirstTask.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-retained-project-cost-task",
  });
  assert.equal(completed.accepted, true);
  const archived = await application.archiveTask({
    taskId: firstTask.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "archive-retained-project-cost-task",
  });
  assert.equal(archived.accepted, true);
  const unarchived = application.unarchiveTask({
    taskId: firstTask.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "unarchive-retained-project-cost-task",
  });
  assert.equal(unarchived.accepted, true);
  const unarchivedConversation = await application.queryAgentConversation(
    firstTask.task.id,
    firstConversationId,
  );
  assert.equal(unarchivedConversation.available, true);
  if (unarchivedConversation.available) {
    assert.equal(unarchivedConversation.conversation.currentThreadId, "project-cost-implementation");
    assert.deepEqual(unarchivedConversation.conversation.continuation, { available: true });
  }
  const resumedAfterArchive = application.continueAgentConversation({
    taskId: firstTask.task.id,
    conversationId: firstConversationId,
    body: "Continue the retained thread without counting its cumulative checkpoint twice.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-retained-project-cost-thread",
  });
  assert.equal(resumedAfterArchive.accepted, true);
  const resumedRun = await runtime.waitForRequest(3);
  assert.equal(resumedRun.resumeThreadId, "project-cost-implementation");
  runtime.setTranscript(resumedRun.attemptId, []);
  runtime.setUsage(resumedRun.attemptId, attemptUsageFixture({ inputTokens: 1_500 }));
  runtime.complete({
    status: "completed",
    summary: "Archived thread continued.",
    threadId: "project-cost-implementation",
  });
  await application.waitForAutomationIdle();
  const rearchived = await application.archiveTask({
    taskId: firstTask.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "rearchive-retained-project-cost-task",
  });
  assert.equal(rearchived.accepted, true);
  const unarchivedAgain = application.unarchiveTask({
    taskId: firstTask.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "unarchive-retained-review-cost-thread",
  });
  assert.equal(unarchivedAgain.accepted, true);
  const taskAfterRearchive = application.queryUserTaskDetail(firstTask.task.id);
  assert.equal(taskAfterRearchive.available, true);
  if (!taskAfterRearchive.available) return;
  const reviewerConversationId = taskAfterRearchive.conversations.find(
    ({ owningAgent }) => owningAgent.id === "reviewer",
  )?.id;
  assert.ok(reviewerConversationId);
  const resumedReview = application.continueAgentConversation({
    taskId: firstTask.task.id,
    conversationId: reviewerConversationId,
    body: "Continue the untouched retained review thread without recounting its checkpoint.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-retained-review-cost-thread",
  });
  assert.equal(resumedReview.accepted, true);
  const resumedReviewRun = await runtime.waitForRequest(4);
  assert.equal(resumedReviewRun.resumeThreadId, "project-cost-review");
  runtime.setTranscript(resumedReviewRun.attemptId, []);
  runtime.setUsage(resumedReviewRun.attemptId, attemptUsageFixture({ inputTokens: 2_500 }));
  runtime.complete({
    status: "completed",
    summary: "Untouched archived review thread continued.",
    threadId: "project-cost-review",
  });
  await application.waitForAutomationIdle();
  const archivedAgain = await application.archiveTask({
    taskId: firstTask.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "archive-retained-review-cost-thread",
  });
  assert.equal(archivedAgain.accepted, true);
  application.close();

  const source = await readFile(fixture.definitionPath, "utf8");
  await writeFile(
    fixture.definitionPath,
    source
      .replaceAll("input: 1\n", "input: 10\n")
      .replaceAll("cachedInput: 1\n", "cachedInput: 10\n")
      .replaceAll("cacheWriteInput: 1\n", "cacheWriteInput: 10\n")
      .replaceAll("output: 1\n", "output: 10\n")
      .replaceAll("input: 2\n", "input: 20\n")
      .replaceAll("cachedInput: 2\n", "cachedInput: 20\n")
      .replaceAll("cacheWriteInput: 2\n", "cacheWriteInput: 20\n")
      .replaceAll("output: 2\n", "output: 20\n"),
  );
  const restartedRuntime = new ControlledAgentRuntime();
  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: restartedRuntime,
    },
    transcriptAccess: restartedRuntime,
  });
  t.after(() => restarted.close());
  const secondTask = restarted.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Add current-rate project cost",
    description: "Contribute cost at the newly configured rate.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-current-project-cost-task",
  });
  assert.equal(secondTask.accepted, true);
  const unpricedTask = restarted.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Retain unknown settled usage",
    description: "Keep the known project total as a lower bound.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-unpriced-project-cost-task",
  });
  assert.equal(unpricedTask.accepted, true);
  const pendingTask = restarted.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Expose pending project cost",
    description: "Keep running priceable work visibly pending.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-pending-project-cost-task",
  });
  assert.equal(pendingTask.accepted, true);

  await restarted.resumeAutomation();
  const currentRun = await restartedRuntime.waitForRequest(1);
  restartedRuntime.setTranscript(currentRun.attemptId, []);
  restartedRuntime.setUsage(currentRun.attemptId, attemptUsageFixture({ inputTokens: 3_000 }));
  restartedRuntime.complete({ status: "completed", summary: "Current rate priced.", threadId: "current-project-cost" });
  const unpricedRun = await restartedRuntime.waitForRequest(2);
  restartedRuntime.setTranscript(unpricedRun.attemptId, []);
  restartedRuntime.complete({ status: "completed", summary: "Usage unavailable.", threadId: "unpriced-project-cost" });
  await restartedRuntime.waitForRequest(3);

  assert.deepEqual(restarted.queryProcessCostStatistics(), {
    configuredModelPrices: [
      {
        model: "gpt-5.6-sol",
        usdPerMillionTokens: { input: 10, cachedInput: 10, cacheWriteInput: 10, output: 10 },
      },
      {
        model: "gpt-5.6-terra",
        usdPerMillionTokens: { input: 20, cachedInput: 20, cacheWriteInput: 20, output: 20 },
      },
    ],
    totalCostEstimate: { currency: "USD", amount: 0.0365 },
    contributingTaskCount: 2,
    averageCostPerContributingTask: { currency: "USD", amount: 0.01825 },
    costPending: true,
    hasUnpricedSettledRuns: true,
  });
});
