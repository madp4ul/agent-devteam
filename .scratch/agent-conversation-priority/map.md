# Direct conversation priority

Origin: user report on 14 November 2026 about Autonomous Delivery V2 task T-0052.

## Tickets

- [01 — Research direct conversation access while task work is queued or blocked](issues/01-research-direct-conversation-priority.md): research, open, unblocked.

## Incident findings

T-0052 is “Deliver orbit-to-crash opening and coherent repeated-run dialogue” in the independent idle-games-autonomous-v2 project, served at http://127.0.0.1:3001. Implementation remains incomplete in Implementation.

### Confirmed execution evidence

The implementation conversation is `4ead845c-152c-420e-b6aa-c0aa16721c39`; its native thread is `01a1d0b4-2a4d-7141-9e15-98d6fe3b6fe1`.

Native rollout: `C:/Users/Paul/.codex/sessions/2026/11/12/rollout-2026-11-12T18-00-30-01a1d0b4-2a4d-7141-9e15-98d6fe3b6fe1.jsonl`.

The initial implementation turn on 12 November and all retained 14 November continuation/activation turn contexts use:

- `sandbox_policy.type = read-only`
- `active_permission_profile.id = :read-only`
- `approval_policy = on-request`
- `approvals_reviewer = auto_review`
- Filesystem profile grants read access only; no writable entry.

The required operation was merging reviewed T-0046 dependency `0b8a483869f256a5204378ecbbf40fc343208f23` into the task branch. Non-escalated commands failed with exit 128:

```text
fatal: update_ref failed for ref 'ORIG_HEAD': cannot lock ref 'ORIG_HEAD': Unable to create 'D:/Daten/Projekte/Software/Codex/idle-games-autonomous-v2/.git/worktrees/T-0052/ORIG_HEAD.lock': Permission denied
```

Exact retained outputs occur at 2026-11-12T17:05:59.282Z, 2026-11-14T01:55:48.408Z and 2026-11-14T02:02:51.906Z. ORIG_HEAD is Git's saved pre-operation revision; its lock is ordinary Git bookkeeping, not a log file. Linked-worktree metadata lives outside the checkout in the primary clone.

Explicit user consent was understood. Attempt reviewer evidence already includes standing authorization for ordinary task Git merges and required shared Git metadata writes. Retrying with more consent did not change the baseline filesystem profile.

Important limit: escalated merges returned running sessions without output and were cancelled. This inspection found no explicit Auto-review denial establishing rejection of those escalations. Baseline denial, escalation delay/cancellation and the agent's permission-block report are distinct facts. Even an escalated command with fsmonitor disabled did not finish before cancellation. Successful escalated execution remains unverified; the incident does not establish that every write is technically impossible.

`src/runtime/codex-agent-runtime.ts` sets on-request and Auto-review, but deliberately omits sandboxMode when starting/resuming SDK threads. Tests assert that omission. Local user configuration contains no explicit sandbox_mode/default_permissions; its project trust entries do not include the idle-games-autonomous-v2 clone. Inherited/default permission selection is therefore the leading explanation for read-only startup, but the exact selection mechanism has not been isolated. Do not claim an ACL fault or a managed organizational prohibition from the Git error alone.

Official documentation distinguishes sandbox capabilities from approval policy, explains that read-only may persist until directory trust is established, and documents protection of linked `.git` metadata even in workspace-write: [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security). Therefore workspace-write alone is not proof that the Git merge can succeed; scoped escalation must also be verified.

### Confirmed scheduling evidence

`ActivationSchedulingModule.claimNextRunnable` excludes any queued activation if an earlier activation on the same task is not completed, and excludes task automation suspension. There is no exception for user-follow-up. `ActivationCreationModule.createFollowUp` appends an ordinary queued user-follow-up activation. The block applies to every participant on that task, not to unrelated tasks project-wide.

