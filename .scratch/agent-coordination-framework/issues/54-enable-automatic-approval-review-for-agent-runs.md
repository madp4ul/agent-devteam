# 54 — Enable Automatic Approval Review for Agent Runs

**What to build:** Give every framework-launched Codex attempt the smallest
supported noninteractive approval policy that can complete ordinary development
work in a linked task worktree, and make an unresolved permission block
continuable with explicit user authorization in the resumed thread.

**Blocked by:** None

**Status:** resolved

- [x] Every new and resumed SDK thread sets `approval_policy = "on-request"`
  and `approvals_reviewer = "auto_review"` through supported SDK configuration.
- [x] The runtime continues to inherit the user's effective sandbox, web-search,
  command-network, project, and unrelated MCP configuration. It does not set a
  custom permission profile, `sandboxMode`, `webSearchMode`,
  `networkAccessEnabled`, or `additionalDirectories`.
- [x] The framework-owned coordination MCP server and exact process-local Git
  `safe.directory` value remain present and unchanged.
- [x] Unit tests prove the two approval values for fresh and resumed threads,
  prove that unrelated permission settings remain absent, and preserve the
  existing MCP and environment assertions.
- [x] The opt-in real-SDK probe covers linked-worktree status, branch creation,
  file editing, test execution, staging, committing, and final clean status. It
  asserts the protected-metadata denial followed by a successful reviewed retry
  for branch, stage, and commit operations.
- [x] Continuing a permission-blocked activation requires a concise user
  continuation message describing the authorization or external policy/action
  change. Persist it and include it in the resumed attempt prompt so Auto-review
  can assess the retry with explicit user context.
- [x] The continuation UI explains that continuation is a retry, not a bypass:
  Auto-review can still deny the action, and the user may instead complete the
  blocked operation externally or change managed policy before continuing.
- [x] A denied, timed-out, unavailable, or unsupported approval that prevents
  required work still becomes the existing explicit
  `report_permission_block` outcome and never enters automatic technical retry.
- [x] Application, persistence/restart, runtime, and browser tests cover the
  authorization message, resumed-thread prompt, repeat permission blocking, and
  unchanged queue/suspension behavior.
- [x] Operator documentation states the fixed approval/reviewer overrides,
  inherited settings, scoped nature of approvals, and supported recovery path.

## Context

Issue 51 established that the TypeScript SDK is sufficient and that protected
linked-worktree Git metadata should be crossed through scoped escalation, not
made ordinarily writable. A native-Windows SDK 0.146.0 proof showed the first
branch, stage, and commit commands denied by the sandbox and their scoped
Auto-reviewed retries succeeding, followed by a clean committed worktree.

The SDK stream has no approval-request, decision, reviewer-rationale, timeout,
or response event. Production recovery therefore remains agent-authored
`report_permission_block` plus a later user continuation. The existing bare
Continue action carries no user message, so it cannot yet give the resumed
thread or Auto-review the explicit authorization context documented for a
denial override.

## References

- [Issue 51 research](../research/sdk-capability-parity-and-automatic-approvals.md)
- [Issue 51](./51-investigate-sdk-capability-parity-and-automatic-approvals.md)
- [Issue 24 permission-block recovery](./24-recover-failed-permission-blocked-attempts.md)

## Answer

Every SDK attempt now adds only `approval_policy = "on-request"` and
`approvals_reviewer = "auto_review"` beside the existing coordination MCP and
exact Git trust configuration. Sandbox, web, network, project, unrelated MCP,
and managed policy remain inherited. Controlled runtime tests cover fresh and
resumed threads, and the opt-in native-Windows probe retains the complete
linked-worktree denial, reviewed retry, edit, test, stage, commit, and clean
status proof.

Permission-block continuation now requires a trimmed user authorization/change
message. It is stored on the queued activation, survives application restart,
and is included in the resumed attempt prompt. The browser disables Continue
until that context is supplied and states that Auto-review may deny the retry
again. Repeated denials remain permission blocks, receive no automatic retry,
and require another explicit continuation.
