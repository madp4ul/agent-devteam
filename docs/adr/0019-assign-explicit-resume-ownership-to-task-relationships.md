# Assign explicit resume ownership to task relationships

Status: accepted

Dependencies and parent-child relationships describe that one task is waiting
on another task's outcome. They do not make the waiting task globally
ineligible for agent work. Mentions, user follow-ups, column responsibility,
retries, and other independent reasons to inspect that task remain valid while
a relationship is unresolved.

Every relationship therefore stores exactly one stable agent ID as its resume
owner. The owner is responsible for reassessing the source task when the target
next enters Completion; ownership is not a subscriber list and does not imply
that all other relationships are satisfied. Browser and agent creation must
choose the owner explicitly. Agent tools accept `self` as a convenient alias,
but resolve it to the caller's stable ID before persistence.

Each target entry into Completion records a fresh satisfaction event and
appends one `relationship-satisfied` activation for every attached
relationship's stored owner. These activations use the normal per-task queue,
remain distinct from one another and from existing work, and retain the exact
satisfaction event as provenance. Reopening and recompleting the target creates
a new event and activation. Creating a relationship to an already completed
target does not synthesize a past event.

Relationship removal is correction of coordination state, not successful
completion. It records immutable activity on both tasks but never wakes the
owner. Reassignment is allowed only while the relationship is unresolved and
records the previous and new owners on both timelines. Once an activation is
queued it is independent: later removal or reassignment cannot cancel or
retarget it; ordinary activation dismissal handles abandonment.

An unresolved outgoing relationship prevents source-task archival. If the
source is temporarily unmapped when satisfaction occurs, its activation is
still persisted and remains dormant under the existing mapping rule. Process
definitions may remove a referenced owner without making the application
inaccessible. Existing process-impact review instead lists the unavailable or
missing assignments, blocks automation resumption, and links to the ordinary
edit/removal controls for explicit repair.

## Consequences

- Activation eligibility depends on activation lifecycle state, task mapping,
  suspension, and ordering—not on unresolved relationships.
- Relationship satisfaction has one authoritative wake-up flow owned by the
  task command transaction.
- Coordinators can see who will reassess each waiting relationship and can
  change that responsibility before satisfaction.
- Legacy unresolved relationships migrate without inferred ownership and must
  be explicitly repaired; satisfied history needs no repair.
- The model deliberately supports one owner. Additional interested agents
  coordinate through task comments instead of competing owner assignments.
