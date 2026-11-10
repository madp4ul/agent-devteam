# Coordinate shared resources through task-owned claims

Status: accepted

Native game testing exposed waits between otherwise unrelated tasks that task
dependencies and allocator comments could not represent simply or atomically.
Shared resources therefore belong to the project's coordination model, with
task-owned exclusive claims and a FIFO queue. They are not tasks, process-defined
columns, external process locks, or machine-wide coordination services.

Release assigns ownership to the next task and creates the requesting
participant's activation atomically. The task may be busy or suspended: reliable
continuation takes precedence over resource utilization. An immediate grant
needs no extra activation. Pending claims suppress stall recovery, not ordinary
activations, following the same distinction as waiting relationships.

Ownership survives failed attempts, pauses and restart. Only explicit release or
human Completion clears it; agent Completion must reject until held and pending
claims are cleared. Human Completion intentionally cancels pending claims and
hands held resources onward. This is authority over coordination state, not proof
that an external process has stopped. Any agent on the owning task can release;
cross-task release and browser claim/release controls are outside this feature.

A queued grant activation remains independent of subsequent claim release,
matching ordinary activation ordering. Its exact claim identity prevents a later
claim from reviving the old grant, while current activation context tells the
recipient whether that claim is still held. Claim lifecycle activity is retained
in the task timeline. Resource archival rejects while held or pending claims exist.

Wait-cycle rejection includes task relationships and resource queue predecessors,
and runs when either kind of edge is added. A rejected request creates no wait or
special recovery exemption. Agents receive a blocking chain and coordinate to
release resources or remove unnecessary relationships before retrying; a separate
recovery protocol for this negotiation is deferred until evidence warrants it.