The user message `a32aedc1-ad79-40cd-8e83-7687360e6941`, “can we talk?”, was authored at 2026-11-14T02:04:17.127Z (03:04:17 Berlin). It became activation `264c5bce-0202-4a70-99b3-0fb47def0d1f`, whose attempt `5e12bc98-37be-4032-a1b0-7bf238752789` began at 02:12:02.871Z and completed at 02:12:24.668Z (03:12:24 Berlin). The answer arrived about 8m08s after the question. The agent said the queue had finished and agreed not to retry writes while discussing the issue.

At 02:08:15Z a native activation payload still reported 16 queued requests, zero failed. Later retained turns disposed of already-covered historical coordination activations. At inspection the task had no active run; its latest follow-up was completed, while the implementation conversation summary still displayed needs-attention. Do not equate old attention with an actively blocked permission-review prompt, nor infer complete queue counts from the bounded task timeline API.

### Scope and follow-up

This was outside inspection of existing evidence. No live merge, permission/trust change, retry, dismissal, message to an agent or host restart was performed. The live database was opened read-only once but was locked; findings use the HTTP read API, native rollout and source. Replaying the merge in the live task was deliberately avoided because the request was diagnosis, not execution or repair. No runtime fix or regression-test claim is made.

Before resuming implementation, inspect effective native configuration at the exact task cwd, establish the intended user-controlled writable workspace profile, and validate a bounded scoped Git escalation on a disposable linked-worktree fixture. Retain reviewer outcomes separately from process execution/hangs. Do not delete ORIG_HEAD locks, change global Git trust or assume another conversational approval changes permissions.

## Decisions so far

- No scheduling design selected. Ticket 01 must compare options and lead to an agreed specification before implementation.
- Permission configuration and direct-conversation scheduling are separate concerns; prioritizing questions will not grant Git write capability.

## Existing-task permission repair, 14 November 2026

The user authorized repairing the existing T-0052 permission problem. Native effective config inspection found no enforced requirements, no explicit sandbox_mode/default_permissions, and initially no trust entry for the clone. No account credentials were inspected or changed.

No-model native app-server probes reproduced a more precise distinction: a fresh conversation eventually selected workspaceWrite, while resuming the existing T-0052 native thread without overrides still selected readOnly. A clone trust entry appeared in user configuration during the probe interval; its writer was not established, so do not attribute it to an account switch or claim it alone repaired the old conversation.

Applied the supported native `thread/resume` API with `sandbox: workspace-write` to the existing thread `01a1d0b4-2a4d-7141-9e15-98d6fe3b6fe1`. A separate app-server process then resumed that same thread WITHOUT a sandbox override and returned workspaceWrite. A further independent verification returned workspaceWrite again. Approval policy remains on-request. This fixes the saved read-only selection without retiring the framework conversation, deleting history, replacing the task, changing framework code, or running an agent turn.

The verification helper is [probe-native-permissions.mjs](probe-native-permissions.mjs). Default invocation only verifies the retained native profile; `--repair` explicitly reapplies the task-specific workspace-write override. It does not run a model or implementation commands.

The framework was paused and T-0052 idle throughout the repair, and remains paused. No merge, staging, commit, push, permission-block dismissal, task-message submission or agent activation was performed. Protected Git metadata still requires scoped escalation; an actual successful merge/escalation has not been demonstrated by this no-model profile check. The account-switch explanation remains unproven, but saved per-conversation permission state explains how one existing task can keep read-only while new conversations obtain workspace-write.

## Additional user context and refinement directions

On 14 November the user recalled that the temporary account switch coincided with a desktop approval-setting change from roughly “approve for me” to “ask for approval”, quickly changed back. A conversation created in that interval retaining a setting is a plausible temporal hypothesis, not an established account-switch cause. Approval routing and filesystem capabilities remain distinct. The user expects the framework's own configured automatic approval mechanism to stay isolated from unrelated client-setting changes; the precise ownership/inheritance and persistence contract needs investigation.

