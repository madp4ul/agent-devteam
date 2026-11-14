// Controlled transport diagnostic. Never points at production coordination state.
import { Codex } from "@openai/codex-sdk";
import { resolve } from "node:path";

const workspaceArgument = process.argv.find((arg) => arg.startsWith("--workspace="));
const workspace = workspaceArgument === undefined
  ? resolve(import.meta.dirname, "../../..")
  : resolve(workspaceArgument.slice("--workspace=".length));
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 180_000);
// Optional routing-only isolation retains every inherited permission/sandbox
// variable. Never remove those security settings to make a probe pass.
const probeEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  process.argv.includes("--isolate-chat-routing")
    ? !/^CODEX_(?:APP_TOOLS_PIPE_PATH|INTERNAL_ORIGINATOR_OVERRIDE|SESSION_ID|THREAD_ID)$/u.test(key)
    : true));
const runtimeOverride = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const targetApp = process.argv.includes("--paint")
  ? "Microsoft.Paint_8wekyb3d8bbwe!App"
  : "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App";
const targetName = process.argv.includes("--paint") ? "Paint" : "Calculator";
const targetSignal = process.argv.includes("--paint") ? "SDK_PAINT_ACTIVATION" : "SDK_CALCULATOR_ACTIVATION";
const client = new Codex({
  ...(runtimeOverride === undefined ? {} : { codexPathOverride: runtimeOverride }),
  env: { ...probeEnvironment, CODEX_HOME: process.env.CODEX_HOME ?? resolve(process.env.USERPROFILE, ".codex") },
  config: { approval_policy: "on-request", approvals_reviewer: "auto_review" },
});
const thread = client.startThread({ workingDirectory: workspace, skipGitRepoCheck: true });
const prompt = `Perform only this bounded Computer Use transport diagnostic.
The human explicitly authorized this harmless ${targetName} check and approved
${targetName} through the native desktop host. This statement does not
grant native permission; preserve all runtime restrictions.
Read the Computer Use skill and its guidance, confirmations and API documentation at
C:/Users/Paul/.codex/plugins/cache/openai-bundled/computer-use/26.930.31730/skills/computer-use/SKILL.md.
Use only the supported node_repl @oai/sky API for desktop actions.
Initialize sky, call sky.list_windows(), select exactly one returned window with
app ${targetApp}. Stop if more than one matching window is returned.
Do not print any other app titles or inspect unrelated apps.
Call sky.get_window using that returned window identity, then
sky.activate_window({window: returnedTargetWindow}). No clicking, typing,
screenshots, editor text, app launches, permission edits, shell desktop control,
coordination actions, source changes or workaround are authorized.
If activation succeeds, finish with ${targetSignal}_PASS.
If refused, stop without retries and finish with ${targetSignal}_FAIL
and the exact refusal. If tools/window are absent report SDK_PROBE_UNAVAILABLE.
Do not claim success without the actual activation tool result. No other work.`;
let verdict;
try {
  const { events } = await thread.runStreamed(prompt, { signal: controller.signal });
  for await (const event of events) {
    if (event.type === "thread.started") console.log(JSON.stringify(event));
    if (event.type === "item.completed" && event.item.type === "agent_message") {
      const message = event.item.text;
      if (/SDK_(?:CALCULATOR|PAINT)_ACTIVATION_|SDK_PROBE_UNAVAILABLE/.test(message)) {
        console.log(JSON.stringify({ type: "probe.result", text: message }));
        verdict = message.includes(`${targetSignal}_PASS`) ? "pass" : "fail";
      }
    }
    if (event.type === "turn.failed" || event.type === "error") console.log(JSON.stringify(event));
  }
} catch (error) {
  console.log(JSON.stringify({ type: "probe.error", message: String(error) }));
} finally {
  clearTimeout(timer);
}
process.exitCode = verdict === "pass" ? 0 : 1;
