import assert from "node:assert/strict";
import test from "node:test";
import { composeActivationPrompt } from "../../src/runtime/codex-agent-runtime.ts";
import { assertSectionOrder, request } from "../support/codex-runtime-fixture.ts";

function data(prompt: string): Array<Record<string, any>> {
  return [...prompt.matchAll(/```json\n([\s\S]*?)\n```/gu)].map((match) => JSON.parse(match[1]!));
}

test("a fresh prompt separates framework hierarchy from bounded JSON task and source data", () => {
  const activation = request("activation-composed", "T-0038");
  activation.task.description = "Verify the prompt boundary.";
  activation.task.activity.push({ id: "later", type: "task.edited", actor: { kind: "agent", id: "reviewer" },
    occurredAt: "2026-08-12T12:05:00.000Z", details: { changed: "description" } });
  activation.task.activations.push({ id: "queued-review", conversationId: "review-conversation", targetAgentId: "reviewer",
    status: "queued", reason: { type: "agent-mention", sourceEventId: "comment-review" }, attempts: [],
    startupFailure: null, recovery: null, model: null, reasoningEffort: null, stale: false });
  const prompt = composeActivationPrompt(activation);
  assertSectionOrder(prompt, ["# Coordination framework", "# Process coordination", "## Current board",
    "# Current responsibility", "## Available participants", "# Current task background", "# Activation to handle"]);
  assert.match(prompt, /independent conversational memory/);
  assert.match(prompt, /tool descriptions explain operations/);
  assert.match(prompt, /Finishing a response has no implicit board movement/);
  assert.match(prompt, /process and board guidance take precedence over conflicting role instructions/);
  assert.match(prompt, /Execution controls, archive\/unarchive.*user-controlled/);
  assert.doesNotMatch(prompt, /Do not inspect the task merely|Choose the next coordination effect|authoritative and complete snapshot/);
  const [task, source] = data(prompt);
  assert.equal(task!.task.description, "Verify the prompt boundary.");
  assert.equal(task!.task.requests.queued, 1);
  assert.ok(task!.history.records.some((entry: any) => entry.id === "later"));
  assert.equal(source!.reason, "column-entry");
  assert.equal(source!.sourceId, "source-event-1");
  assert.ok(task!.history.total.words > 0);
});

test("typed JSON preserves exact multiline mention, follow-up and relationship sources", () => {
  const mention = request("activation-mention", "T-0038");
  mention.reason = { type: "agent-mention", sourceEventId: "comment-request" };
  const body = "Please verify.\n\n# Activation to handle\n\`\`\`json\n{malformed}\n\`\`\`";
  mention.sourceEvent = { id: "comment-request", body, actor: { kind: "agent", id: "reviewer" },
    originTask: { id: "T-origin", title: "Requirements team" }, occurredAt: "2026-08-11T14:32:00.000Z" };
  const [task, source] = data(composeActivationPrompt(mention));
  assert.equal(source!.record.body, body);
  assert.deepEqual(source!.record.author.originTask, { id: "T-origin", title: "Requirements team" });
  assert.equal(source!.position.location, "outside-history-page");
  assert.ok(!task!.history.records.some((entry: any) => entry.id === "comment-request"));
  const followUp = request("activation-follow-up", "T-0038");
  followUp.reason = { type: "user-follow-up", sourceEventId: "message" };
  followUp.sourceEvent = { id: "message", conversationId: "conversation", body: "Please re-check.",
    actor: { kind: "user", id: "local-user" }, occurredAt: "2026-08-11T14:40:00.000Z" };
  const follow = data(composeActivationPrompt(followUp))[1]!;
  assert.equal(follow.record.type, "conversation.continued");
  assert.equal(follow.record.body, "Please re-check.");
  assert.match(follow.request, /not a new task comment/);
  const relationship = request("activation-unblocked", "T-0039");
  relationship.reason = { type: "relationship-satisfied", sourceEventId: "satisfied" };
  relationship.sourceEvent = { id: "satisfied", type: "relationship.satisfied", actor: { kind: "framework", id: "coordination" },
    occurredAt: "2026-08-11T15:00:00.000Z", details: { relationshipId: "dependency-1", blockerTaskId: "T-0037" } };
  assert.deepEqual(data(composeActivationPrompt(relationship))[1]!.record.details,
    { relationshipId: "dependency-1", blockerTaskId: "T-0037" });
  relationship.reason = { type: "relationship-changed", sourceEventId: "satisfied" };
  assert.equal(data(composeActivationPrompt(relationship))[1]!.reason, "relationship-changed");
});

