# Queue browser archival with durable results

Status: accepted

Presentation and dismissal were revised by [ADR 0048](0048-retain-lifecycle-results-in-shared-toolbar-menus.md):
archival results now live in a shared toolbar menu; only finished operations can
be dismissed. The queue, acknowledgement and deletion-authorization rules below
remain unchanged.

The browser opts into a queued archival command. Its HTTP 202 acknowledges a
durable operation identity and a snapshot of the requested task or Completion
column. The existing synchronous command remains available to established
callers. The application serializes queued work in one lane and yields between
tasks. Git operations remain asynchronous, allowing the host to serve reads and
accept other requests while a checkout is inspected or removed. A failed task
records its outcome and the queue continues.

Migration 0018 stores operation progress, per-task results and request identities.
Each task has its own row, so recording progress does not rewrite the entire
Completion column. Unchanged browser polls receive HTTP 304 before hydrating
the operation list. Task detail polls only operations involving that task.
Repeated request identities replay the same operation. Equivalent requests for
an active target join it and retain their own lookup keys. A different destructive
scope must be submitted after the active operation settles. The task archival
claim still owns eligibility, workspace deletion and interruption recovery.

Preview tokens remain only in the host's in-memory queue. After a restart the
host recovers task claims using the existing workspace checks, then reconciles
unfinished operation tasks against retained archive command results. Any task
whose outcome could not be established is marked interrupted. The host never
replays an interrupted deletion. Graceful shutdown stops queued work and waits
for a removal already in progress to settle.

The browser polls persisted progress and retains the same request identity
across reloads when a POST response is lost. Dismissal is persisted separately
from archival state. Active dismissed operations still disable duplicate
controls. Confirmation and partial failures share the viewport feedback panel
with other operations.
