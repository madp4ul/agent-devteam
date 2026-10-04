# 02 — Deliver bounded stall recovery with actionable attention

**Type:** task
**Status:** resolved
**Blocked by:** 01.

Source: [intake 27](../../framework-improvements-2026-09/issues/27-recover-stalled-work-without-user-attention.md).
Read [spec.md](../spec.md) in full, architecture.md, and ADRs 0018, 0019, 0023.

## Deliver

Implement the complete core/runtime/attention path: eligible watched tasks receive
attributable recovery for their watcher; three unsuccessful normally settled
recoveries produce independently addressable framework attention. Include reviewed
activation wording and continuation guidance, preserving intake 12's wider audit.

Persist budget and 60-second deadlines through a new released migration. Implement
all specified resets, preserving count across pause/interruption, and existing
ordering, mapping, stale approval, and runtime retries. Reconcile after settlement,
relevant commands, resume, and deadline expiry. Recheck dispatch, durably skip
obsolete recovery without consuming a slot, and prevent duplicate enqueue/escalation.
Recovery must not fail its own unfinished-work check; another ordinary activation
does supersede it, even when later in the queue.

Make recovery/escalation inspectable in prompts, timeline, conversation, and
attention projections. Reuse ordinary attention controls and applicable notification
policy; explain missing continuation without inventing an agent diagnosis.

## Acceptance and verification

- [x] Spec scenarios 1–11 pass at public application seams with meaningful coverage.
- [x] Controllable-clock tests prove grace/expiry without a new command, including
  dismissal that clears interruption and pause/resume.
- [x] Technical retries consume no additional slot; failure attention stays authoritative.
- [x] Reset during a recovery survives settlement; restart cannot duplicate work,
  reset budget, or renew grace.
- [x] Prompt retains source event, reviewed context, and final-recovery warning.
- [x] Attention resolution, history, and notifications have adapter coverage and
  readable dark/light browser presentation.
- [x] Released migration/current-schema checks, typecheck/build, and relevant tests
  pass; update implemented architecture/glossary/reference facts.
- [x] Follow normal review workflow and leave changes unstaged.

## Answer

Implemented scheduler-owned reconciliation and dispatch recheck, three-run budget,
released migration 0008 with transactional reset/grace triggers, persisted deadlines,
reviewed prompt/guidance, normal runtime retries, and addressable framework attention.
The browser shows the explanation and links to each recovery's attempt; its controls
reuse ordinary attention actions. Exhaustion notifications use the existing run-failure
setting while retaining their distinct cause. Timer waits are canceled on close/kick/pause.

Seven public recovery tests and six scheduling tests pass, including reset during
recovery, restart, grace expiry, retry/interruption, and preparation-time supersession.
Released migration suite: 27 passed. Dark/light browser escalation/resolution passes.
Typechecks and production build pass. Ticket 03 completes assembled regressions and
code review before final handoff. Changes remain unstaged.

Final integrated validation and independent review completed in
[ticket 03](03-verify-recovery-lifecycle-and-reconcile-docs.md);
[verification evidence](../verification.md).
