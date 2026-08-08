# 25 — Interrupt Tasks and Pause the Process

**What to build:** A user can stop and later continue one problematic task, or
drain automation across the whole process, while seeing which agents are still
active and whether the board is safe from further automated change.

**Blocked by:** 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart

**Status:** ready-for-agent

- [ ] Interrupt is available only with the affected task's current automation
  and becomes disabled while the attempt is Interrupting.
- [ ] The attempt ends as user-interrupted only after Codex confirms execution
  stopped; it consumes no technical retry and starts no automatic attempt.
- [ ] User interruption preserves the activation at the queue head and creates
  durable task automation suspension.
- [ ] Continue creates a new attempt for that activation and workspace, includes
  the interruption and optional user message in attempt context, and resumes or
  replaces the Codex thread appropriately.
- [ ] Continuing without a message explicitly tells the agent to reassess the
  current task and workspace before proceeding.
- [ ] A compact board-header control lists current runs across every process
  board with agent, task, board, column, status, and elapsed time and navigates
  back to the task or card.
- [ ] The board card, task-details current-attempt entry, and transcript-overlay
  header show the actual target agent and a current-attempt elapsed timer while
  an attempt is running. The display cannot infer the agent from the current
  column because comment mentions and other triggers may target another agent.
- [ ] The current-attempt timer updates in minutes and seconds from dispatch
  until that attempt ends. It excludes queued time and previous retry attempts;
  completed attempt history retains a fixed duration instead of a running
  cumulative total.
- [ ] Pause prevents every new attempt, including scheduled retries, but allows
  running attempts to finish and continue changing board state while Pausing.
- [ ] The interface confirms automation is paused only after the final active
  run completes and accurately states that no agents are changing boards.
- [ ] Process pause preserves queued work and does not interrupt tasks or create
  task-level suspensions; Resume restarts eligible dispatch in preserved order.
- [ ] Browser and deterministic lifecycle tests cover interrupt confirmation,
  continuation, pause draining, queued retries, navigation, resume, and timer
  consistency across the board card, task details, and transcript overlay,
  including a mention-triggered agent that differs from the column watcher.
