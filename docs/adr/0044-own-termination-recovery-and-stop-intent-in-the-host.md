# Own termination recovery and stop intent in the host

Status: accepted

## Context

A failed Windows inspection could leave the runtime pending forever. Running,
Interrupting and Stop retries concealed that condition. Browser-local stop
coordination also lost its intent on reload and conflicted with an interruption
already underway. A task must remain occupied until termination is established,
but occupancy is not evidence that the model is working.

## Decision

Add cleanup and blocked-verification lifecycle notifications. The runtime owns
process identities and a single recoverable termination operation. The application
owns its presentation and an attempt-scoped retry command. Repeated requests join
that operation. Surviving observed identities are inspected periodically; failed
inspection waits for explicit retry. No retained identity after unexpected worker
loss means automatic recovery is unavailable. ADR 0043's PID-reuse and snapshot
ancestry limits still apply; there is no force-unlock or timeout-based release.

Keep interruption intent separate from cleanup status. A single activation-scoped
Stop retries command either dismisses queued work or joins interruption and marks
the active run for dismissal after safe settlement. Both commands acknowledge
promptly over HTTP. Settlement persists the interruption and then dismissal before
confirming it, while task suspension protects the interval. No browser promise
owns finalization. The coordinator's pending intent survives browser reload, not
host restart. Existing paused startup and interrupted-attempt recovery remain
authoritative after a crash; there is no new persistence schema.

Project live state consistently into task activity, conversations, cards and
top-bar counts. Retry dates express earliest eligibility and include pause/stop
context. Occupied cleanup slots do not count as executing model work.

CLI shutdown pauses dispatch and waits for ordinary work, but returns an explicit
blocker if verification is unconfirmed. It keeps the host and recovery UI alive.
The user can retry verification and request shutdown again. Operational recovery
is documented in the project-state backup procedure.

## Consequences

Durable transcript and thread lineage are unchanged. Confirmed cleanup permits
normal settlement; unverifiable ownership remains reserved. An interrupted host
may lose unacknowledged/in-flight native output, so retaining both the coordination
state and native session files remains necessary for incident recovery.

Tests cover real disposable SDK workers with injected OS-command/inspection
failures, HTTP acknowledgement and both stop orders, multiple occupied tasks,
Pause/shutdown readiness, and browser reload in dark and light themes.
