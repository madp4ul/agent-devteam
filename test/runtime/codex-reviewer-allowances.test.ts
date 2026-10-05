import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CodexReviewerAllowances, type NativeReviewerPolicyState } from "../../src/runtime/codex-reviewer-allowances.ts";
import { request, events, createRuntime } from "../support/codex-runtime-fixture.ts";
import type { ReviewerPolicyConfiguration } from "../../src/application/runtime-contract.ts";
import type { CodexClientOptionsLike } from "../../src/runtime/codex-agent-runtime.ts";

const template = (await readFile(new URL("../../src/runtime/reviewer-policy/codex-0.160.0.md", import.meta.url), "utf8"))
  .replaceAll("\r\n", "\n");
const state: NativeReviewerPolicyState = { version: "0.160.0", config: { model_provider: "openai",
  auto_review: { extra_policy: "Keep the user's existing restriction." } }, requirements: null,
  templates: [template.replace("\n{{ extra_policy }}\n", "")] };

test("project guidance is appended for fresh, resumed and replacement threads with exact source evidence", async () => {
  const supplied: CodexClientOptionsLike[] = [];
  const configured: ReviewerPolicyConfiguration[] = [];
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => [] },
    reviewerAllowances: new CodexReviewerAllowances(async () => structuredClone(state)),
    createClient(options) {
      supplied.push(options);
      const thread = { async runStreamed() { return { events: events(
        { type: "thread.started", thread_id: "project-thread" }, { type: "turn.completed" }) }; } };
      return { startThread: () => thread, resumeThread(id) {
        if (id === "missing") throw new Error("Missing thread");
        return thread;
      } };
    },
  });
  for (const [index, resumeThreadId] of [undefined, "project-thread", "missing"].entries()) {
    const run = request(`project-${index}`, "T-0010");
    if (resumeThreadId !== undefined) run.resumeThreadId = resumeThreadId;
    run.projectAllowances = { source: "launch-argument", launchId: `launch-${index}`,
      projectRepositoryPath: "D:/project", text: `Browser validation ${index}.\nKeep data local.` };
    // Include both sources only on the fresh attempt; others have project-only text.
    if (index === 0) run.agent.allowances = ["Inspect the diff."];
    const outcome = await runtime.run(run, { started() {}, reviewerPolicyConfigured: (value) => configured.push(value) });
    assert.equal(outcome.status, "completed");
    if (index === 2) assert.equal(outcome.threadContinuity, "replaced");
    const policy = (supplied[index]?.config?.auto_review as { extra_policy: string }).extra_policy;
    assert.match(policy, /^Keep the user's existing restriction\./);
    assert.match(policy, /User-authorized project launch allowances/);
    assert.match(policy, new RegExp(`Browser validation ${index}`));
    if (index === 0) assert.ok(policy.indexOf("Inspect the diff.") < policy.indexOf("Browser validation"));
    else assert.doesNotMatch(policy, /Inspect the diff|Browser validation 0/);
    assert.equal(configured[index]?.preparedPolicy?.extraPolicy, policy);
    assert.equal(configured[index]?.preparedPolicy?.inheritedExtraPolicy, "Keep the user's existing restriction.");
    assert.equal(configured[index]?.preparedPolicy?.workspacePath, run.workspace.path);
    assert.equal(configured[index]?.preparedPolicy?.nativeVersion, "0.160.0");
    assert.equal(supplied[index]?.config?.approval_policy, "on-request");
    assert.equal(supplied[index]?.config?.approvals_reviewer, "auto_review");
  }
});

test("runtime supplies scoped guidance and preserves inherited policy on fresh and resumed attempts", async () => {
  const supplied: CodexClientOptionsLike[] = [];
  const configured: ReviewerPolicyConfiguration[] = [];
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    reviewerAllowances: new CodexReviewerAllowances(async () => structuredClone(state)),
    createClient(options) {
      supplied.push(options);
      const thread = { async runStreamed() { return { events: events(
        { type: "thread.started", thread_id: "allowance-thread" }, { type: "turn.completed" }) }; } };
      return { startThread: () => thread, resumeThread: () => thread };
    },
  });
  const first = request("allowance-fresh", "T-0010");
  first.agent.allowances = ["Run only the scoped test suite."];
  await runtime.run(first, { started() {}, reviewerPolicyConfigured: (value) => configured.push(value) });
  const resumed = request("allowance-resumed", "T-0010");
  resumed.resumeThreadId = "allowance-thread";
  resumed.agent.allowances = ["Inspect the diff."];
  await runtime.run(resumed, { started() {}, reviewerPolicyConfigured: (value) => configured.push(value) });
  const freshPolicy = supplied[0]?.config?.auto_review as { extra_policy: string; experimental_policy_template: string };
  const resumedPolicy = supplied[1]?.config?.auto_review as { extra_policy: string };
  assert.match(freshPolicy.extra_policy, /^Keep the user's existing restriction\./);
  assert.match(freshPolicy.extra_policy, /Run only the scoped test suite/);
  assert.equal(freshPolicy.experimental_policy_template, template);
  assert.match(resumedPolicy.extra_policy, /Inspect the diff/);
  assert.doesNotMatch(resumedPolicy.extra_policy, /Run only/);
  assert.equal(configured[0]?.status, "active");
  assert.notEqual(configured[0]?.policyHash, configured[1]?.policyHash);
  assert.equal(supplied[0]?.config?.approval_policy, "on-request");
  assert.equal(supplied[0]?.config?.approvals_reviewer, "auto_review");
});

