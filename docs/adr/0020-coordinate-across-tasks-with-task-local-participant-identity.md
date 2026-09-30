# Coordinate across tasks with task-local participant identity

The framework supports flexible cooperation through shared task records rather
than restricting coordination to a role's prescribed workflow. A stable agent ID
names a reusable definition; the canonical participant address is `(taskId, agentId)`.
Every applied process agent is addressable on every mapped task, even without a
watcher or prior conversation. Process guidance assigns responsibility without
introducing board eligibility restrictions or new runtime permissions.

Cross-task comments belong only to their destination. Authenticated mutations
validate the caller's running attempt on its origin task independently from the
destination's lifecycle/mapping, and retain immutable origin IDs plus attempt
provenance. The current origin title is display metadata, with a retained title
fallback if the task disappears. Legacy origin is backfilled only from valid
attempt/author linkage; absent evidence stays unknown. Destination mentions use
the destination's ordinary queue and current/replacement conversation lineage;
conversation IDs are not agent addresses. An external comment's source tool
transcript remains in its author's conversation, without an outbound source
timeline event or duplicate comment.

This avoids conflating agents with the same ID but independent memory. Replies
to an external participant go to its origin task. Another running agent does not
lock comments or authorize interruption; direct execution controls, archival,
and global settings remain user-only. Comment retry identity is scoped to the
caller participant and operation, with normalized target/body retained alongside
the response in the same transaction; exact retries replay and changed payloads
reject. Other cross-task mutations and bounded history are separate delivery
slices, not already implemented by this decision's first comment/discovery slice.
