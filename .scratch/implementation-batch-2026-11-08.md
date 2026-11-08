# Requested implementation batch — 2026-11-08

User requested sequential implementation in the shared local checkout, delegated
to fresh agents following implement/TDD/code-review. Leave all changes unstaged;
no commits, pushes, separate worktrees, or live project changes are requested.

## Queue

1. Core 101 — complete. Broader blocker audit implemented; full Node suite
   448 passed / 6 skipped, 40 browser tests passed, typecheck/build passed;
   independent Standards and Spec reviews clear.
2. Core 102 — complete. Full Node 448 passed / 6 skipped; 68 distinct browser
   tests passed, 22 rerun after review refactor; typecheck/build and both reviews
   clear. Shared `task-card-signals.ts` owns rendering/collapse signals.
   User confirmed: initially collapsed, remember choice per
   board in this browser; ordinary Completion work does not qualify merely by
   being unwatched, but activity/attention can still qualify it.
3. Heavy usage 11 — complete. Full Node 452 passed / 6 skipped, typecheck/build
   and both reviews clear. ADR 0038; coordinator queryWorkspacePreparations owns
   task/activation/agent identity, creating/verifying stage and start time;
   two creation and two verification lanes. Preserve lane identity when adding
   fine-grained progress. Preparations no longer count as active agent runs.
4. Heavy usage 12 — complete. Node 457 passed / 6 skipped; typecheck/build and
   both reviews clear. Initial 62 browser checks passed; final selection 60
   passed plus focused correction of one obsolete 101 assertion passed.
   ADR 0039. Preserve executionStarted independently of interruption,
   stable preparation lanes independently of progress.stage, and coordinator
   ownership of capacity eligibility. User staged prior 101/102/11 during work;
   preserve those snapshots and leave subsequent changes unstaged.
5. Heavy usage 13 — complete. Full Node 462 passed / 6 skipped; final
   success-only finalizer refinement 13 focused passed; 46 browser passed;
   typecheck/build and both reviews clear. ADR 0040. Preserve pending-wakeup
   handling on successful pump settlement and fatal rejection boundary.
6. Framework improvements 29 — complete. Full pre-review Node 466 passed /
   6 skipped; final 44 application/workspace/HTTP and 12 browser tests passed;
   typecheck/build and both reviews clear. ADR 0041. No live cleanup performed.
7. Database startup fast path 01 — complete. Final accumulated-tree Node suite
   479 passed / 6 skipped / 0 failed; typecheck/build and both reviews clear.
   ADR 0042 plus ADR 0018 amendment. Disposable 1.076 GB benchmark: zero
   inspection-copy bytes, 708–742 ms versus 1059–1078 ms copy path. No live
   host/database changes. Reviewed sidecar race and bounded contention retry
   covered by real-connection regressions.
8. Cross-task coordination 08 — assessed; conditional implementation does not
   apply to its remaining scope. Preview changes are already delivered and
   accepted. The scrolling glitch has no reliable reproduction despite recorded
   actual-data/Firefox/viewport probes; version/zoom/crop details remain unknown.
   Leave deferred rather than claim a speculative fix. No ticket changes needed.

Autonomous process assessment tickets are explicitly excluded by the user.

## Baseline and verification

Initial git status was clean. Each ticket agent must preserve prior completed
changes, run appropriate checks and independent Standards/Spec reviews, and
record delivery evidence in its ticket. Subsequent reviews should distinguish
the current ticket delta from accumulated prior changes.

All seven requested unconditional implementation tickets are resolved. Each had
independent Standards and Spec review with no remaining findings. User-staged
101/102/11 ticket snapshots remain intact; all agent-authored implementation
changes remain unstaged. No commits, pushes, live restart, live database mutation,
or live archival cleanup was performed. Optional cross-task 08 remains deferred
as explained above; autonomous-process-assessment tickets were not modified.
