import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { acquireProjectStateOperationGuard } from "../../src/application/internal/project-state-operation-guard.ts";
import { createCommittedTestRepository } from "../support/agent-runtime-fixture.ts";

test("a PID reused after acquisition cannot keep a crashed host's lock alive", async () => {
  const fixture = await createCommittedTestRepository("reused-project-state-pid-");
  const guardPath = join(fixture.repositoryPath, ".git", "coordination-project-state.lock");
  await writeFile(guardPath, JSON.stringify({ token: "crashed-owner", pid: process.pid,
    operation: "application start", acquiredAt: new Date(Date.now() - (process.uptime() + 60) * 1000).toISOString() }));
  const guard = await acquireProjectStateOperationGuard(fixture.repositoryPath, "application start");
  try {
    const owner = JSON.parse(await readFile(guardPath, "utf8"));
    assert.equal(owner.pid, process.pid);
    assert.notEqual(owner.token, "crashed-owner");
    await assert.rejects(acquireProjectStateOperationGuard(fixture.repositoryPath, "application start"), /Project state is in use/);
  } finally {
    await guard.release();
  }
});

test("a live owner retains exclusivity and only its matching guard can release it", async () => {
  const fixture = await createCommittedTestRepository("live-project-state-pid-");
  const guardPath = join(fixture.repositoryPath, ".git", "coordination-project-state.lock");
  const guard = await acquireProjectStateOperationGuard(fixture.repositoryPath, "application start");
  const retained = await readFile(guardPath, "utf8");
  try {
    await assert.rejects(acquireProjectStateOperationGuard(fixture.repositoryPath, "state relocation"), /Project state is in use/);
    assert.equal(await readFile(guardPath, "utf8"), retained);
    const replacement = JSON.stringify({ ...JSON.parse(retained), token: "replacement-owner" });
    await writeFile(guardPath, replacement);
    await guard.release();
    assert.equal(await readFile(guardPath, "utf8"), replacement);
  } finally {
    await writeFile(guardPath, retained);
    await guard.release();
  }
});
