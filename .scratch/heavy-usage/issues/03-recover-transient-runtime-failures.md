# 03 — Retry transient runtime failures indefinitely without retry-history growth

**Type:** task
**Status:** resolved
**Blocked by:** None — can start immediately.
**Specification:** [Heavy usage](../spec.md), especially classified recovery and verification.

## What to build

Keep unattended work recoverable through temporary Codex connection/service
failures and exhausted message budgets. Recognized failures wait and retry the
same activation without a fixed attempt ceiling, using a known reset deadline
or at least one minute between failures. Show compact, durable waiting state
without accumulating repeated empty attempts and timeline/conversation entries.

## Acceptance criteria

- [x] Runtime failure evidence supports deterministic classification from structured
      codes/deadlines when present and tested diagnostic-text recognition otherwise.
      Cover connection loss/exhausted reconnects, temporary service errors, and Codex
      message-budget exhaustion. Ambiguous/unknown errors retain bounded recovery;
      permission, authentication and billing failures are not treated as budget waits.
- [x] Each recognized transient failure bypasses the three-attempt exhaustion path.
      Repeated transient failures do not consume the ordinary failure budget or
      create actionable failure attention. Ordinary failures still exhaust a finite
      three-attempt cycle; partial-work failure evidence remains preserved.
- [x] The application persists retry episode identity, classification, deadline,
      retry count and bounded diagnostic samples. Known future reset/retry times
      take precedence; absent usable metadata, failed retries are at least 60
      seconds apart. A changed reset deadline is respected after another rejection.
- [x] Retry dispatch retains activation reason/order/conversation lineage and
      rechecks normal eligibility. Waiting releases concurrency for unrelated
      tasks, creates no extra activation or stall-recovery slot, and resumes through
      normal thread continuity rules when the runtime becomes available.
- [x] A continuous no-progress outage produces bounded durable retry-noise rows:
      repeated equivalent probes update counters/last diagnostic rather than append
      ordinary attempts, start/completion activity pairs and empty transcripts.
      Hiding rows only in the UI is insufficient. Design episode/probe accounting
      before creating immutable attempt evidence; preserve existing history.
- [x] Actual output, coordination/tool effects, continuity changes and usage/cost
      evidence remain attributable to meaningful runs. Compaction cannot discard
      partial work or double-count/lose cumulative usage checkpoints.
- [x] Browser task/conversation views show waiting reason, first/latest failure,
      retry count and next eligible time through a compact summary, with a clear
      stop/dismiss action integrated into recovery controls. Waiting is distinct
      from needs-attention; repeated probes send no duplicate notifications.
- [x] Pause prevents dispatch; restart begins paused and retains deadlines/counts;
      resume/dismissal/process changes cannot duplicate probes or resurrect canceled
      work. Later ordinary failure follows existing attention/notification policy.
- [x] Controllable-clock tests simulate 1,000 identical failures and assert bounded
      persisted noise/projection size, accurate counts, no premature attention,
      other-task progress, and eventual success without user intervention. Cover
      reset deadlines, classification changes, ordinary exhaustion, permission
      denial, partial work, interruption, pause/resume, restart and dismissal.
- [x] Existing three-recovery stall semantics and ordinary retry/manual-retry
      semantics remain covered. Runtime adapter, HTTP and dark/light browser
      waiting/recovery coverage pass alongside relevant automation regressions.
- [x] Any durable state change uses a released migration/current-schema evidence;
      typechecks/build pass. Update architecture, glossary and recovery-policy ADR
      to describe the implemented exception. Leave changes unstaged.

## Comments

This addresses technical activation retry, not successful runs that leave a task
without continuation. Do not weaken the separate bounded stall-recovery policy.
Storage boundedness applies to redundant no-progress retry noise; meaningful new
work continues to produce retained evidence.


## Answer

Implemented in the shared local checkout on 2026-10-13. Recognized connection,
service and Codex budget failures retain one durable waiting episode and retry
the original activation indefinitely, using an explicit future provider deadline
or a minimum 60-second wait. Ordinary failures still exhaust three technical
attempts; transient failures do not spend that budget or request attention.

Known-episode retries retain provisional dispatch claims until meaningful output,
accepted coordination effects, continuity changes, usage/context evidence or a
non-transient outcome publishes the attempt. Empty rejections update bounded
samples/counters and discard only unpublished probes. Existing retained history
is preserved. Cumulative usage comparisons retain positive/uncertain evidence
and avoid double counting unchanged checkpoints; native caches release only after
durable settlement. Restart starts paused, retains counts/deadlines and recovers
abandoned provisional probes without ordinary host-stop noise.

Task and conversation views show compact waiting reason, first/latest failure,
counts and next eligible time. Stop handles dispatch/settlement races using
existing dismissal, activation-scoped interruption and authoritative refresh.
Migration 0012, its current-schema snapshot, architecture, glossary and ADR 0028
record the storage and policy exception; the separate stall budget is unchanged.

### Verification

- Typechecks and build passed. Build retains the existing non-failing bundle-size advisory.
- [Full Node suite](../ticket-03-tests.log): 412 tests, 406 passed, 0 failed,
  6 platform skips. Includes 1,000 identical failures with empty placeholders,
  bounded persisted attempts/history/projection, accurate 999 retries/1,000
  failures, preserved lineage and eventual unattended success.
- [Browser regression suite](../ticket-03-browser-regressions.log): 33 passed,
  including waiting controls/contrast in dark and light, both stop-race directions,
  interruption, conversation paging/lifecycle, attention and timeline navigation.
- Migration coverage preserves existing authored history/transcripts, all
  released view/trigger bodies and the journal's autoincrement sequence.
- Reset/classification changes, pause/resume, restart, explicit interruption,
  dismissal, permission/authentication/billing exclusions, partial output/direct
  effects, other-task progress, cumulative usage, ordinary exhaustion/manual
  retry and unchanged stall-recovery behavior pass.
- Git diff whitespace check passed. Staged patch remains byte-for-byte unchanged:
  SHA256 `1CEA3B9E9FE690EF72F34FB40869F62C4ADF463281EFD957C0AD6F82946B1C12`.

### Independent review

Standards: **0 remaining actionable findings**. The stop polling-race finding
was corrected and re-reviewed. Spec: **0 remaining substantial findings**.
Ticket-specific [review diff](../ticket-03-review.patch) and
[changed-file inventory](../ticket-03-changed-files.txt) retain review scope.

The first full run exposed an old streamed-connection assertion expecting the
ordinary scheduled state and a Windows CLI startup-lock timing failure. The
assertion now expects classified waiting; targeted and final full reruns pass.
The broader browser run identified an interruption fixture still supplying the
old complete-timeline shape; it now uses the shared coherent scenario builder,
and the final regression suite passes.

Tickets 02 and 03 were completed sequentially in the original shared checkout.
No branch/worktree merge is necessary; all implementation changes remain unstaged
and the user's accepted staged ticket 01/issue 97 work is preserved. Parent-chat
reporting ended at the user's request. Temporary full-file review snapshots were
removed after both independent reviews finished.
