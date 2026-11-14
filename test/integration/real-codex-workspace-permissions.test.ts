import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { Codex } from "@openai/codex-sdk";
import { CodexAgentRuntime } from "../../src/runtime/codex-agent-runtime.ts";
import { request } from "../support/codex-runtime-fixture.ts";

const execFileAsync = promisify(execFile);

test("the real runtime overrides a saved read-only conversation without replacing it", {
  skip: process.env.COORDINATION_RUN_CODEX_INTEGRATION !== "1",
  timeout: 180_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-permissions-"));
  await execFileAsync("git", ["init", directory]);
  const env = Object.fromEntries(Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ));
  const seed = new Codex({ env }).startThread({
    workingDirectory: directory, sandboxMode: "read-only", approvalPolicy: "on-request",
  });
  const signal = AbortSignal.timeout(150_000);
  await seed.run("Reply only: Permission regression seeded. Do not call tools or modify files.", { signal });
  assert.ok(seed.id);
  const policiesBefore = await recordedSandboxModes(seed.id);
  assert.equal(policiesBefore.at(-1), "read-only");
  await writeFile(join(directory, "write-proof.cjs"),
    "require('node:fs').writeFileSync('workspace-proof.txt', 'workspace-write verified');\n");

  const runtime = new CodexAgentRuntime({
    mcpServer: { command: process.execPath, args: () => [] },
    // This proof exercises the runtime's SDK permission selection, not coordination tools.
    // Disable the unused MCP server while preserving all other submitted runtime configuration.
    createClient: (options) => new Codex({ ...options, config: {
      ...options.config, mcp_servers: { coordination: { command: process.execPath, enabled: false } },
    } }),
    sessionEvidenceReader: { readLatestContextWindowUsage: async () => null },
  });
  const resumed = request("permission-regression", "T-0052");
  resumed.workspace.path = directory;
  resumed.resumeThreadId = seed.id;
  resumed.attempt = {
    number: 2, precedingOutcome: { status: "failed", summary: "Saved read-only policy." },
    thread: "resumed", continuationMessage: null,
  };
  resumed.task.description = "Verify workspace writes after resuming saved read-only state.";
  resumed.agent.instructions = "Run only node write-proof.cjs in the ordinary sandbox, then finish. "
    + "Use cmd.exe with login=false on Windows. Do not request escalation or change permissions.";
  resumed.process.guidance = "This is a bounded permission regression; do not coordinate a handoff.";
  resumed.board.guidance = "Finish this diagnostic without moving or commenting on tasks.";
  const outcome = await runtime.run(resumed, { started() {} }, signal);
  assert.equal(outcome.status, "completed", JSON.stringify(outcome));
  assert.equal(outcome.threadId, seed.id);
  assert.equal(outcome.threadContinuity, undefined);
  assert.equal(await readFile(join(directory, "workspace-proof.txt"), "utf8"), "workspace-write verified");
  const policiesAfter = await recordedSandboxModes(seed.id);
  assert.ok(policiesAfter.length > policiesBefore.length);
  assert.equal(policiesAfter.at(-1), "workspace-write");
});

async function recordedSandboxModes(threadId: string): Promise<string[]> {
  const home = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const file = await findSessionFile(join(home, "sessions"), threadId);
  assert.ok(file, "Native session evidence must be available for the permission assertion.");
  return (await readFile(file, "utf8")).split(/\r?\n/u).filter(Boolean).map(
    (line) => JSON.parse(line) as { type?: string; payload?: { sandbox_policy?: { type?: string } } },
  ).filter((record) => record.type === "turn_context").flatMap(
    (record) => record.payload?.sandbox_policy?.type ?? [],
  );
}

async function findSessionFile(directory: string, threadId: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findSessionFile(path, threadId);
      if (nested !== undefined) return nested;
    } else if (entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) return path;
  }
  return undefined;
}
