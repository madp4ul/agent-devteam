import { DatabaseSync } from "node:sqlite";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AttemptTranscriptItem } from "../../src/application/coordination-contract.ts";
import { startWebServer } from "../../src/web/web-server.ts";

export async function startBrowserFixture(): Promise<() => Promise<void>> {
const directory = await mkdtemp(join(tmpdir(), "coordination-browser-"));
const definitionPath = join(directory, "process.yaml");
const databasePath = join(directory, "coordination.sqlite3");
await writeFile(join(directory, "agent.md"), "Implement the current task.\n");
await writeFile(
  definitionPath,
  `schemaVersion: 1
name: Browser acceptance process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep browser behavior inspectable.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements tasks
    summary: Builds verified changes.
    instructions: ./agent.md
boards:
  - id: delivery
    name: Product delivery
    guidance: Move outcomes through implementation.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
);

const browserTranscript: AttemptTranscriptItem[] = [
  { kind: "message", role: "agent", text: "I inspected the current task." },
  {
    kind: "tool",
    name: "command_execution",
    status: "completed",
    summary: "pnpm test (exit 0)",
    output: "All focused tests passed.\n... output truncated",
  },
  { kind: "diagnostic", text: "No unresolved runtime diagnostics." },
];
const application = await CoordinationApplication.start({
  processDefinitionPath: definitionPath,
  databasePath,
  runtimeDispatch: {
    projectRepositoryPath: join(directory, "missing-project-repository"),
    taskWorkspaceRoot: join(directory, "task-workspaces"),
    agentRuntime: {
      run: () => {
        throw new Error("The browser startup-failure fixture must fail before runtime dispatch");
      },
    },
  },
  transcriptAccess: {
    read: async (threadId) => threadId === "thread-browser-123" ? browserTranscript : null,
  },
});
const inspected = application.createTask({
  boardId: "delivery",
  columnId: "backlog",
  title: "Inspect existing coordination",
  description: "Understand the full task history and its current automation state.",
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-inspected",
});
if (!inspected.accepted) throw new Error("Could not create inspected browser fixture");
const authored = application.addTaskComment({
  taskId: inspected.task.id,
  body: "Please preserve the authored context beside framework history.",
  actor: { kind: "agent", id: "implementer" },
  idempotencyKey: "browser-comment",
});
if (!authored.accepted) throw new Error("Could not add authored browser fixture comment");
const moved = application.moveTask({
  taskId: inspected.task.id,
  destinationColumnId: "implementation",
  expectedRevision: inspected.task.revision,
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-inspected-move",
});
if (!moved.accepted) throw new Error("Could not move inspected browser fixture");
const draggable = application.createTask({
  boardId: "delivery",
  columnId: "backlog",
  title: "Drag this task",
  description: "Exercise the pointer enhancement without losing the accessible move path.",
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-draggable",
});
if (!draggable.accepted) throw new Error("Could not create draggable browser fixture");
const startupFailed = application.createTask({
  boardId: "delivery",
  columnId: "implementation",
  title: "Recover a workspace startup failure",
  description: "Keep pre-attempt diagnostics visible until explicit recovery.",
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-startup-failed",
});
if (!startupFailed.accepted) throw new Error("Could not create startup-failed browser fixture");

const activation = moved.task.activations[0];
if (activation === undefined) throw new Error("Expected a watched-column activation");
const activationOccurredAt = moved.task.activity.at(-1)?.occurredAt;
if (activationOccurredAt === undefined) throw new Error("Expected activation activity");
const attemptStartedAt = new Date(Date.parse(activationOccurredAt) + 1_000).toISOString();
const attemptCompletedAt = new Date(Date.parse(attemptStartedAt) + 150_000).toISOString();
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON");
database.prepare("UPDATE activations SET status = 'completed' WHERE id = ?").run(activation.id);
database.prepare(
  `INSERT INTO attempts
    (id, activation_id, status, workspace_path, started_at, completed_at,
     outcome_status, outcome_summary, thread_id)
   VALUES (?, ?, 'completed', ?, ?, ?, 'completed', ?, ?)`,
).run(
  "browser-attempt",
  activation.id,
  join(directory, "task-workspace"),
  attemptStartedAt,
  attemptCompletedAt,
  "Inspected the task and completed the handoff.",
  "thread-browser-123",
);
database.prepare(
  `INSERT INTO attention_reasons
    (id, task_id, type, source_event_id, created_at, resolved_at)
   VALUES (?, ?, 'user-mention', NULL, ?, NULL)`,
).run("browser-attention", inspected.task.id, attemptCompletedAt);
database.prepare(
  `INSERT INTO activations
    (id, task_id, target_agent_id, reason_type, source_event_id, status, created_at,
     model, reasoning_effort, failure_kind, failure_summary)
   VALUES (?, ?, 'implementer', 'agent-mention', ?, 'failed', ?, NULL, NULL,
           'permission', ?)`,
).run(
  "browser-permission-activation",
  inspected.task.id,
  authored.comment.id,
  attemptCompletedAt,
  "Writing the protected release file requires user approval.",
);
database.prepare(
  `INSERT INTO attention_reasons
    (id, task_id, type, source_event_id, created_at, resolved_at)
   VALUES (?, ?, 'failed-run', ?, ?, NULL)`,
).run(
  "browser-permission-attention",
  inspected.task.id,
  "browser-permission-activation",
  attemptCompletedAt,
);
database.prepare(
  "INSERT INTO task_relationships VALUES (?, 'dependency', ?, ?)",
).run("browser-relationship", inspected.task.id, draggable.task.id);
if (startupFailed.task.activations[0] === undefined) {
  throw new Error("Expected a startup-failure activation");
}
database.close();
const startupFailure = await application.resumeAutomation();
if (startupFailure.accepted || startupFailure.reason !== "runtime-start-failed") {
  throw new Error("Expected the browser fixture's pre-attempt repository failure");
}

const server = await startWebServer(application, { host: "127.0.0.1", port: 4174 });
console.log(`Browser fixture listening at ${server.baseUrl}`);

return async () => {
  await server.close();
  application.close();
};
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startBrowserFixture();
}
