# Define the Agent Activation and Run Lifecycle

Type: wayfinder:grilling
Status: resolved
Blocked by: 01, 02
Parent: ../map.md

## Question

How should column entry, mentions, relationship completion, and manual
reactivation create or queue agent runs; what activation reason and event
pointer must each run receive; and what should happen when a run finishes,
fails, or receives another trigger while the task is already active?

## Answer

Each triggering event creates a distinct activation with one expectation for
one target agent. Activations are never coalesced, reprioritized, canceled, or
superseded because later activity changes the task. A task has at most one
active agent run, so its activations wait and run individually in strict
chronological order. The framework does not judge urgency. When several agents
are mentioned by the same comment, textual mention order breaks the timestamp
tie.

An activation fixes these values when it is created:

- the target agent;
- a typed activation reason; and
- an immutable pointer to the exact source event.

Every run also receives the task's current state. This lets the agent understand
both the original expectation and everything that changed while the activation
waited. The framework does not generate a natural-language interpretation that
could distort the source event, and it does not retarget queued work after a
column or process-definition change.

The first version creates activations for four reasons:

1. **Column entry.** Creating a task in a watched column or moving it into one
   activates the agent assigned when the entry occurs. Every entry counts,
   including re-entry and an active agent moving the task into a column watched
   by that same agent. A move does not terminate the current run; the resulting
   activation joins the queue.
2. **Mention.** A comment creates at most one activation for every agent it
   mentions, regardless of whether the task is in a watched, unwatched, or final
   column. Repeating one agent's mention in the same comment does not duplicate
   its activation. Mentioning the user creates a notification rather than an
   agent activation.
3. **Blocking cleared.** Satisfying an individual blocking relationship records
   task activity but creates no activation while another blocker remains. The
   transition from blocked to fully unblocked activates the agent watching the
   current column and points to the event that cleared the final blocker. The
   run can inspect the task's current relationships and preceding activity to
   see how all blockers were resolved. No activation is created if the current
   column is unwatched.
4. **Manual reactivation.** The user may create a fresh activation for the agent
   watching the current column without moving the task. This action is available
   only when the task is in a watched column, has no active or queued activation,
   and is not paused on a failed activation.

Only the mention itself leaves primary responsibility unchanged. The mentioned
agent nevertheless has the task's sole active run while responding and retains
the same board capabilities as any other agent. It may comment, edit shared
state, or move the task when its process instructions call for that action. The
framework does not enforce role-specific restrictions on agent capabilities;
process definitions guide appropriate behavior.

Successful run completion has no implicit workflow effect. The framework does
not interpret the response, move the task, or reactivate an agent. It records
completion and starts the next queued activation, if one exists; otherwise the
task becomes idle exactly where the agent left it. A normally completed run
that forgot a handoff is recovered with manual reactivation, not automatic
failure handling.

Only technical failures reported by the agent runtime are automatically
retried. Every activation receives the same framework-wide policy: three total
attempts with capped exponential backoff. This is operational resilience, not
process behavior, so it is not configurable by process, agent, or column. The
failed activation remains at the head while retrying and all later activations
retain their order.

After all automatic attempts fail, activation processing pauses for that task
and requires the user. **Retry** starts a fresh cycle of up to three attempts for
the same activation, retaining its reason and source pointer while reading
current task state, including comments the user added after failure. **Dismiss**
records that the activation's expectation was abandoned and allows the preserved
queue to continue. Retry and dismissal are distinct from manual reactivation.

Deliberate user interruption is not a technical failure or a retry. It preserves
the current activation and suspends further automation for the task until the
user explicitly continues it. The durable interruption, attempt-context, and
continuation semantics are recorded in
**[Define Durable Board State and Recovery](./07-define-durable-board-state.md)**.

Each activation starts with a fresh Codex thread so unrelated activations and
agent roles do not inherit hidden conversation context. Retry attempts continue
the activation's thread when Codex permits, because partial context may help the
agent recover; if that thread is unusable, the framework starts a fresh thread
for the same activation. Durable continuity between activations comes from the
task, comments, activity, repository artifacts, and task workspace rather than
from an accumulating model conversation.

Framework facts form an immutable task activity history. It records task moves,
relationship changes, activations, run attempts, completion, failure, retry,
dismissal, user interruption, suspension, and continuation. Comments remain
authored communication even if the interface later presents comments and
activity together. The precise history, diagnostics, statuses, and recovery
controls shown to the user are delegated to the follow-up decision **Define
Automation Observability and Recovery**.
