import assert from "node:assert/strict";
import test from "node:test";

import { coordinationTranscriptItem } from "../../src/runtime/coordination-tool-transcript.ts";
import { coordinationCall, coordinationResult, transcriptRun } from "../support/coordination-transcript-fixture.ts";

test("every known coordination tool projects valid authoritative facts over requested fallbacks", () => {
  const run = transcriptRun("attempt-matrix", "T-current");
  const cases = [
    {
      tool: "summarize_boards",
      authoritativeFacts: { available: true, boards: [{ id: "delivery", name: "Delivery" }] },
      expected: {
        kind: "coordination-inspection",
        scope: "board-summaries",
        boards: [{ id: "delivery", name: "Delivery" }],
      },
    },
    {
      tool: "list_tasks",
      requestedFacts: { boardId: "delivery", columnIds: ["implementation"] },
      authoritativeFacts: { available: true, tasks: [], nextCursor: null },
      expected: {
        kind: "coordination-inspection",
        scope: "tasks",
        board: { id: "delivery" },
        columns: [{ id: "implementation" }],
      },
    },
    {
      tool: "list_archived_tasks",
      authoritativeFacts: { available: true, tasks: [{ id: "T-archived" }] },
      expected: { kind: "coordination-inspection", scope: "archived-tasks", taskCount: 1 },
    },
    {
      tool: "inspect_task",
      requestedFacts: { taskId: "T-requested" },
      authoritativeFacts: { available: true, task: { id: "T-authoritative", title: "Authoritative task" } },
      expected: {
        kind: "coordination-inspection",
        scope: "task",
        taskId: "T-authoritative",
        taskTitle: "Authoritative task",
      },
    },
    {
      tool: "list_task_activity",
      requestedFacts: { taskId: "T-activity" },
      authoritativeFacts: { available: true, activity: [] },
      expected: { kind: "coordination-inspection", scope: "task-activity", taskId: "T-activity" },
    },
    {
      tool: "list_task_attachments",
      requestedFacts: { taskId: "T-attachments" },
      authoritativeFacts: { available: true, attachments: [] },
      expected: { kind: "coordination-inspection", scope: "task-attachments", taskId: "T-attachments" },
    },
    {
      tool: "list_collaborators",
      authoritativeFacts: { available: true, collaborators: [{ id: "reviewer", name: "Reviewer" }] },
      expected: { kind: "coordination-inspection", scope: "collaborators", collaboratorCount: 1 },
    },
    {
      tool: "inspect_current_task",
      authoritativeFacts: {
        id: "T-current",
        title: "Current task",
        boardId: "delivery",
        column: { id: "review", name: "Review" },
      },
      expected: {
        kind: "coordination-inspection",
        scope: "current-task",
        taskTitle: "Current task",
        boardId: "delivery",
        columnId: "review",
        columnName: "Review",
      },
    },
    {
      tool: "inspect_operating_context",
      authoritativeFacts: {
        attemptId: "attempt-authoritative",
        taskId: "T-authoritative",
        process: { name: "Release train" },
        board: { id: "delivery", name: "Delivery" },
        owningAgent: { name: "Reviewer" },
      },
      expected: {
        kind: "coordination-inspection",
        scope: "operating-context",
        attemptId: "attempt-authoritative",
        taskId: "T-authoritative",
        processName: "Release train",
        boardId: "delivery",
        boardName: "Delivery",
        owningAgentName: "Reviewer",
      },
    },
    {
      tool: "add_comment",
      requestedFacts: { body: "Requested body" },
      authoritativeFacts: { accepted: true, commentId: "comment-7" },
      expected: { kind: "coordination-comment", body: "Requested body", commentId: "comment-7" },
    },
    {
      tool: "move_current_task",
      requestedFacts: { destinationColumnId: "requested-review" },
      authoritativeFacts: {
        accepted: true,
        transition: { taskId: "T-current", fromColumnId: "implementation", toColumnId: "review" },
      },
      expected: { kind: "coordination-task-move", fromColumnId: "implementation", toColumnId: "review" },
    },
    {
      tool: "create_child_task",
      requestedFacts: { title: "Requested title", columnId: "requested-column" },
      authoritativeFacts: {
        accepted: true,
        task: { id: "T-child", title: "Authoritative child", columnId: "review" },
      },
      expected: {
        kind: "coordination-child-task",
        task: { id: "T-child", title: "Authoritative child" },
        columnId: "review",
      },
    },
    {
      tool: "add_dependency",
      requestedFacts: { targetTaskId: "T-requested" },
      authoritativeFacts: {
        accepted: true,
        relationship: { sourceTaskId: "T-current", targetTaskId: "T-authoritative" },
      },
      expected: {
        kind: "coordination-dependency",
        sourceTask: { id: "T-current" },
        targetTask: { id: "T-authoritative" },
      },
    },
    {
      tool: "report_permission_block",
      requestedFacts: { summary: "Approval required" },
      authoritativeFacts: { accepted: true, taskId: "T-current" },
      expected: { kind: "coordination-permission-block", reason: "Approval required" },
    },
  ] as const;

  for (const scenario of cases) {
    const projected = coordinationTranscriptItem(coordinationCall({
      tool: scenario.tool,
      status: "completed",
      requestedFacts: "requestedFacts" in scenario ? scenario.requestedFacts : undefined,
      authoritativeFacts: scenario.authoritativeFacts,
    }), "completed", run);

    assert.ok(projected, `${scenario.tool} should be recognized`);
    assert.equal(projected.status, "succeeded");
    assert.deepEqual(projected.presentation, scenario.expected);
  }
});

