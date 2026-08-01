# Define Automation Observability and Recovery

Type: wayfinder:prototype
Status: resolved
Blocked by: 05, 06, 07
Parent: ../map.md

## Question

What task activity history, activation and attempt statuses, failure
diagnostics, and Retry and Dismiss controls should the user see at
board and task levels so they can understand and recover automation without
conflating framework events with authored comments? How should the task page
present Interrupting, User interrupted, Task automation suspension, optional
continuation messages, and Continue? Where should each attempt's Codex thread
reference appear, and how should a capability-dependent Open in Codex action
behave when supported navigation is or is not available? How should the user
pause and resume automation for the entire process, and how should the interface
show the transition to a state in which no agent is still changing any board?

## Comments

- The user needs to inspect each agent run's conversation and tool activity to
  assess whether agents work efficiently and whether the process definition
  needs refinement. Viewing or taking over the live thread in the Codex app is
  not required. Reuse Codex as the transcript viewer when supported and
  worthwhile, but provide another inspectable transcript interface when it is
  not; weigh the quality difference against implementation effort.
- Do not attempt to reproduce the Codex app's rich transcript in full. Find the
  smallest useful presentation above raw text: make messages readable and show
  enough tool activity and live progress to diagnose agent behavior, while
  avoiding bespoke interactive controls and minor visual refinements whose
  implementation cost does not improve process evaluation.
- The user wants a process-wide automation suspension covering all boards so
  they can work with stable board state while knowing no agent is changing it.
  The eventual design must distinguish the request to pause from the confirmed
  state in which every active run has actually stopped.

## Answer

### Board-level automation overview

Keep the board-first interaction settled by **Define Board and Task
Interactions**. Do not add a run-history dashboard, an agent-run-focused task
page, or a permanently visible operations section.

Add one process-wide live-automation control to the existing board header. It
shows the number of currently active runs and opens an on-demand menu covering
all boards in the process. Each row shows the agent, task ID and title, board
and column, current run status, and elapsed time. Selecting the row opens the
task details; a separate **Locate task** action returns to and highlights its
board card, matching the established Needs attention interaction.

The menu contains only current runs. It has no run history, diagnostics,
transcripts, Retry, Dismiss, or Interrupt controls. When no runs are active it
does not consume permanent board space. Existing board-card decisions remain
unchanged: cards show exceptional coordination state, including the active
agent, blocking, unresolved attention, and queued or failed activations,
without showing idle state.

### Task activity and run status

The full task page remains the home for everything specific to one task. Its
single chronological timeline contains both authored comments and immutable
framework activity while continuing to identify them as different record
types. It includes task movements, relationship changes, activations, run
attempts, outcomes, interruption and continuation, and other task events; it is
not limited to automation activity.

Show each run attempt as its own chronological entry in the first version.
Grouping attempts by activation is optional later if real retry volume makes
the timeline noisy. Likewise, do not add a run-only history filter yet; a
simple filter may be added later if real activity volume justifies it.

Expose the state needed to explain the activation order and recovery:

- an activation may be queued, running, waiting for a scheduled automatic
  retry, awaiting user recovery, suspended after user interruption, completed,
  or dismissed;
- an attempt may be running, briefly interrupting, completed, technically
  failed, permission-blocked, or user-interrupted; and
- the existing stale-activation and process-version states remain as settled
  by **Define Process Definition Evolution and Reloading**.

These are contextual task and activity states rather than a requirement to
place every state on board cards. Attempt entries show timing and concise
outcome information. Scheduled automatic retries show that another attempt is
planned and when, but do not create a user action while automatic recovery
remains available.

### Failure diagnostics and recovery

Keep historical evidence separate from the current actionable condition. A
failed attempt entry retains its timing, concise diagnostic, thread reference,
and transcript access. After automatic retries are exhausted, the task's
unresolved Needs attention reason presents the current failure summary and the
**Retry** and **Dismiss** actions. Do not duplicate those actions on historical
attempt entries.

Retry begins the already-settled fresh automatic-attempt cycle for the same
activation. Dismiss records the unfulfilled expectation and allows the task's
preserved activation order to advance. Permission blocks use the same
attention-and-recovery presentation while explaining that automatic retry is
not eligible.

### Task-specific interruption and continuation

Put **Interrupt** only in the current automation area of the task details. The
process-wide live-runs menu provides navigation, not interruption. Selecting
Interrupt disables the action and shows a lightweight, normally brief
**Interrupting...** state until Codex confirms that execution stopped. It does
not need the prominent transition treatment used by process-wide pausing.

Once confirmed, show **Task automation suspended**, an optional continuation
message, and **Continue** in the task's current automation area. Continue acts
on the preserved activation and creates another attempt rather than another
activation. The timeline records **User interrupted** and, later,
**Continued** as immutable activity, without placing controls on those
historical entries. Do not add a separate interruption-requested history event.

### Transcript and Codex thread access

An attempt's transcript opens as a large read-only overlay on the task details
page. Do not expand a potentially long transcript into the main timeline or
navigate to a separate run-focused task page.

The overlay should be the smallest useful presentation the available Codex
transcript format makes inexpensive to render. Prefer adapting directly to the
messages, progress, and tool activity supplied by the Codex integration over
designing a normalized replica of the Codex app. Make conversation readable,
show useful tool activity and diagnostics when readily available, and truncate
command output. Do not add approval, takeover, or other interactive Codex
controls.

Show the attempt's copyable Codex thread ID in its expanded details and the
overlay header, not in the timeline summary. Show **Open in Codex** only when
the installed Codex version exposes documented, supported thread navigation.
When it does not, omit the action and retain the copyable ID and framework
transcript. If Codex no longer has the transcript, report that fact without
losing the attempt's durable board history or thread ID.

### Process automation pause

Every application startup begins with a **Process automation pause**. No new
agent attempt starts until the user explicitly selects **Resume automation**.
The control is visible on every board and affects the entire process.

Selecting **Pause automation** prevents all new attempts, including scheduled
automatic retries, from starting but lets attempts already running finish
normally. While any remain, show **Pausing** and the remaining active runs in
the same live-automation menu. Those attempts may still change board state.
Only after the last one finishes may the interface confirm **Automation
paused — no agents changing boards**. Queued and retryable work preserves its
order and may dispatch after Resume.

Process pausing does not interrupt tasks, create task automation suspensions,
or require per-task Continue actions or continuation messages. A bulk
interrupt option is deferred until usage demonstrates a need; task-specific
Interrupt remains available from task details.

### Prototype finding

The discarded automation-observability prototype made the scope correction
concrete: its timeline-first variant was the easiest to understand, but only
as the already-planned full task timeline. The
run-centric variants were rejected. The resulting design keeps the board
primary and adds only the compact live-run menu, contextual task recovery, and
transcript overlay described above.
