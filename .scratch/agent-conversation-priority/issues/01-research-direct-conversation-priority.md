# Research direct conversation access while task work is queued or blocked

Type: research
Status: open
Blocked by: none

## Question

How can the user promptly converse with a chosen task participant through its conversation panel while ordinary activations are backlogged, permission-blocked, failed, interrupted, or waiting, without implicitly resuming blocked work?

## User intent

The user needs to ask an agent what went wrong and discuss it before queued workflow messages run. A permission block should preserve unfinished implementation while allowing useful conversation. Establish when direct messages may run first, when they cannot, and what the interface must explain. Do not implement a universal priority exception without resolving these semantics.

## Ideas to discuss during refinement

These are user-proposed directions, not an agreed implementation specification. Broaden the research beyond the permission-block incident to the conversation panel's general interactivity and responsiveness.

- Offer explicit options to expedite a direct question when ordinary work is queued or active; compare their latency, consequences and discoverability.
- Make interruption available from the conversation panel. Interrupting ordinary work should preserve that work while allowing direct user discussion to proceed, rather than suspending the discussion behind the interrupted activation.
- Explore a discussion/pause mode that can also be entered without interrupting an active run. It should support several user-agent exchanges without ordinary activations for other agents interleaving with the discussion. Preserve arriving requests for later handling.
- Determine the hold's scope (conversation, participant, task or broader), entry behavior when work is already running, explicit exit/resume behavior, persistence across navigation/restart, and handling of messages arriving during the hold. Preserve unrelated work wherever the selected scope allows it.
- Distinguish stopping a running attempt, holding future workflow dispatch, and prioritizing direct messages. Decide which controls can be combined and what remains held between discussion turns. Avoid accidental resumption after each answer.

## Evidence

See [T-0052 incident findings](../map.md). The 14 November “can we talk?” message waited about eight minutes behind historical activations. Failure holds all later work on the same task. Follow-ups currently use the same FIFO activation path and possess ordinary agent capabilities.

## Investigation

1. Trace conversation submission, activation identity/order, task-level exclusion, failed-run resolution, suspension, runtime waiting and pause. Distinguish a queued backlog from a failed activation, an active approval review and a still-running command.
2. Compare at least: priority for queued direct follow-ups; a separate discussion execution mode that preserves the blocked activation; explicit interrupt-and-discuss of active work; continuing the failed activation with a user message. State what each solves and what remains blocked.
3. Determine whether user intent must be explicit (discuss versus continue work), and how to prevent an ordinary fully capable follow-up from quietly resuming the denied operation or causing the same permission-report loop.
4. Preserve at most one active task run and one active turn per native conversation. Define safe handling of running tools, in-progress merges and approval reviews; do not run a second same-task agent concurrently merely to answer a question.
5. Preserve failure/attention, suspended work, activation/source provenance, retries, restart recovery, cancellation, attachments and stale-process checks. Define what discussion completion does to the original activation and the remaining queue. Do not silently dismiss or mark failed implementation completed.
6. Examine composition checkpoints: an out-of-order discussion could advance delivered context past older queued causes or create confusing thread chronology. Define source delivery, exactly which state the agent sees and how ordinary work resumes with correct context.
7. Define ordering among multiple direct messages, different participants, retired conversations, ordinary activations and resource grants. Address starvation, repeated questions and fairness without conflating task-local priority with global priority.
8. Establish policy for user task suspension and process pause: may a direct question run while paused, require an explicit user action, or remain queued? Discuss runtime permission limits separately from framework scheduling.
9. Evaluate a multi-turn discussion hold: preserve direct-message access while preventing ordinary task activations from interleaving, compare hold scopes and lifecycle choices, and account for newly arriving requests, restart and explicit release. Treat this as an option to refine, not a selected design.
10. Propose truthful browser status and controls: explain why a message is waiting, who/what precedes it, what “discuss now” will do, and which hold remains after the reply. Prioritization must not imply granting technical permissions.

## Deliverable

Write an evidence-backed recommendation with a scenario matrix, alternatives/tradeoffs, explicit invariants, remaining user decisions and a proposed observable contract. Include test scenarios for backlog, permission failure, active approval/tool execution, interruption, global pause, multiple direct messages, multi-turn holds, conversation-panel interruption, hold release, arriving workflow requests, context checkpoints and restart. Publish dependency-aware implementation tickets only after the behavior is agreed; keep this research open until the question is answered.

## Comments

- 2026-11-14: Created from the user's outside inspection request. No live scheduling or runtime policy changed.

- 2026-11-14 refinement input: The user recalls temporarily switching Codex accounts when their main weekly budget was exhausted. During that interval the client setting changed from “approve for me” to “ask for approval” (labels recalled approximately), then was quickly restored. They suggest a task/conversation created in that interval might retain the temporary setting. This is a temporal-isolation hypothesis, not a verified cause, and approval routing must not be conflated with the independently observed read-only filesystem profile.
- The user expects the coordination framework's configured automatic approval mechanism to remain isolated from unrelated desktop-client approval changes, and recalls that it used to be isolated. Investigate the actual configuration ownership/inheritance contract and retained per-conversation settings; do not assume account tier determines filesystem permissions. Track this related permission-isolation question separately from selecting conversation-priority behavior.
- The conversation-panel controls and discussion hold above are ideas the user wants to discuss when refining this issue. No implementation choice or runtime change is authorized by this ticket update alone.