test("a coordination move progresses from requested facts to authoritative facts without changing identity", () => {
  const run = transcriptRun("attempt-7", "T-0007");
  const requested = coordinationTranscriptItem(coordinationCall({
    id: "move-7",
    tool: "move_current_task",
    status: "in_progress",
    requestedFacts: { destinationColumnId: "requested-review" },
  }), "running", run);
  const authoritativeFacts = {
    accepted: true,
    transition: {
      taskId: "T-0007",
      fromColumnId: "implementation",
      toColumnId: "code-review",
    },
  };
  const authoritative = coordinationTranscriptItem(coordinationCall({
    id: "move-7",
    tool: "move_current_task",
    status: "completed",
    requestedFacts: { destinationColumnId: "requested-review" },
    authoritativeFacts,
  }), "completed", run);

  assert.deepEqual(requested, {
    id: "move-7",
    kind: "coordination",
    tool: "move_current_task",
    status: "running",
    summary: "T-0007: move to requested-review",
    presentation: { kind: "coordination-task-move", toColumnId: "requested-review" },
    evidence: {
      rawStatus: "in_progress",
      arguments: { destinationColumnId: "requested-review" },
    },
  });
  assert.deepEqual(authoritative, {
    id: "move-7",
    kind: "coordination",
    tool: "move_current_task",
    status: "succeeded",
    summary: "T-0007: implementation → code-review",
    presentation: {
      kind: "coordination-task-move",
      fromColumnId: "implementation",
      toColumnId: "code-review",
    },
    evidence: {
      rawStatus: "completed",
      arguments: { destinationColumnId: "requested-review" },
      result: coordinationResult(authoritativeFacts),
    },
  });
});

test("every known coordination tool has a typed presentation even when evidence is partial or malformed", () => {
  const mutationTools = new Set([
    "add_comment",
    "move_current_task",
    "create_child_task",
    "add_dependency",
    "report_permission_block",
  ]);
  const expectedPresentations = new Map<string, { kind: string; scope?: string }>([
    ["summarize_boards", { kind: "coordination-inspection", scope: "board-summaries" }],
    ["list_tasks", { kind: "coordination-inspection", scope: "tasks" }],
    ["list_archived_tasks", { kind: "coordination-inspection", scope: "archived-tasks" }],
    ["inspect_task", { kind: "coordination-inspection", scope: "task" }],
    ["list_task_activity", { kind: "coordination-inspection", scope: "task-activity" }],
    ["list_task_attachments", { kind: "coordination-inspection", scope: "task-attachments" }],
    ["list_collaborators", { kind: "coordination-inspection", scope: "collaborators" }],
    ["inspect_current_task", { kind: "coordination-inspection", scope: "current-task" }],
    ["inspect_operating_context", { kind: "coordination-inspection", scope: "operating-context" }],
    ["add_comment", { kind: "coordination-comment" }],
    ["move_current_task", { kind: "coordination-task-move" }],
    ["create_child_task", { kind: "coordination-child-task" }],
    ["add_dependency", { kind: "coordination-dependency" }],
    ["report_permission_block", { kind: "coordination-permission-block" }],
  ]);

  for (const [tool, expected] of expectedPresentations) {
    const projected = coordinationTranscriptItem(coordinationCall({
      tool,
      status: "completed",
      requestedFacts: "malformed arguments",
      result: { content: [{ type: "text", text: "malformed result" }] },
    }), "completed", transcriptRun("attempt-matrix", "T-matrix"));

    assert.ok(projected, `${tool} should be recognized`);
    assert.equal(projected.kind, "coordination");
    assert.equal(projected.status, mutationTools.has(tool) ? "failed" : "succeeded");
    assert.deepEqual(projected.diagnostic, mutationTools.has(tool)
      ? { kind: "failure", message: "The coordination call completed without an authoritative outcome." }
      : undefined);
    assert.equal(projected.presentation.kind, expected.kind);
    assert.equal("scope" in projected.presentation ? projected.presentation.scope : undefined, expected.scope);
    assert.deepEqual(projected.evidence, {
      rawStatus: "completed",
      arguments: "malformed arguments",
      result: { content: [{ type: "text", text: "malformed result" }] },
    });
  }
});

test("coordination outcomes distinguish running, domain rejection, and technical failure", () => {
  const run = transcriptRun("attempt-outcomes", "T-outcomes");
  const base = coordinationCall({
    tool: "add_dependency",
    requestedFacts: { targetTaskId: "T-target" },
  });

  const running = coordinationTranscriptItem({ ...base, status: "in_progress" }, "running", run);
  const rejected = coordinationTranscriptItem(coordinationCall({
    tool: "add_dependency",
    status: "completed",
    requestedFacts: { targetTaskId: "T-target" },
    result: [{ type: "text", text: JSON.stringify({ accepted: false, reason: "duplicate-relationship" }) }],
  }), "completed", run);
  const failed = coordinationTranscriptItem(coordinationCall({
    tool: "add_dependency",
    status: "failed",
    requestedFacts: { targetTaskId: "T-target" },
    error: "coordination call failed",
  }), "failed", run);

  assert.equal(running?.status, "running");
  assert.deepEqual(rejected?.diagnostic, { kind: "rejection", message: "Duplicate relationship" });
  assert.equal(rejected?.status, "rejected");
  assert.deepEqual(failed?.diagnostic, { kind: "failure", message: "The coordination call did not complete." });
  assert.equal(failed?.status, "failed");
  assert.equal(coordinationTranscriptItem({ ...base, server: "another-server" }, "completed", run), undefined);
  assert.equal(coordinationTranscriptItem({ ...base, tool: "future_coordination_tool" }, "completed", run), undefined);
});
