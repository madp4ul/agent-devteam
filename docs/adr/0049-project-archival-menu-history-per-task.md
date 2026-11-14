# Project archival menu history per task

Status: accepted

User review clarified that an archival request is a grouping and retry identity,
not the unit shown in the Archiving menu. A Completion-column request can contain
many tasks, and each task must leave active work and enter history as soon as its
own archival settles. Failed tasks need their own status, reason and task link.

Retain the existing authoritative operation queue, request aliases and per-task
safety claims. Bulk and individual requests already use the same archival claim,
workspace inspection and cleanup flow; bulk adds Completion eligibility and
does not supply individual deletion consent. Confirmation-requiring failures
therefore remain task-specific outcomes. A user can follow the task link and
request a fresh individual review, preserving preview fingerprints, explicit
consent and revalidation rather than inventing a second deletion mechanism.

Migration 0020 adds a timestamp, presentation dismissal flag and terminal history
sequence to each existing archival-operation task row. State, failure and these
menu facts commit together through the existing operation store transaction.
Progress elsewhere in the batch never rewrites a settled task's timestamp.
Restart reconciliation preserves settled/dismissed entries and records interrupted
outcomes for unfinished tasks without replaying deletion authorization.

The menu query returns active task rows and at most twenty undismissed terminal
task rows. Its cursor is the durable terminal sequence rather than an operation
identity, so even one large batch remains pageable. Counts refer to task rows.
History clearing dismisses terminal task rows, including those in still-running
batches, and never dismisses queued/running rows. Original operation/task records
and retry receipts remain retained for reconciliation and idempotence.

Existing settled rows inherit the operation's last retained timestamp during
upgrade because earlier per-task finish times were not recorded. Existing
operation dismissal transfers only to terminal task rows. New outcomes receive
their own recorded completion/reconciliation timestamp and ordering sequence.

Run-history cards use the shared status-chip pattern, with successful prose
omitted and failure reasons kept inside the linked card. Live preparation views
carry task titles directly; a separate history request no longer gates their
identity display. This refines [ADR 0048](0048-retain-lifecycle-results-in-shared-toolbar-menus.md).
