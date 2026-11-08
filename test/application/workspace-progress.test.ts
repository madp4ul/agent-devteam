import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceProgressView } from "../../src/application/automation-contract.ts";
import test from "node:test";
import { GitTaskWorkspaceManager } from "../../src/application/internal/git-task-workspace.ts";

test("workspace creation emits split carriage-return Git progress before checkout completes", async () => {
  const updates: WorkspaceProgressView[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const manager = new GitTaskWorkspaceManager("repository", await mkdtemp(join(tmpdir(), "workspace-progress-")), async (args, _environment, onStderr) => {
    if (args.includes("checkout")) {
      assert.ok(args.includes("--progress"));
      onStderr?.("Preparing worktree (detached HEAD abc)\nUpdating fi");
      onStderr?.("les:  25% (25/100)\rUpdating files:  50% (50/100)\r");
      await gate;
      onStderr?.("Updating files: 100% (100/100), done.\n");
    }
    return "abc";
  });
  const pending = manager.provision("T-0001", "HEAD", undefined, (progress) => updates.push(progress));
  for (let i = 0; i < 20 && updates.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.ok(updates.some((value) => value.completed === 50 && value.total === 100 && value.stage === "Updating files"));
  release();
  await pending;
  assert.ok(updates.some((value) => value.completed === 100));
});
