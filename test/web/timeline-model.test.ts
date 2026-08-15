import assert from "node:assert/strict";
import test from "node:test";

import type { ActivationView, TaskActivityView, TaskCommentView } from "../../src/application/coordination-contract.ts";
import { buildTimelineRecords } from "../../src/web/client/timeline-model.ts";

test("timeline groups explicit attempt work and orders top-level records by start", () => {
  const activation = activationWithAttempts();
  const comments: TaskCommentView[] = [
    {
      id: "agent-comment",
      body: "Implementation detail @reviewer",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-01-01T10:07:00.000Z",
      attemptId: "attempt-1",
    },
    {
      id: "user-comment",
      body: "Please also check the migration.",
      actor: { kind: "user", id: "paul" },
      occurredAt: "2026-01-01T10:06:00.000Z",
    },
  ];
  const activity: TaskActivityView[] = [
    activityEntry("attempt-started", "attempt.started", "2026-01-01T10:04:00.000Z", { attemptId: "attempt-1" }),
    activityEntry("move", "task.moved", "2026-01-01T10:05:00.000Z", {
      attemptId: "attempt-1",
      fromColumnId: "implementation",
      toColumnId: "review",
    }),
    activityEntry("relationship", "relationship.created", "2026-01-01T10:06:30.000Z", {
      attemptId: "attempt-1",
      relationshipType: "dependency",
      relationshipRole: "source",
      relatedTaskId: "prerequisite",
    }),
    activityEntry("activation", "activation.created", "2026-01-01T10:05:00.000Z", {}),
    activityEntry("attempt-completed", "attempt.completed", "2026-01-01T10:08:00.000Z", { attemptId: "attempt-1" }),
  ];

  const records = buildTimelineRecords(comments, activity, [activation]);

  assert.deepEqual(records.map((record) => record.kind), ["comment", "attempt"]);
  const attempt = records[1];
  assert.equal(attempt?.kind, "attempt");
  if (attempt?.kind !== "attempt") return;
  assert.deepEqual(
    attempt.content.map((content) => content.kind === "comment" ? content.comment.id : content.activity.id),
    ["agent-comment", "relationship", "move"],
  );
});

test("timeline preserves retries as separate backward-linked attempt records", () => {
  const records = buildTimelineRecords([], [], [activationWithAttempts(true)]);

  assert.equal(records.length, 2);
  assert.equal(records[0]?.kind, "attempt");
  assert.equal(records[1]?.kind, "attempt");
  if (records[0]?.kind !== "attempt" || records[1]?.kind !== "attempt") return;
  assert.equal(records[0].attempt.id, "attempt-2");
  assert.equal(records[0].number, 2);
  assert.equal(records[0].previousAttempt?.id, "attempt-1");
  assert.equal(records[1].previousAttempt, null);
});

test("timeline leaves unprovenanced agent comments standalone rather than guessing ownership", () => {
  const comment: TaskCommentView = {
    id: "legacy-agent-comment",
    body: "Authored outside a known attempt.",
    actor: { kind: "agent", id: "implementer" },
    occurredAt: "2026-01-01T10:05:00.000Z",
  };

  const records = buildTimelineRecords([comment], [], [activationWithAttempts()]);

  assert.deepEqual(records.map((record) => record.kind), ["comment", "attempt"]);
});

function activationWithAttempts(includeRetry = false): ActivationView {
  return {
    id: "activation-1",
    conversationId: "conversation-1",
    targetAgentId: "implementer",
    status: "completed",
    reason: { type: "column-entry", sourceEventId: "move-source" },
    attempts: [
      {
        id: "attempt-1",
        status: "failed",
        workspacePath: "C:/workspace",
        startedAt: "2026-01-01T10:04:00.000Z",
        completedAt: "2026-01-01T10:08:00.000Z",
        outcome: { status: "failed", summary: "First attempt failed." },
        threadId: "thread-1",
        model: null,
        reasoningEffort: null,
      },
      ...(includeRetry ? [{
        id: "attempt-2",
        status: "completed" as const,
        workspacePath: "C:/workspace",
        startedAt: "2026-01-01T10:09:00.000Z",
        completedAt: "2026-01-01T10:12:00.000Z",
        outcome: { status: "completed" as const, summary: "Retry succeeded." },
        threadId: "thread-1",
        model: null,
        reasoningEffort: null,
      }] : []),
    ],
    startupFailure: null,
    recovery: null,
    model: null,
    reasoningEffort: null,
    stale: false,
  };
}

function activityEntry(
  id: string,
  type: TaskActivityView["type"],
  occurredAt: string,
  details: Record<string, string>,
): TaskActivityView {
  return {
    id,
    type,
    actor: { kind: "framework", id: "coordination" },
    occurredAt,
    details,
  };
}