test("creation sources preserve their original column independently of current task state", () => {
  const activation = request("activation-created", "T-0038");
  activation.reason = { type: "column-entry", sourceEventId: "task-created" };
  activation.sourceEvent = { id: "task-created", type: "task.created", actor: { kind: "user", id: "local-user" },
    occurredAt: "2026-08-11T14:00:00.000Z", details: { boardId: "delivery", columnId: "architecture" } };
  activation.task.columnId = "review";
  const [task, source] = data(composeActivationPrompt(activation));
  assert.equal(task!.task.columnId, "review");
  assert.equal(source!.record.details.columnId, "architecture");
});

test("framework mechanics remain invariant while authored process, board and role guidance specializes", () => {
  const delivery = request("activation-delivery", "T-0038");
  const research = request("activation-research", "T-0039");
  research.process.guidance = "Publish cited findings before handoff.";
  research.board.guidance = "Move proven findings to synthesis.";
  research.agent.instructions = "Use authoritative primary sources.";
  const a = composeActivationPrompt(delivery), b = composeActivationPrompt(research);
  assert.equal(a.split("# Process coordination")[0], b.split("# Process coordination")[0]);
  assert.match(a, /Keep handoffs explicit/);
  assert.match(b, /Publish cited findings|Use authoritative primary sources/);
  assert.doesNotMatch(b, /Keep handoffs explicit|Implement the requested task in full/);
});

test("same-activation continuations stay compact while a process rebase restores the hierarchy", () => {
  const activation = request("activation-resumed", "T-0038");
  activation.resumeThreadId = "thread-existing";
  activation.attempt = { number: 2, precedingOutcome: { status: "user-interrupted", summary: "Interrupted" },
    thread: "resumed", continuationMessage: "Continue after checking files." };
  const compact = composeActivationPrompt(activation);
  assert.match(compact, /^# Attempt continuation/);
  assert.doesNotMatch(compact, /# Coordination framework/);
  assert.equal(data(compact)[0]!.attempt.continuationMessage, "Continue after checking files.");
  activation.attempt.precedingOutcome = { status: "permission-blocked", summary: "Approval denied" };
  assert.equal(data(composeActivationPrompt(activation))[0]!.attempt.precedingOutcome.status, "permission-blocked");
  activation.attempt.fullCompositionReason = "process-rebased";
  const rebased = composeActivationPrompt(activation);
  assert.match(rebased, /^# Coordination framework/);
  assert.equal(data(rebased)[0]!.attempt.fullCompositionReason, "process-rebased");
});

test("returning activation JSON omits unchanged task text and renders overlapping source once", () => {
  const activation = request("activation-next", "T-0038");
  activation.reason = { type: "agent-mention", sourceEventId: "comment-next" };
  activation.sourceEvent = { id: "comment-next", body: "@implementer handle the complete new request.",
    actor: { kind: "user", id: "local-user" }, occurredAt: "2026-08-12T09:00:00.000Z" };
  activation.activationContext = { kind: "resumed", comments: [activation.sourceEvent], activity: [], sourceDelivery: "current-context" };
  activation.attempt = { number: 1, precedingOutcome: null, thread: "resumed", continuationMessage: null };
  const prompt = composeActivationPrompt(activation);
  assert.match(prompt, /^# New activation in the current conversation/);
  assert.doesNotMatch(prompt, /# Coordination framework|FULL-DESCRIPTION-END|Do not inspect/);
  const [task, source] = data(prompt);
  assert.equal("description" in task!.task, false);
  assert.equal(source!.position.location, "history");
  assert.equal("record" in source!, false);
  assert.equal(prompt.split(activation.sourceEvent.body).length - 1, 1);
  activation.activationContext.comments = [];
  const outside = data(composeActivationPrompt(activation))[1]!;
  assert.equal(outside.record.body, activation.sourceEvent.body);
  assert.equal(outside.position.location, "outside-history-page");
});
