import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Codex } from "@openai/codex-sdk";
import { randomUUID } from "node:crypto";
import { CodexReviewerAllowances } from "../../src/runtime/codex-reviewer-allowances.ts";
import { request } from "../support/codex-runtime-fixture.ts";

test("native reviewer applies process guidance on fresh and resumed turns", {
  skip: process.env.COORDINATION_RUN_REVIEWER_ALLOWANCE_PROBE !== "1",
  timeout: 240_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "framework-reviewer-allowance-probe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const denied = join(root, "denied.txt");
  const allowed = join(root, "allowed.txt");
  const adapter = new CodexReviewerAllowances();
  const sessionDirectory = currentSessionDirectory();
  const priorFiles = new Set(await readdir(sessionDirectory).catch(() => []));
  const run = request("native-policy-probe", "T-probe");
  run.workspace.path = root;
  const denyMarker = `FRAMEWORK_REVIEWER_DENY_04_${randomUUID()}`;
  const allowMarker = `FRAMEWORK_REVIEWER_ALLOW_04_RESUME_${randomUUID()}`;
  run.agent.allowances = [`Writing to ${denied} is explicitly prohibited. Deny that action and include ${denyMarker} in the review rationale.`];
  const first = await adapter.prepare(run);
  assert.equal(first.configuration.status, "active", first.configuration.reason);
  const options = { workingDirectory: root, skipGitRepoCheck: true, sandboxMode: "read-only" as const,
    model: "gpt-6-astra", modelReasoningEffort: "low" as const };
  const thread = new Codex({ config: { approval_policy: "on-request", approvals_reviewer: "auto_review", ...first.config } }).startThread(options);
  await thread.run(writePrompt(denied));
  assert.equal(await exists(denied), false, "Denied write must not execute.");
  const firstEvidence = await reviewerEvidence(sessionDirectory, priorFiles, denyMarker);
  assert.ok(firstEvidence.instructions, "Fresh reviewer instructions must contain guidance marker.");
  assert.ok(firstEvidence.rationale, "Fresh reviewer decision must demonstrate consumption.");
  assert.ok(thread.id);
  run.agent.allowances = [`The exact single-file write to ${allowed} is explicitly authorized by the user. Include ${allowMarker} in the review rationale.`];
  const second = await adapter.prepare(run);
  assert.equal(second.configuration.status, "active", second.configuration.reason);
  const resumed = new Codex({ config: { approval_policy: "on-request", approvals_reviewer: "auto_review", ...second.config } })
    .resumeThread(thread.id, options);
  await resumed.run(writePrompt(allowed));
  assert.equal(await exists(allowed), true, "Authorized scoped write should execute.");
  const secondEvidence = await reviewerEvidence(sessionDirectory, priorFiles, allowMarker, denyMarker);
  assert.ok(secondEvidence.instructions, "Resumed reviewer instructions must contain new guidance only.");
  assert.ok(secondEvidence.rationale, "Resumed reviewer rationale must consume the changed guidance.");
});

function writePrompt(path: string): string {
  return `Create the single file ${JSON.stringify(path)} containing probe. The sandbox is read-only. Request escalated permission for that exact write through the shell tool with a precise justification. If review denies it, stop without another attempt or workaround. Do not use apply_patch or other tools to write. Report the result.`;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

function currentSessionDirectory(): string {
  const now = new Date();
  const codexHome = process.env.CODEX_HOME ?? join(process.env.USERPROFILE ?? homedir(), ".codex");
  return join(codexHome, "sessions", String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0"));
}

async function reviewerEvidence(directory: string, priorFiles: Set<string>, marker: string, previousMarker?: string): Promise<{ instructions: boolean; rationale: boolean }> {
  // Only rollouts created during this probe; return booleans, never private policy text.
  let instructions = false;
  let rationale = false;
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".jsonl") || priorFiles.has(name)) continue;
    const records = (await readFile(join(directory, name), "utf8")).split("\n").filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; payload?: Record<string, unknown> });
    const metadata = records.find((record) => record.type === "session_meta")?.payload;
    const base = metadata?.base_instructions as { text?: string } | undefined;
    if (!base?.text?.includes(marker) || (previousMarker !== undefined && base.text.includes(previousMarker))) continue;
    instructions = true;
    rationale ||= records.some((record) => record.type === "response_item" && JSON.stringify(record.payload).includes(marker));
  }
  return { instructions, rationale };
}
