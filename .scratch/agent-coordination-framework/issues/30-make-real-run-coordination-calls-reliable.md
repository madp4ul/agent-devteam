# 30 — Make Real-Run Coordination Calls Reliable

**What to build:** Diagnose and correct repeated cancellation of the
project-scoped coordination MCP tools during real Codex SDK activations. A run
must be able to inspect its current task and perform its required comment and
move commands, while failures retain enough evidence to distinguish transport,
approval, permission, and lifecycle causes. Failures before an attempt or Codex
thread starts must remain durably visible rather than existing only in the
transient Resume response.

**Blocked by:** 17 — Complete a Minimal Codex Handoff

**Status:** resolved

- [x] Establish a deterministic, red-capable reproduction at the assembled
  Codex-runtime/MCP boundary for the observed repeated
  `coordination.inspect_task` cancellation.
- [x] Determine whether cancellation originates in Codex approval handling,
  MCP stdio process lifecycle, scoped-token or HTTP adapter communication, the
  Windows launch identity, or another concrete boundary; record the confirmed
  cause and ruled-out alternatives.
- [x] A real activation can call `coordination.inspect_task` from its detached
  task worktree under the user's normal Codex sandbox and approval policy.
- [x] The same activation can add its idempotent task comment and perform its
  revision-checked task movement without the coordination tool channel being
  canceled between calls.
- [x] Tool cancellation retains an actionable diagnostic, including the tool
  name and underlying cause, in inspectable attempt evidence.
- [x] Activation startup failures that occur before an attempt starts—such as
  repository ownership, starting-ref resolution, or Git worktree registration
  failures—are persisted with the affected task and activation, timestamp,
  failing boundary, and complete actionable diagnostic.
- [x] The board and task-details UI expose that persisted startup diagnostic
  until an explicit recovery action resolves it. The immediate Resume alert
  remains useful feedback but is never the only copy of the failure.
- [x] Host logs emit the same startup failure with task and activation
  correlation IDs so a source-started application has an operator-visible
  record outside the browser. Sensitive task content and credentials are not
  written to the log.
- [x] Browser and application tests prove that a pre-attempt worktree failure
  survives navigation and application restart and remains discoverable without
  repeating the failed Resume request. Retry and Dismiss behavior remains owned
  by ticket 24.
- [x] A run whose required coordination calls all fail cannot be presented as
  an ordinary successful completion that silently advances or strands workflow
  responsibility. Define and test the correct failed or permission-blocked
  outcome at the existing application/runtime seam.
- [x] Controlled adapter coverage protects the diagnosed failure mode, and the
  opt-in real Codex handoff test proves inspection, comment, and movement
  through the assembled local host.
- [x] Windows verification covers the supported source-start identity and Git
  worktree permissions without changing global Git trust configuration.

## Comments

- Treat this as a near-term defect before relying on further real-agent
  end-to-end workflow verification.
- During a live Windows review on 2026-08-03, the transcript displayed
  `coordination.inspect_task · failed` three times for the Architecture
  Designer. Its completed attempt (`5389495d-0935-4288-9575-62d8b07f4b69`,
  thread `019fc8bd-ccde-7b23-a21d-e2d1ddbd47d5`) retained this summary:
  "Blocked: all three required coordination task-inspection calls were
  canceled. No repository changes, task comments, or board movements were
  made."
- The following Implementation Agent attempt
  (`42fa91f8-9410-4396-afed-495a8b0570aa`, thread
  `019fc8be-7ed0-7350-b622-46bb9193fa20`) created the requested `test.txt`, but
  its summary says coordination calls were repeatedly canceled, preventing the
  required task comment and move to Code Review. Both attempts were persisted
  as completed, exposing a second outcome-classification concern.
- The framework was stopped immediately after the user reported the transcript
  evidence. Full transcript items were runtime-owned and therefore unavailable
  after shutdown; the durable attempt summaries and thread IDs above remain in
  the preserved review database.
- The same review exposed a diagnostics gap before Codex dispatch. The public
  `POST /api/automation/resume` response correctly returned HTTP 409 with
  `runtime-start-failed` and the full Git ownership or `.git/worktrees`
  permission error, and the React board could render that response as an alert.
  However, no attempt existed yet, the diagnostic was not persisted on the
  affected task or activation, and the host log did not record it. Missing the
  transient alert therefore left no durable product surface explaining why
  queued work remained paused.

## Answer

The confirmed coordination-call failure was an approval configuration mismatch,
not an MCP process-lifetime or scoped-token failure. The runtime-owned Codex
session had no interactive approval channel, while the scoped `coordination` MCP
server inherited interactive tool-approval behavior. Codex therefore ended each
required coordination tool call immediately with `user cancelled MCP tool call`.
The runtime then trusted the surrounding completed turn and incorrectly persisted
a completed attempt.

A controlled production-shaped run kept the real MCP stdio process, HTTP adapter,
scoped bearer token, and task revision boundary alive across inspect, comment, and
move calls. That ruled out server lifetime, token expiry, adapter communication,
and ordinary timeout hypotheses. The real runtime transcript showed the tools were
available and every failure occurred at zero duration, isolating the noninteractive
approval boundary. A missing user home/read-only Codex state observed inside the
offline Windows test sandbox was a separate pre-thread environment limitation; a
source-start run under the normal user identity reproduced the original cancellation
and passed after the fix.

The runtime now configures only the scoped coordination MCP server with
`default_tools_approval_mode = "approve"`; it does not weaken the existing global
sandbox or approval-policy behavior. Unresolved failures from required coordination
tools now force a failed attempt even if Codex reports the turn itself as completed,
and the persisted transcript records the affected tools, summary, and available
cause without inventing a deeper cancellation explanation.

Failures before a Codex attempt/thread exists are now durable application state.
Workspace startup errors are classified by boundary, stored with activation and task
correlation plus timestamp and full diagnostic, and create operator attention. The
same evidence is exposed through the board, task timeline, correlated host log, and
survives a coordination-host restart. Recovery remains explicit: Resume is rejected
with `runtime-start-failed` and the task is paused rather than silently retried. Git
workspace preparation uses command-scoped repository access only; an automated
Windows check proves global `safe.directory` configuration is unchanged.

Verification completed with:

- `pnpm.cmd run typecheck`
- `pnpm.cmd test` - 49 passed, with the opt-in live Codex test skipped
- `pnpm.cmd run build`
- `pnpm.cmd run test:browser` - 4 passed
- the opt-in real Codex handoff test - reproduced the cancellation before the fix
  and passed after it, exercising inspect, comment, move, and reviewer inspect calls
- parallel Standards and Spec reviews - no remaining findings
