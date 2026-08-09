import assert from "node:assert/strict";
import test from "node:test";

import {
  createHostWorkspaceOpener,
  createVisualStudioCodeWorkspaceOpener,
  launchHostCommand,
} from "../../src/web/host-workspace-opener.ts";

test("host workspace opening preserves the exact path for supported desktop platforms", async () => {
  for (const [platform, expectedCommand] of [
    ["win32", "explorer.exe"],
    ["darwin", "open"],
    ["linux", "xdg-open"],
    ] as const) {
    const launches: Array<{ command: string; arguments_: string[]; confirmation: string }> = [];
    const openWorkspace = createHostWorkspaceOpener(platform, async (command, arguments_, confirmation) => {
      launches.push({ command, arguments_, confirmation });
    });
    assert.ok(openWorkspace);
    await openWorkspace("C:/project state/task worktrees/T-0001");
    assert.deepEqual(launches, [{
      command: expectedCommand,
      arguments_: ["C:/project state/task worktrees/T-0001"],
      confirmation: platform === "win32" ? "spawn" : "exit",
    }]);
  }
});

test("host workspace opening is unavailable on unsupported platforms", () => {
  assert.equal(createHostWorkspaceOpener("aix"), undefined);
});

test("Visual Studio Code workspace opening preserves the exact path", async () => {
  const launches: Array<{ command: string; arguments_: string[]; confirmation: string }> = [];
  const openWorkspace = createVisualStudioCodeWorkspaceOpener(
    "win32",
    async (command, arguments_, confirmation) => {
      launches.push({ command, arguments_, confirmation });
    },
    async () => "C:/Users/example/AppData/Local/Programs/Microsoft VS Code/Code.exe",
  );

  await openWorkspace("C:/project state/task worktrees/T-0001");

  assert.deepEqual(launches, [{
    command: "C:/Users/example/AppData/Local/Programs/Microsoft VS Code/Code.exe",
    arguments_: ["C:/project state/task worktrees/T-0001"],
    confirmation: "spawn",
  }]);
});

test("Visual Studio Code workspace opening reports a missing Windows installation", async () => {
  const openWorkspace = createVisualStudioCodeWorkspaceOpener(
    "win32",
    async () => assert.fail("The launcher must not run without an executable."),
    async () => undefined,
  );

  await assert.rejects(
    openWorkspace("C:/project state/task worktrees/T-0001"),
    /Visual Studio Code could not be found/,
  );
});

test("host workspace opening confirms launch without waiting for the application to exit", async () => {
  const startedAt = Date.now();
  await launchHostCommand(process.execPath, ["-e", "setTimeout(() => {}, 2_000)"], "spawn");
  assert.ok(Date.now() - startedAt < 500);
});

test("host workspace opening reports a launcher that exits unsuccessfully", async () => {
  await assert.rejects(
    launchHostCommand(process.execPath, ["-e", "process.exit(7)"], "exit"),
    /code 7/,
  );
});
