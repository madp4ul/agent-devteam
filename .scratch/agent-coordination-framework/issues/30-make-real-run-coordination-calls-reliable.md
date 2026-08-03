# 30 — Make Real-Run Coordination Calls Reliable

**What to build:** Diagnose and correct repeated cancellation of the
project-scoped coordination MCP tools during real Codex SDK activations. A run
must be able to inspect its current task and perform its required comment and
move commands, while failures retain enough evidence to distinguish transport,
approval, permission, and lifecycle causes. Failures before an attempt or Codex
thread starts must remain durably visible rather than existing only in the
transient Resume response.

**Blocked by:** 17 — Complete a Minimal Codex Handoff

**Status:** ready-for-agent

- [ ] Establish a deterministic, red-capable reproduction at the assembled
  Codex-runtime/MCP boundary for the observed repeated
  `coordination.inspect_task` cancellation.
- [ ] Determine whether cancellation originates in Codex approval handling,
  MCP stdio process lifecycle, scoped-token or HTTP adapter communication, the
  Windows launch identity, or another concrete boundary; record the confirmed
  cause and ruled-out alternatives.
- [ ] A real activation can call `coordination.inspect_task` from its detached
  task worktree under the user's normal Codex sandbox and approval policy.
- [ ] The same activation can add its idempotent task comment and perform its
  revision-checked task movement without the coordination tool channel being
  canceled between calls.
- [ ] Tool cancellation retains an actionable diagnostic, including the tool
  name and underlying cause, in inspectable attempt evidence.
- [ ] Activation startup failures that occur before an attempt starts—such as
  repository ownership, starting-ref resolution, or Git worktree registration
  failures—are persisted with the affected task and activation, timestamp,
  failing boundary, and complete actionable diagnostic.
- [ ] The board and task-details UI expose that persisted startup diagnostic
  until an explicit recovery action resolves it. The immediate Resume alert
  remains useful feedback but is never the only copy of the failure.
- [ ] Host logs emit the same startup failure with task and activation
  correlation IDs so a source-started application has an operator-visible
  record outside the browser. Sensitive task content and credentials are not
  written to the log.
- [ ] Browser and application tests prove that a pre-attempt worktree failure
  survives navigation and application restart and remains discoverable without
  repeating the failed Resume request. Retry and Dismiss behavior remains owned
  by ticket 24.
- [ ] A run whose required coordination calls all fail cannot be presented as
  an ordinary successful completion that silently advances or strands workflow
  responsibility. Define and test the correct failed or permission-blocked
  outcome at the existing application/runtime seam.
- [ ] Controlled adapter coverage protects the diagnosed failure mode, and the
  opt-in real Codex handoff test proves inspection, comment, and movement
  through the assembled local host.
- [ ] Windows verification covers the supported source-start identity and Git
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