Ticket 01 now also covers general conversation-panel responsiveness, ways to expedite questions, interruption from the panel without blocking direct discussion, and an optional multi-turn discussion hold that prevents other workflow activations from interleaving. Scope and lifecycle are left for refinement; these are recorded ideas, not an approved scheduling implementation.

## Retest diagnosis and verified escalation, 14 November 2026

User resumed the framework and asked T-0052 to retest, then began pausing it after another denial. Inspected attempt `f3ec5504-89c0-479b-952d-df1beaa8c065`, started 2026-11-14T02:33:45.531Z. Native turn context explicitly reports workspace-write, on-request, auto_review: the previous profile repair held.

The agent issued a non-escalated status plus merge command and received exit 128, Permission denied creating the same ORIG_HEAD.lock. No `require_escalated` retry was made in this latest attempt. Its comment correctly identifies the protected metadata path but does not establish that filesystem permissions need widening. Merely placing the path inside a writable root would not remove normal Git metadata protection.

The directory owner is Paul. A normal host-account create/delete of a unique diagnostic file in the exact `.git/worktrees/T-0052` directory succeeded. Existing ACLs include sandbox-related deny entries; no ACLs were modified, and no existing lock files were removed.

A separate fresh SDK diagnostic used the bundled native 0.160.0 runtime, workspace-write, on-request, Auto-review, and the framework's verified reviewer-guidance preparation. It ran only the fixed helper [probe-metadata-write.mjs](probe-metadata-write.mjs), which exclusively creates and removes one disposable metadata marker, without touching refs, index, ORIG_HEAD, source or task state.

Native diagnostic thread `01a1d7f4-e2e6-7a13-a8c5-4995f664a276` shows:

- 02:48:39.295Z: ordinary sandbox execution exited 1 with EPERM opening the marker in `.git/worktrees/T-0052`.
- 02:48:43.137Z: the same helper command explicitly requested `sandbox_permissions: require_escalated`.
- 02:48:47.505Z: escalated retry exited 0 and printed GIT_METADATA_WRITE_PASS. The marker was confirmed absent afterwards.

Reproduction command: `node --experimental-strip-types .scratch/agent-conversation-priority/probe-git-escalation.mjs`. It uses a separate diagnostic conversation and can consume model calls; it is not a pure test-suite command. Native evidence is in `C:/Users/Paul/.codex/sessions/2026/11/14/rollout-2026-11-14T03-48-33-01a1d7f4-e2e6-7a13-a8c5-4995f664a276.jsonl`; retained SDK events are in `git-escalation-probe-events.json` beside the helper.

An initial diagnostic failed before executing its command because this desktop session's inherited CODEX_WINDOWS_REGISTERED_CORE flag required an installed app launch. The successful standalone diagnostic omitted that desktop-only flag and explicitly selected cmd.exe, matching the framework's standalone launcher context. That first diagnostic does not explain the real task's Git denial and is not counted as an escalation test.

Conclusion: the immediate remaining problem in the latest task attempt is stopping after normal protected-Git denial rather than exercising scoped escalation. Broadening filesystem ACLs or global access is not justified by this evidence. The supported next action is a single, separately issued, scoped escalated retry of the required dependency merge using the existing task branch, then inspection of its actual result. This marker test proves directory write access through escalation, not approval or successful execution of the full merge. Historical cancelled escalation attempts may have involved other delays; their cause remains unresolved.

At the end of inspection T-0052 was idle and framework automation was pausing. No task agent message, activation, merge, staging, commit, push, ACL/trust change, or automation resume was performed by this follow-up. The shutdown/drain was left alone.

## Preventive implementation follow-up

The user requested one preventive layer rather than a stack of defenses. [Explicit runtime permissions ticket 01](../agent-runtime-permissions/issues/01-select-explicit-workspace-permissions.md) records the concrete implementation: explicitly select workspace-write on every agent start/resume, including old read-only conversations and replacement paths. It is independent of conversation-priority research. Normal protected-Git escalation remains distinct and is not claimed to be fixed by selecting workspace-write.
