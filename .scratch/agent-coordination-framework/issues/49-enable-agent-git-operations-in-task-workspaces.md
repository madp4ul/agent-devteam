# 49 — Trust Task Workspaces for Git Inspection

**What to build:** Every framework-launched agent can run its first local Git
inspection inside the assigned task workspace without Git rejecting the
Windows sandbox identity, while Git trust remains exact, process-local, and
independent of the user's Codex permission policy.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Every new and resumed agent thread receives the exact current
  task-workspace path as a run-scoped Git `safe.directory` value.
- [x] The framework never uses `safe.directory=*`, never writes global or
  repository Git configuration, and removes inherited `GIT_CONFIG_COUNT`,
  `GIT_CONFIG_KEY_n`, and `GIT_CONFIG_VALUE_n` entries before supplying its one
  exact trust value.
- [x] Windows paths containing spaces or punctuation are canonicalized without
  broadening trust.
- [x] The launch boundary continues to inherit the user's ordinary Codex
  sandbox and approval configuration; this issue does not introduce a
  framework-owned permission profile.
- [x] Unit tests cover new and resumed threads, environment filtering, exact
  Windows path handling, and preservation of the coordination MCP server.
- [x] An opt-in integration scenario using a real linked task worktree proves
  that the first `git status --short` succeeds without a command-line
  `safe.directory` override before the agent performs its normal coordination
  handoff.
- [x] Operator and domain documentation distinguish Git ownership trust from
  permission to write linked-worktree metadata.

## Context

Task worktrees are created by the host user, while native-Windows sandboxed
commands run under a different identity. Git therefore rejects the first
command as dubious ownership unless the task workspace is trusted. The
framework knows the exact workspace path for every attempt and can supply that
trust through the Codex process environment without changing persistent Git
configuration.

This trust fixes repository ownership inspection only. A linked worktree's Git
administration data remains under the original repository's
`.git/worktrees/<task>` directory and may still require sandbox escalation for
branch, stage, and commit operations. Issue 51 investigates that broader
capability using supported Codex SDK approval mechanisms.

## Comments

- The initial implementation attempted to define a custom Codex permission
  profile and add the resolved Git common directory through the TypeScript
  SDK. A native-Windows proof showed that `additionalDirectories` did not make
  `.git/worktrees/<task>` writable, and the SDK's flattened config override
  could not faithfully express the required dynamic permission-profile table.
  The unsupported profile, its legacy-config preflight, and documentation that
  claimed shared Git metadata was writable were removed rather than committed
  as a partial or misleading solution.
- A later SDK probe established that `approval_policy = "on-request"` together
  with `approvals_reviewer = "auto_review"` can approve the linked-worktree Git
  metadata update without App Server. That behavior belongs to the broader
  capability investigation in issue 51; it is deliberately not folded into
  this narrowly proven trust change.

## Answer

Framework-launched SDK threads now receive one exact, process-local
`safe.directory` entry for their task workspace after inherited Git-config
environment entries are removed. New and resumed Windows paths are covered by
unit tests, and the opt-in real Codex integration proved that an unmodified
first `git status --short` succeeds before the agent completes its coordination
handoff. Broader Git mutation and approval parity moved to issue 51.
