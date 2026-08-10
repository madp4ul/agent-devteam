# 49 — Enable Agent Git Operations in Task Workspaces

**What to build:** Every framework-launched agent can use local Git inside its
assigned task workspace—including status, staging, committing, and branch
operations—without first failing Git's ownership check or requiring approval
for repository metadata writes, while unrelated filesystem and network access
remain sandboxed.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Every new and resumed agent thread uses one framework-owned, fixed Codex
  permission profile that grants write access to the assigned task workspace,
  required temporary paths, and the bound project's resolved Git common
  directory, while retaining only the minimum system read access needed to run
  development tools.
- [ ] The fixed profile does not use `danger-full-access`, does not broaden
  network access, and does not grant write access to the primary checkout or
  unrelated filesystem paths merely because they share a parent directory with
  the task workspace or repository.
- [ ] Agent runs use a non-interactive approval policy: operations covered by
  the fixed profile execute without prompting, while operations outside it
  remain denied and produce the existing permission-block recovery state.
- [ ] The framework supplies the exact current task-workspace path as a
  run-scoped Git `safe.directory` value to agent shell commands, so the first
  Git command succeeds despite the host and Windows sandbox identities being
  different.
- [ ] Git trust is never established with `safe.directory=*`, never written to
  global or repository Git configuration, and never retained beyond the agent
  process environment.
- [ ] Launch configuration uses Codex permission profiles without also passing
  the legacy `sandbox_mode`/`sandboxMode` setting that would take precedence
  over them. Unsupported or policy-constrained profile startup fails with an
  actionable diagnostic rather than silently falling back to read-only Git
  metadata.
- [ ] Unit tests cover the SDK launch configuration for new and resumed
  threads, Windows paths containing spaces or punctuation, exact Git trust
  scoping, and preservation of the existing coordination MCP configuration.
- [ ] An integration scenario using a real linked task worktree proves that
  the first Git inspection has no dubious-ownership failure and that an agent
  can stage a file, create or switch to a task branch, and commit without an
  `index.lock` permission failure or interactive approval.
- [ ] Existing read-only Git inspection remains compatible with the documented
  command-scoped trust convention, and the implementation does not modify the
  user's Codex configuration or Git global configuration.
- [ ] Domain and operator documentation describe the fixed
  workspace-and-repository-Git authority supplied to every framework agent and
  its distinction from process or role instructions.
- [ ] A future project-wide permission selector is recorded as deferred work;
  this issue adds no process-, board-, or agent-level permission setting.

## Context

The current Codex `workspace-write` sandbox deliberately protects a worktree's
`.git` pointer and the resolved shared Git metadata as read-only. In addition,
task worktrees created by the host user appear to Git as owned by a different
identity when commands run through the native Windows sandbox. The observed
sequence is therefore two independent failures: Git first reports dubious
ownership, and retrying with a command-scoped `safe.directory` override then
fails to create `.git/worktrees/<task>/index.lock`.

The framework already resolves the project's canonical Git common directory
during project-state startup and knows the exact task-workspace path for each
run. Pass those two paths into the Codex launch boundary. Define the permission
profile through the SDK's launch-time config overrides rather than editing
`~/.codex/config.toml`; inject the exact workspace trust through
`shell_environment_policy.set` (or an equivalently run-scoped protected Git
configuration) so agents do not need to discover and retry the failure.

This deliberately revises the earlier first-version assumption that inheriting
the user's ordinary Codex policy was sufficient. The framework now supplies a
single least-privilege local-development baseline to every role. Process files
and role instructions still do not grant authority and cannot widen that
baseline.

Merging into the primary branch, pushing, pull-request creation, and remote
network policy remain process-dependent and out of scope. A later design may
replace the fixed baseline with one project-wide user selection presented with
the rest of the framework's project configuration; do not introduce per-agent
or per-board permission administration in this issue.
