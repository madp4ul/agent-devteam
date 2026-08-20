import { execFile } from "node:child_process";
import { mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AutomationClock } from "../../src/application/automation-contract.ts";
import type { AttemptTranscriptItem } from "../../src/application/runtime-contract.ts";
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
const liveTranscripts = new Map<string, AttemptTranscriptItem[]>();
const automationClock = new BrowserFixtureClock();
let fixtureAttemptId: string | undefined;
let application!: CoordinationApplication;
application = await CoordinationApplication.start({
  processDefinitionPath: definitionPath,
  databasePath,
  runtimeDispatch: {
    projectRepositoryPath,
    taskWorkspaceRoot: join(directory, "task-workspaces"),
    agentRuntime: {
      run: async (request, lifecycle) => {
        const threadId = request.reason.type === "column-entry"
          ? "thread-browser-123"
          : (request.resumeThreadId ?? `thread-${request.attemptId}`);
        lifecycle.started(threadId);
        if (request.reason.type === "user-follow-up") {
          liveTranscripts.set(request.attemptId, [
            { id: "assembled-live-message", kind: "message", role: "agent", text: "Checking the assembled follow-up now." },
            {
              id: "assembled-live-tool",
              kind: "tool",
              name: "command_execution",
              status: "running",
              summary: "Verify conversation boundaries",
            },
          ]);
          // Leave enough observable running time for the browser to poll the
          // in-progress transcript before the fixture publishes completion.
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          liveTranscripts.set(request.attemptId, [
            { id: "assembled-live-message", kind: "message", role: "agent", text: "Checking the assembled follow-up now." },
            {
              id: "assembled-live-tool",
              kind: "tool",
              name: "command_execution",
              status: "completed",
              summary: "Verify conversation boundaries (exit 0)",
              output: "Assembled follow-up verified.",
            },
          ]);
        } else if (request.reason.type === "agent-mention" && request.attempt.number === 1) {
          return {
            status: "permission-blocked",
            summary: "Writing the protected release file requires user approval.",
            threadId,
          };
        } else {
          fixtureAttemptId = request.attemptId;
          const duringAttempt = application.addTaskComment({
            taskId: request.task.id,
            body: "Please also verify the migration behavior.",
            actor: { kind: "user", id: "local-user" },
            idempotencyKey: "browser-during-attempt-comment",
          });
          if (!duringAttempt.accepted) throw new Error("Could not add the browser fixture user comment");
          const authored = application.addTaskComment({
            taskId: request.task.id,
            body: [
              "### Preserve authored context",
              "",
              "Please preserve the **authored context** beside framework history.",
              "",
              "- Verify the causal grouping",
              "- Keep `@user` illustrative inside code",
              "",
              "```ts",
              "const source = \"raw Markdown\";",
              "```",
              "",
              "The implementation agent should verify the causal grouping. This intentionally long comment explains that authored text remains readable without allowing one message to dominate the task timeline. It also provides enough prose to exercise the compact preview and inline expansion behavior at ordinary desktop and narrow viewport widths.",
            ].join("\n"),
            actor: { kind: "agent", id: "implementer" },
            attemptId: request.attemptId,
            idempotencyKey: "browser-comment",
          });
          if (!authored.accepted) throw new Error("Could not add the browser fixture agent comment");
          automationClock.advanceBy(151_000);
        }
        return {
          status: "completed",
          summary: request.reason.type === "user-follow-up"
            ? `Follow-up resumed ${threadId} in ${request.workspace.path}.`
            : request.reason.type === "agent-mention"
              ? "Authorized permission retry completed."
            : [
                "Completed the **handoff** with [verification](https://example.com/result).",
                "",
                "- Tests passed",
                "- Source preserved",
                "",
                "```mermaid",
                "graph TD",
                "  A --> B",
                "```",
              ].join("\n"),
          threadId,
        };
      },
    },
  },
  transcriptAccess: {
    read: async (attemptId) => attemptId === fixtureAttemptId
      ? browserTranscript
      : (liveTranscripts.get(attemptId) ?? null),
    readUsage: async (attemptId) => attemptId === fixtureAttemptId
      ? {
          inputTokens: 2_400,
          cachedInputTokens: 1_800,
          cacheWriteInputTokens: 200,
          outputTokens: 600,
          reasoningOutputTokens: 350,
        }
      : null,
  },
  automationClock,
});
const inspected = application.createTask({
  boardId: "delivery",
  columnId: "backlog",
  title: "Inspect existing coordination",
  description: [
    "## Coordination evidence",
    "",
    "Understand the **full task history** and its [current automation state](https://example.com/automation).",
    "",
    "- Keep authored context readable",
    "- Preserve the exact Markdown source",
    "",
    "<img src=x onerror=\"window.markdownInjected=true\">",
    "![Remote image](https://example.com/tracker.png)",
    "[Unsafe link](javascript:window.markdownInjected=true)",
  ].join("\n"),
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-inspected",
});
if (!inspected.accepted) throw new Error("Could not create inspected browser fixture");
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
const initialResume = await application.resumeAutomation();
if (!initialResume.accepted) throw new Error("Could not run the inspected browser fixture task");
await application.waitForAutomationIdle();
application.pauseAutomation();
automationClock.reset();

const userAttentionComment = application.addTaskComment({
  taskId: inspected.task.id,
  body: "@user Please confirm the completed handoff.",
  actor: { kind: "agent", id: "implementer" },
  idempotencyKey: "browser-user-attention-comment",
});
if (!userAttentionComment.accepted) throw new Error("Could not create the browser user-attention reason");

const permissionComment = application.addTaskComment({
  taskId: draggable.task.id,
  body: "@implementer Please retry the protected release-file write after authorization.",
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-permission-comment",
});
if (!permissionComment.accepted) throw new Error("Could not create the browser permission activation");
const permissionResume = await application.resumeAutomation();
if (!permissionResume.accepted) throw new Error("Could not run the browser permission activation");
await application.waitForAutomationIdle();
application.pauseAutomation();

const relationship = application.createTaskRelationship({
  type: "dependency",
  sourceTaskId: inspected.task.id,
  targetTaskId: draggable.task.id,
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-relationship",
});
if (!relationship.accepted) throw new Error("Could not create the browser fixture relationship");

const startupFailed = application.createTask({
  boardId: "delivery",
  columnId: "implementation",
  title: "Recover a workspace startup failure",
  description: "Keep pre-attempt diagnostics visible until explicit recovery.",
  actor: { kind: "user", id: "local-user" },
  idempotencyKey: "browser-startup-failed",
});
if (!startupFailed.accepted) throw new Error("Could not create startup-failed browser fixture");

if (startupFailed.task.activations[0] === undefined) {
  throw new Error("Expected a startup-failure activation");
}
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
return async () => {
  await server.close();
  application.close();
};
}

class BrowserFixtureClock implements AutomationClock {
  #now = new Date();

  now(): Date {
    return new Date(this.#now);
  }

  waitUntil(): Promise<void> {
    return Promise.resolve();
  }

  advanceBy(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }

  reset(): void {
    this.#now = new Date();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startBrowserFixture();
}
