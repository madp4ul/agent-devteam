import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AttemptTranscriptItem } from "../../src/application/coordination-contract.ts";
import { startWebServer } from "../../src/web/web-server.ts";

const execFileAsync = promisify(execFile);

export async function startBrowserFixture(): Promise<() => Promise<void>> {
const directory = await mkdtemp(join(tmpdir(), "coordination-browser-"));
const definitionPath = join(directory, "process.yaml");
const databasePath = join(directory, "coordination.sqlite3");
// Keep the historical path label so the startup-diagnostic fixture remains
// recognizable while the repository is temporarily moved out of the way.
const projectRepositoryPath = join(directory, "missing-project-repository");
await execFileAsync("git", ["init", "--initial-branch=main", projectRepositoryPath]);
await writeFile(join(projectRepositoryPath, "README.md"), "# Browser fixture\n");
await execFileAsync("git", ["-C", projectRepositoryPath, "add", "README.md"]);
await execFileAsync("git", [
  "-C", projectRepositoryPath,
  "-c", "user.name=Browser Fixture",
  "-c", "user.email=browser-fixture@example.invalid",
  "commit", "-m", "Initial browser fixture",
]);
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
    projectRepositoryPath,
    taskWorkspaceRoot: join(directory, "task-workspaces"),
    agentRuntime: {
      run: async (request, lifecycle) => {
        const threadId = request.resumeThreadId ?? `thread-${request.attemptId}`;
        lifecycle.started(threadId);
        return {
          status: "completed",
          summary: request.reason.type === "user-follow-up"
            ? `Follow-up resumed ${threadId} in ${request.workspace.path}.`
            : "Browser fixture run completed.",
          threadId,
        };
      },
    },
  },
  transcriptAccess: {
    read: async (attemptId) => attemptId === "browser-attempt" ? browserTranscript : null,
    readUsage: async (attemptId) => attemptId === "browser-attempt"
      ? {
          inputTokens: 2_400,
          cachedInputTokens: 1_800,
          cacheWriteInputTokens: 200,
          outputTokens: 600,
          reasoningOutputTokens: 350,
        }
      : null,
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
  body: "Please preserve the authored context beside framework history. The implementation agent should verify the causal grouping. This intentionally long comment explains that authored text remains readable without allowing one message to dominate the task timeline. It also provides enough prose to exercise the compact preview and inline expansion behavior at ordinary desktop and narrow viewport widths.",
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
const taskWorkspaceRoot = join(directory, "task-workspaces");
const inspectableWorkspacePath = join(taskWorkspaceRoot, inspected.task.id);
await mkdir(taskWorkspaceRoot);
await execFileAsync("git", ["-C", projectRepositoryPath, "worktree", "add", "--detach", inspectableWorkspacePath, "main"]);
database.prepare(
  `INSERT INTO task_workspaces (task_id, path, starting_ref, commit_id)
   VALUES (?, ?, ?, ?)`,
).run(inspected.task.id, inspectableWorkspacePath, "main", "0123456789abcdef0123456789abcdef01234567");
database.prepare("UPDATE activations SET status = 'completed' WHERE id = ?").run(activation.id);
database.prepare(
  `UPDATE agent_conversations
   SET current_thread_id = ?, latest_activity_at = ?
   WHERE id = ?`,
).run("thread-browser-123", attemptCompletedAt, activation.conversationId);
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
  "UPDATE task_comments SET attempt_id = ?, occurred_at = ? WHERE id = ?",
).run(
  "browser-attempt",
  new Date(Date.parse(attemptStartedAt) + 60_000).toISOString(),
  authored.comment.id,
);
database.prepare(
  `INSERT INTO task_comments
    (id, task_id, body, actor_kind, actor_id, occurred_at, attempt_id)
   VALUES (?, ?, ?, 'user', 'local-user', ?, NULL)`,
).run(
  "browser-during-attempt-comment",
  inspected.task.id,
  "Please also verify the migration behavior.",
  new Date(Date.parse(attemptStartedAt) + 30_000).toISOString(),
);
database.prepare(
  `INSERT INTO attention_reasons
    (id, task_id, type, source_event_id, created_at, resolved_at)
   VALUES (?, ?, 'user-mention', NULL, ?, NULL)`,
).run("browser-attention", inspected.task.id, attemptCompletedAt);
database.prepare(
  `INSERT INTO activations
    (id, task_id, target_agent_id, reason_type, source_event_id, status, created_at,
     model, reasoning_effort, failure_kind, failure_summary, definition_version)
   VALUES (?, ?, 'implementer', 'agent-mention', ?, 'failed', ?, NULL, NULL,
           'permission', ?, (SELECT definition_version FROM runtime WHERE singleton = 1))`,
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
const unavailableRepositoryPath = join(directory, "temporarily-unavailable-project-repository");
await rename(projectRepositoryPath, unavailableRepositoryPath);
const startupFailure = await application.resumeAutomation();
await rename(unavailableRepositoryPath, projectRepositoryPath);
if (startupFailure.accepted || startupFailure.reason !== "runtime-start-failed") {
  throw new Error("Expected the browser fixture's pre-attempt repository failure");
}

const server = await startWebServer(application, {
  host: "127.0.0.1",
  port: 4174,
  openWorkspace: async () => undefined,
  openWorkspaceInVisualStudioCode: async () => undefined,
});
console.log(`Browser fixture listening at ${server.baseUrl}`);

return async () => {
  await server.close();
  application.close();
};
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startBrowserFixture();
}
