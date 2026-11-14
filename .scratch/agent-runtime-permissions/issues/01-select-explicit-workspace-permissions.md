# Explicitly select workspace-write for every agent start and resume

Type: task
Status: resolved
Blocked by: none

## Problem

The framework explicitly configures on-request approval with native Auto-review, but omits the sandbox profile when starting or resuming Codex threads. Autonomous V2 T-0052 retained a read-only profile across activations and retries even when fresh conversations obtained workspace-write. User authorization did not change that saved capability profile. A supported native resume override corrected the existing conversation and persisted across later independent resumes.

A temporary desktop account/approval-setting change is a possible temporal trigger, not a verified cause. The reproducible defect is dependence on inherited or saved sandbox selection at the framework runtime boundary.

## Accepted scope: one preventive layer

Explicitly select workspace-write whenever the framework starts or resumes an agent thread, including retries and replacement-thread paths. Use the supported SDK/native override so old read-only conversation state does not win. Keep this policy in the runtime adapter and preserve conversation identity/history whenever the native runtime supports it.

This ticket authorizes a simple runtime configuration fix, not several independent defenses. Preserve existing on-request plus Auto-review behavior, managed restrictions and task-workspace scope. Do not disable the sandbox, broaden Git trust or ACLs, or introduce per-agent permission profiles.

## Acceptance criteria

- Every fresh, resumed, retried and replacement-thread execution explicitly receives the intended workspace-write selection through the shared runtime boundary.
- A retained conversation previously saved as read-only resumes with workspace-write without requiring manual conversation replacement, native-state editing or another user authorization message.
- Native Auto-review remains the framework's approval route. Desktop approval defaults do not replace the framework's explicitly configured on-request/Auto-review pair; enforced managed policy remains authoritative.
- Preserve existing attachment-directory access, workspace isolation, model selection, reviewer allowances and recovery behavior.
- Update tests that currently assert sandboxMode is absent. Cover fresh and resumed execution plus the existing replacement/retry paths at the runtime seam. Establish a native integration regression, runnable through the repository's opt-in real-runtime mechanism, that starts with retained read-only state and verifies the framework override on resume; avoid routine paid model calls in the ordinary suite.
- Update the documented capability-ownership contract to reflect explicit workspace-write selection. Read docs/architecture.md before implementation, update it if its runtime contract changes, and record durable decision reasoning in an ADR where appropriate.

## Required delivery and cleanup

The isolated checkout is temporary implementation infrastructure, not a delivery location. Before this ticket can be resolved:

- Bring all completed, validated changes back into the main agent-devteam checkout, preserving unrelated edits and staged content. Leave this ticket's changes unstaged for user review.
- Verify the transferred changes in the main checkout and account for the running framework's source-loading behavior before replacing live runtime files.
- Remove the separate checkout and its Git worktree registration only after the changes are safely present in the main checkout. Do not leave the user maintaining another source location.
- Explicitly confirm the move-back and checkout removal in the delivery notes. If active execution makes transfer unsafe, keep the ticket incomplete until safe transfer is possible.

## Boundaries and known limitation

Workspace-write intentionally protects Git metadata. An ordinary merge may still fail creating ORIG_HEAD.lock and require a scoped escalation. This ticket prevents accidental read-only startup/resume; it does not promise sandbox-free Git writes or automatic approval of every operation.

The T-0052 investigation demonstrated that a disposable write to the exact Git metadata directory fails in the ordinary sandbox and succeeds through scoped Auto-review escalation. The latest task attempt stopped after an ordinary denial without requesting escalation. That is a distinct agent-recovery behavior; do not silently add new recovery loops, permission preflights, diagnostics dashboards or queue-priority behavior to this implementation ticket. Report it separately if it requires follow-up.

## Starting points and evidence

- src/runtime/codex-agent-runtime.ts: client policy configuration and startThread/resumeThread options, including replacement execution paths.
- test/runtime/codex-agent-runtime-execution.test.ts: current assertions deliberately omit sandboxMode.
- test/integration/real-codex-linked-worktree-git.test.ts: opt-in native capability-test pattern.
- [Incident, saved-profile repair and successful scoped escalation](../../agent-conversation-priority/map.md).
- [Conversation-priority research](../../agent-conversation-priority/issues/01-research-direct-conversation-priority.md) is independent and does not block this fix.

## Comments

- 2026-11-14: User requested this implementation issue and preferred one preventive layer. Issue creation only; implementation has not started.

- 2026-11-14: Implementation started in a temporary isolated checkout because the active host launches source workers from the main checkout. User explicitly requires transfer back to the main checkout and removal of the temporary checkout before completion. Focused runtime regressions failed before the one-line fix and now pass (27/27); native integration and documentation remain in progress.


## Answer

Implemented the single preventive layer: the shared SDK thread options in src/runtime/codex-agent-runtime.ts now explicitly select sandboxMode workspace-write. Fresh starts, resumed attempts, retries, replacement threads and optional-policy fallback use that common selection. Existing on-request/Auto-review policy and protected Git metadata behavior remain intact.

Validation:

- Focused regressions went red before the runtime change and passed afterwards.
- All runtime tests: 101 passed, one existing Windows ACL skip; zero failures.
- Opt-in native regression: passed. A real saved read-only conversation resumed through the patched framework on the same native thread; recorded turn policy became workspace-write and an ordinary workspace write succeeded.
- Main-checkout typecheck passed; transferred runtime/transcript tests passed (46/46).
- The initial broader non-browser suite was not entirely green. An existing self-authored activation history test failed identically with and without this runtime change. A temporary-checkout CRLF schema-artifact mismatch passed after line-ending normalization; an additional resumed-thread expected-options assertion was updated and then passed in the complete runtime suite. No unrelated application behavior was changed to satisfy these checks.

Delivery and cleanup completed: all implementation, tests, domain and architecture documentation are now in the MAIN checkout as unstaged changes. The transfer preserved the entire staged diff byte-for-byte. The temporary checkout and Git worktree registration have both been removed. Git first hit Windows filename-length limits while removing its node_modules; the already-verified remainder was removed through PowerShell long-path support. No separate implementation checkout remains.

The edited runtime class is loaded once by the CLI host; worker processes receive the prepared options through IPC and do not reload that class from disk. Transferring this specific change does not change active runs. The existing host needs a normal restart to load the new default; no forced restart or agent interruption was performed.

See docs/adr/0048-select-workspace-write-for-framework-agent-runs.md and test/integration/real-codex-workspace-permissions.test.ts. Conversation-priority research and premature stopping after ordinary protected-Git denial remain separate concerns.
