import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "vite";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { acquireProjectStateOperationGuard } from "../../src/application/internal/project-state-operation-guard.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { GitTaskWorkspaceManager } from "../../src/application/internal/git-task-workspace.ts";

// Same process and product UI as the supplied example. Only model execution is
// scripted. All project files, Git worktrees, SQLite and assets are disposable.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const environment = join(root, ".scratch/operation-feedback-menus/environment");
const project = join(environment, "project");
const databasePath = join(environment, "coordination.sqlite3");
const workspaceRoot = join(environment, "task-worktrees");
const assets = join(root, ".scratch/operation-feedback-menus/assets");
const git = async (...args) => promisify(execFile)("git", ["-C", project, ...args]);
const actor = { kind: "user", id: "ui-review" };
await mkdir(environment, { recursive: true });
const firstLaunch = await access(databasePath).then(() => false, () => true);
if (await access(join(project, ".git")).then(() => false, () => true)) {
  await promisify(execFile)("git", ["init", "--initial-branch=main", project]);
  await writeFile(join(project, "README.md"), "# Disposable UI review project\nNo production work belongs here.\n");
  await git("add", "README.md");
  await git("-c", "user.name=UI Review", "-c", "user.email=ui-review@example.invalid", "commit", "-m", "Seed disposable example");
}
const guard = await acquireProjectStateOperationGuard(project, "application start");
let application;
let server;
let stopping = false;
let archivalReviewDelay = 0;
const heldPreparations = new Map();
const releasePreparations = () => { for (const release of heldPreparations.values()) release(); heldPreparations.clear(); };
const provision = GitTaskWorkspaceManager.prototype.provision;
// Deliberate review-only gate, confined to this disposable host. Real preparation
// and its durable claim continue through the normal Git path after release.
GitTaskWorkspaceManager.prototype.provision = async function (taskId, startingRef, existing, onProgress) {
  const detail = application?.queryUserTaskDetail(taskId);
  if (!stopping && detail?.available && detail.task.title.startsWith("Preparation review (")) {
    onProgress?.({ stage: "Paused for UI review — use release in the review terminal" });
    await new Promise((resolve) => heldPreparations.set(taskId, resolve));
  }
  return provision.call(this, taskId, startingRef, existing, onProgress);
};
const removeForArchival = GitTaskWorkspaceManager.prototype.removeForArchival;
GitTaskWorkspaceManager.prototype.removeForArchival = async function (...args) {
  if (!stopping && archivalReviewDelay) await delay(archivalReviewDelay);
  return removeForArchival.apply(this, args);
};
try {
  await build({ configFile: join(root, "vite.config.ts"), root: join(root, "web"), build: { outDir: assets, emptyOutDir: true } });
  application = await CoordinationApplication.start({
    processDefinitionPath: join(root, "examples/software-delivery/process.yaml"), databasePath,
    runtimeDispatch: { projectRepositoryPath: project, taskWorkspaceRoot: workspaceRoot,
      agentRuntime: { async run(request, lifecycle, signal) {
        lifecycle.started();
        const seeded = /^(Clean archive [AB]|Dirty archive|Failed run) \(\d+\)$/.test(request.task.title);
        const long = /^Long run \(\d+\)$/.test(request.task.title);
        if (!seeded && !long) {
          // Manually created review tasks stay where the user put them. Their
          // scripted run remains inspectable until the user interrupts it.
          if (!signal?.aborted) await new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }));
          return { status: "completed", summary: "Review run stopped." };
        }
        await delay(long ? 120_000 : 1_500, undefined, { signal }).catch((error) => {
          if (!signal?.aborted) throw error;
        });
        if (request.task.title.includes("Dirty archive")) await writeFile(join(request.workspace.path, "uncommitted-review-note.txt"), "Intentional local changes for archival confirmation.\n");
        if (!signal?.aborted && !request.task.title.includes("Failed run")) {
          const detail = application.queryUserTaskDetail(request.task.id);
          if (!detail.available) throw new Error("Scripted task unavailable");
          const moved = application.moveTask({ taskId: request.task.id,
            destinationColumnId: request.task.title.includes("Long run") ? "awaiting-user-approval" : "completion",
            expectedRevision: detail.task.revision, actor: { kind: "agent", id: request.agent.id },
            attemptId: request.attemptId, idempotencyKey: `scripted-completion-${request.attemptId}` });
          if (!moved.accepted) throw new Error(JSON.stringify(moved));
        }
        return request.task.title.includes("Failed run")
          ? { status: "permission-blocked", summary: "Example failure: permission to write the requested file was denied." }
          : { status: "completed", summary: "Review run completed." };
      } } },
  });
  if (application.queryStartup().mode === "configuration-error") throw new Error(JSON.stringify(application.queryStartup()));
  server = await startWebServer(application, { host: "127.0.0.1", port: 3010, assetDirectory: assets });
  let busy = false;
  const seed = async () => {
    if (busy) return;
    busy = true;
    try {
      const batch = Date.now();
      const created = ["Clean archive A", "Clean archive B", "Dirty archive", "Failed run"].map((title, index) => {
        const result = application.createTask({ boardId: "delivery", columnId: "architecture-design", title: `${title} (${batch})`,
          description: "Disposable UI review task. Comment here, inspect lifecycle history, or try Completion archival. The runtime is scripted.",
          actor, idempotencyKey: `ui-review-${batch}-${index}` });
        if (!result.accepted) throw new Error(JSON.stringify(result));
        return result.task.id;
      });
      const resumed = await application.resumeAutomation();
      if (!resumed.accepted) throw new Error(JSON.stringify(resumed));
      // Only wait for this seed's runs. Another deliberately long run can remain active.
      while (created.some((id) => !application.queryActivityMenuHistory().runs.some((entry) => entry.taskId === id))) {
        if (stopping) return;
        await delay(200);
      }
      if (stopping) return;
      console.log("Seed ready. Completion contains two clean workspaces and one dirty workspace. Try Archive completed tasks, then open Archiving.");
    } finally { busy = false; }
  };
  const longRun = async () => {
    const id = Date.now();
    const created = application.createTask({ boardId: "delivery", columnId: "architecture-design", title: `Long run (${id})`,
      description: "A two-minute scripted run for menu navigation and interruption review.", actor, idempotencyKey: `ui-long-${id}` });
    if (!created.accepted) throw new Error(JSON.stringify(created));
    await application.resumeAutomation();
  };
  const prepare = async () => {
    const id = Date.now();
    const created = application.createTask({ boardId: "delivery", columnId: "architecture-design", title: `Preparation review (${id})`,
      description: "Preparation is deliberately held for visual review. Use release in the review terminal to continue. No paid agent runs.", actor, idempotencyKey: `ui-preparation-${id}` });
    if (!created.accepted) throw new Error(JSON.stringify(created));
    console.log("Preparation held for review. Use release to continue into an inspectable scripted run.");
    await application.resumeAutomation();
  };
  console.log(`\nUI review at ${server.baseUrl}\nIsolated project: ${project}\nScripted runtime only. No paid agents run.\nCommands: seed, run (two-minute run), prepare (hold preparation), release, slow (pace archival), fast, quit.\nManual tasks stay in their chosen column until you move them; interrupt their scripted run when finished reviewing.\nRestart this command to verify retained history and dismissals.\n`);
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    input.close();
    application.pauseAutomation();
    releasePreparations();
    for (const run of application.queryActiveRuns()) application.interruptTask({ taskId: run.taskId, actor, idempotencyKey: `ui-shutdown-${run.attemptId}` });
    await application.prepareShutdown();
    await server.close();
    application.close();
    await guard.release();
  };
  input.on("line", (line) => {
    const command = line.trim();
    const action = command === "seed" ? seed : command === "run" ? longRun : command === "prepare" ? prepare
      : command === "release" ? async () => releasePreparations()
      : command === "slow" ? async () => { archivalReviewDelay = 5000; console.log("Archival is intentionally paced at five seconds per workspace for UI review."); }
      : command === "fast" ? async () => { archivalReviewDelay = 0; }
      : command === "quit" ? stop : undefined;
    if (action) void action().catch(console.error);
  });
  process.once("SIGINT", () => { void stop().catch(console.error); });
  process.once("SIGTERM", () => { void stop().catch(console.error); });
  if (firstLaunch) await seed();
} catch (error) {
  await server?.close();
  application?.close();
  await guard.release();
  throw error;
}
