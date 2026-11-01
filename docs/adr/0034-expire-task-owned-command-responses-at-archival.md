# 0034: Expire task-owned command responses at archival

Status: Accepted

## Context

Commands retain exact response JSON for idempotent retries. Many mutation
responses include a complete task projection, so successive comments and moves
duplicate growing coordination histories. Removing transcripts at archival does
not remove these snapshots. In an observed project, archived task owners
accounted for about 3.36 GB of response payload; active task owners accounted for
another 8.22 GB.

Deleting every response is unsafe: retrying a successful task creation can create
another task, and forgetting lifecycle receipts can repeat an old unarchive.
Agent commands can also mutate a different task, so response destination and
command ownership are not interchangeable.

## Decision

Archival ends the retry window for task-owned mutation responses. Delete them in
the same SQLite transaction that deletes conversation details and archives the
task. Match exact task identities from both colon-delimited legacy scopes and
JSON command keys. JSON scope identifies the owner; otherwise caller provenance
can identify it. A cross-task response belongs to its caller's task.

Preserve task-creation, child-creation, archive, unarchive and bulk-archive
receipts. Preserve keys without a proven owner rather than guessing from a
response body. Inspect only the covering key index when selecting expired
responses, rather than loading large snapshots during each archive operation.

Use the same retention function in exclusive offline maintenance to remove
already archived owners' responses. Verify a database backup before cleanup;
compact explicitly during maintenance rather than vacuuming during archival.
No schema change or startup migration is needed.

## Consequences

Archived tasks keep their authoritative comments, activity, attempts, conversation
lineage and cost evidence. Creation and lifecycle retries remain protected.
Ordinary mutation retries after archival no longer replay pre-archive snapshots;
after unarchival those keys are outside their original retry window.

Active-task snapshots can still grow substantially. Bounding or compressing
those responses is a separate change to storage or retry semantics, not part of
this archival policy. Small unscoped receipts and lifecycle snapshots also remain.
