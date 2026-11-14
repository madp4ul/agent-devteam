import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";

const git = promisify(execFile);

test("HTTP archival reviews a large nested checkout and explicitly discards an unreferenced parent HEAD", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Large checkout", description: "Archive after review",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create-large-archive" });
  assert.ok(created.accepted);
  await app.resumeAutomation();
  const run = await runtime.waitForRequest(1);
  app.pauseAutomation();
  runtime.complete({ status: "completed", summary: "Done" });
  await app.waitForAutomationIdle();
  const workspace = run.workspace.path;
  const nested = join(workspace, "nested");
  await git("git", ["-C", fixture.repositoryPath, "worktree", "add", "--detach", nested, "main"]);
  await git("git", ["-C", workspace, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "Unreferenced work"]);
  const files = 7000;
  for (let start = 0; start < files; start += 100) {
    await Promise.all(Array.from({ length: 100 }, (_, offset) => writeFile(join(nested, `${start + offset}-${"long-name-".repeat(15)}.txt`), "")));
  }
  const statusArgs = ["-C", nested, "status", "--porcelain=v2", "--branch", "--untracked-files=all"];
  await assert.rejects(git("git", statusArgs), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
  const started = performance.now();
  const { stdout } = await git("git", statusArgs, { maxBuffer: 2 * 1024 * 1024 });
  t.diagnostic(`Git status emitted ${Buffer.byteLength(stdout)} bytes in ${Math.round(performance.now() - started)} ms.`);
  const assets = join(fixture.repositoryPath, "..", "assets");
  await mkdir(assets);
  await writeFile(join(assets, "index.html"), "<div></div>");
  const server = await startWebServer(app, { host: "127.0.0.1", port: 0, assetDirectory: assets });
  t.after(() => server.close());
  const endpoint = `${server.baseUrl}/api/tasks/${created.task.id}/archive`;
  const previewStart = performance.now();
  let previewComplete = false;
  const pendingPreview = fetch(`${endpoint}/preview`).finally(() => { previewComplete = true; });
  const competingRead = performance.now();
  const board = await fetch(`${server.baseUrl}/api/board`, { signal: AbortSignal.timeout(2000) });
  assert.equal(board.status, 200);
  await board.text();
  assert.equal(previewComplete, false);
  t.diagnostic(`Board read completed in ${Math.round(performance.now() - competingRead)} ms during preview.`);
  const response = await pendingPreview;
  assert.equal(response.status, 200);
  const { preview } = await response.json();
  t.diagnostic(`HTTP preview took ${Math.round(performance.now() - previewStart)} ms: ${preview.worktrees.map((entry: { diagnostic?: string }) => entry.diagnostic ?? "inspected").join(", ")}.`);
  assert.equal(preview.worktrees[0].durableHead, false);
  assert.equal(preview.worktrees[1].state?.changes.untrackedFiles, files);
  assert.ok(preview.token);
  const result = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    idempotencyKey: "discard-reviewed-large-checkout", discardWorkspaceChanges: true, archivalPreviewToken: preview.token,
  }) });
  assert.equal(result.status, 200, await result.text());
});