test("unsupported or changed policy falls back without changing baseline approvals", async () => {
  for (const modified of [
    { ...state, version: "0.161.0" },
    { ...state, requirements: { guardian_extra_policy: "Managed guidance." } },
    { ...state, templates: [template + "\nA new restriction."] },
    { ...state, templates: [] },
    { ...state, config: { model_provider: "custom" } },
    { ...state, config: { auto_review: { extra_policy: 42 } } },
  ]) {
    let received: CodexClientOptionsLike | undefined;
    let configuration: ReviewerPolicyConfiguration | undefined;
    const runtime = createRuntime({
      mcpServer: { command: "node", args: () => [] },
      reviewerAllowances: new CodexReviewerAllowances(async () => modified),
      createClient(options) {
        received = options;
        return { startThread: () => ({ async runStreamed() {
          return { events: events({ type: "thread.started", thread_id: "fallback" }, { type: "turn.completed" }) };
        } }) };
      },
    });
    const run = request("fallback", "T-0010");
    run.projectAllowances = { source: "launch-argument", launchId: "fallback-launch",
      projectRepositoryPath: "D:/project", text: "Inspect the diff." };
    assert.equal((await runtime.run(run, { started() {}, reviewerPolicyConfigured: (value) => configuration = value })).status, "completed");
    assert.equal(configuration?.status, "unavailable");
    assert.equal(received?.config?.auto_review, undefined);
    assert.equal(received?.config?.approval_policy, "on-request");
    assert.equal(received?.config?.approvals_reviewer, "auto_review");
  }
});

test("corrected native templates do not need an override and inspection failures degrade to baseline", async () => {
  const run = request("native-slot", "T-0010");
  run.agent.allowances = ["Inspect the diff."];
  const native = await new CodexReviewerAllowances(async () => ({ ...state, templates: [template] })).prepare(run);
  assert.equal(native.configuration.status, "active");
  assert.equal(native.config?.auto_review.experimental_policy_template, undefined);
  const failed = await new CodexReviewerAllowances(async () => { throw new Error("Private config details"); }).prepare(run);
  assert.equal(failed.configuration.status, "unavailable");
  assert.doesNotMatch(failed.configuration.reason ?? "", /Private config/);
});

test("a rejected optional config retries baseline only before any event; other errors do not replay", async () => {
  for (const scenario of ["config-before-events", "config-after-events", "command-error"]) {
    let calls = 0;
    const configurations: ReviewerPolicyConfiguration[] = [];
    const lifecycle = { started() {}, reviewerPolicyConfigured: (value: ReviewerPolicyConfiguration) => configurations.push(value) };
    const runtime = createRuntime({
      mcpServer: { command: "node", args: () => [] },
      reviewerAllowances: new CodexReviewerAllowances(async () => state),
      createClient(options) {
        return { startThread: () => ({ async runStreamed() {
          calls++;
          return { events: (async function* () {
            if (scenario === "config-after-events") yield { type: "thread.started" as const, thread_id: "started" };
            if (options.config?.auto_review !== undefined) {
              throw new Error(scenario === "command-error" ? "Command failed" : "unknown field `extra_policy` in auto_review");
            }
            yield { type: "thread.started" as const, thread_id: "baseline" };
            yield { type: "turn.completed" as const, usage: { input_tokens: 0, cached_input_tokens: 0,
              cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 } };
          })() };
        } }) };
      },
    });
    const run = request(scenario, "T-0010");
    run.projectAllowances = { source: "launch-argument", launchId: "rejection-launch",
      projectRepositoryPath: "D:/project", text: "Inspect the diff." };
    if (scenario === "config-before-events") {
      assert.equal((await runtime.run(run, lifecycle)).status, "completed");
      assert.equal(calls, 2);
      assert.deepEqual(configurations.map(({ status }) => status), ["active", "unavailable"]);
      assert.match(configurations[0]?.preparedPolicy?.extraPolicy ?? "", /Inspect the diff/);
      assert.equal(configurations[1]?.preparedPolicy, undefined);
    } else if (scenario === "config-after-events") {
      assert.equal((await runtime.run(run, lifecycle)).status, "failed");
      assert.equal(calls, 1);
    } else {
      await assert.rejects(runtime.run(run, lifecycle));
      assert.equal(calls, 1);
    }
  }
});

test("empty allowances skip inspection; replacement preserves policy; permission denials do not retry", async () => {
  let inspections = 0;
  let replacements = 0;
  const supplied: CodexClientOptionsLike[] = [];
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => [] },
    reviewerAllowances: new CodexReviewerAllowances(async () => { inspections++; return state; }),
    createClient(options) {
      supplied.push(options);
      return {
        resumeThread() { throw new Error("Missing saved thread"); },
        startThread() {
          replacements++;
          return { async runStreamed() { return { events: events(
            { type: "thread.started", thread_id: "replacement" },
            { type: "item.completed", item: { type: "mcp_tool_call", server: "coordination",
              tool: "attempt.permission_block.report", status: "completed", arguments: { reason: "Reviewer denied." },
              result: { content: [{ type: "text", text: JSON.stringify({ accepted: true }) }] } } },
            { type: "turn.completed" },
          ) }; } };
        },
      };
    },
  });
  await runtime.run(request("no-allowances", "T-0010"), { started() {} });
  assert.equal(inspections, 0);
  const run = request("replacement", "T-0010");
  run.resumeThreadId = "missing-thread";
  run.agent.allowances = ["Inspect the diff."];
  const result = await runtime.run(run, { started() {} });
  assert.equal(result.status, "permission-blocked");
  assert.equal(result.threadContinuity, "replaced");
  assert.equal(inspections, 1);
  assert.equal(replacements, 2);
  assert.equal(supplied.length, 2);
  assert.match((supplied[1]?.config?.auto_review as { extra_policy: string }).extra_policy, /Inspect the diff/);
});
