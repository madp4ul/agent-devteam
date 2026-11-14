# Select workspace-write for framework agent runs

Status: accepted

## Context

Autonomous V2 task T-0052 retained a read-only native conversation profile across
retries while fresh conversations obtained workspace-write. The runtime adapter
explicitly selected on-request approval and native Auto-review but left sandbox
selection to native defaults and saved conversation state. User authorization
could not correct that capability selection. An explicit native resume override
repaired the existing conversation without replacing its history.

## Decision

Select `sandboxMode: "workspace-write"` in the shared SDK thread options for every
agent start and resume. Retries, replacement threads and optional-reviewer-config
fallback use the same selection. This is the one preventive layer: no additional
preflight service, monitoring system or per-agent permission configuration.

Keep the existing task workspace, scoped attachment roots, on-request approval,
native Auto-review and enforced managed restrictions. Do not retry a rejected
workspace-write selection with weaker permissions or replace the conversation
merely because it previously used read-only.

## Consequences

The framework owns its writable execution selection rather than inheriting an
unrelated desktop setting or stale conversation choice. Existing usable threads
retain their identity and history. Native policy may still reject configuration
or individual operations; ordinary failure handling remains in effect.

Workspace-write protects linked Git metadata. Git mutations still require scoped
escalation when denied by that sandbox, and approval is not guaranteed. This
decision does not remove those boundaries or add automatic command-retry loops.

Runtime-seam tests cover starts, resumed retries and replacements. An opt-in real
SDK regression seeds a read-only conversation, resumes it through the framework,
checks native turn policy and verifies an ordinary workspace write on the same
thread. Routine tests do not make paid model calls.
