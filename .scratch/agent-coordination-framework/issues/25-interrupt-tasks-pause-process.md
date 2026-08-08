# 25 — Interrupt Tasks and Pause the Process

**What to build:** A user can stop and later continue one problematic task, or
drain automation across the whole process, while seeing which agents are still
active and whether the board is safe from further automated change.

**Blocked by:** 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart

**Status:** resolved

- [x] Interrupt is available only with the affected task's current automation
  and becomes disabled while the attempt is Interrupting.
- [x] The attempt ends as user-interrupted only after Codex confirms execution
  stopped; it consumes no technical retry and starts no automatic attempt.
- [x] User interruption preserves the activation at the queue head and creates
  durable task automation suspension.
- [x] Continue creates a new attempt for that activation and workspace, includes
  the interruption and optional user message in attempt context, and resumes or
  replaces the Codex thread appropriately.
- [x] Continuing without a message explicitly tells the agent to reassess the
  current task and workspace before proceeding.
- [x] A compact board-header control lists current runs across every process
  board with agent, task, board, column, status, and elapsed time and navigates
  back to the task or card.
- [x] The board card, task-details current-attempt entry, and transcript-overlay
  header show the actual target agent and a current-attempt elapsed timer while
  an attempt is running. The display cannot infer the agent from the current
  column because comment mentions and other triggers may target another agent.
- [x] The current-attempt timer updates in minutes and seconds from dispatch
  until that attempt ends. It excludes queued time and previous retry attempts;
  completed attempt history retains a fixed duration instead of a running
  cumulative total.
- [x] Pause prevents every new attempt, including scheduled retries, but allows
  running attempts to finish and continue changing board state while Pausing.
- [x] The interface confirms automation is paused only after the final active
  run completes and accurately states that no agents are changing boards.
- [x] Process pause preserves queued work and does not interrupt tasks or create
  task-level suspensions; Resume restarts eligible dispatch in preserved order.
- [x] Browser and deterministic lifecycle tests cover interrupt confirmation,
  continuation, pause draining, queued retries, navigation, resume, and timer
  consistency across the board card, task details, and transcript overlay,
  including a mention-triggered agent that differs from the column watcher.

## Comments

- Post-implementation live testing found that the board overview does not
  project task automation suspension, so an interrupted task appears merely
  queued even though Continue is required. Follow-up issue 43 owns the missing
  board-level action signal without changing the queue semantics established
  here.

## Answer

Implemented durable task interruption and continuation with runtime cancellation,
atomic user-interrupted outcomes, task automation suspension, idempotent command
replay, preserved activation/workspace/thread context, and explicit reassessment
guidance when no continuation message is supplied. Process Pause now drains active
runs, prevents provisioning or scheduled retries from becoming new attempts, and
resumes preserved work in order.

The board header now exposes process-wide live runs and drain state; cards, task
details, attempt history, and transcript headers show the actual target agent and
consistent live or fixed durations. The task page provides confirmed Interrupt and
contextual Continue controls with durable suspension/resumption history.

Verification passed both TypeScript typechecks, the production build, 89 local
tests with one intentional credentialed integration skip, all 14 browser scenarios,
visual browser inspection, `git diff --check`, and independent Standards and Spec
reviews with no remaining findings.
