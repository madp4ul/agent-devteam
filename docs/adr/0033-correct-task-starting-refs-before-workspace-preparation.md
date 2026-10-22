# Correct task starting refs before workspace preparation

On 2026-10-22, an invalid starting ref on idle-games task T-0173 prevented its
workspace from being created. Its integrator identified the typo but could only
post a correction comment; a task-local agent could not execute before workspace
provisioning. Extend the existing optional-field task edit operation so a
participant on another task can correct the ref through the same revision,
idempotency and authenticated provenance rules as content edits.

Ref changes are allowed only before a dispatch preparation claim or recorded
workspace exists. The command transaction checks those durable facts, and the
scheduler claims before yielding to Git I/O, preventing an edit from racing with
provisioning. Inspection reports the effective starting ref, workspace lifecycle
and editability. Ordinary content edits remain available independently.

Retain isolated workspaces as a prerequisite for agent execution. Running an
agent without its task workspace would broaden runtime and permission contracts
merely to repair configuration. A correction comment remains authored context,
not an implicit command. Ref editing neither resolves startup attention nor
requests execution: explicit user Retry/Resume remains the recovery boundary.
No released schema changes or workspace adoption/cleanup are needed.
