# Define Process Definition Evolution and Reloading

Type: wayfinder:grilling
Status: resolved
Blocked by: 04, 05, 07
Parent: ../map.md

## Question

When should the framework reload changed process-definition files, how should
tasks and agent runs already in progress relate to the definition version under
which they began, and what should happen when a valid new definition is
incompatible with live board state?

## Answer

### Loading and version identity

The first version loads the process definition once when the application
starts. It does not watch files or hot reload changes. Applying a changed
definition without restarting may be added later, but is not required for the
first version and does not need a separate user-approval ceremony.

Every successfully validated definition receives an automatically derived
**Process definition version**: a fingerprint of its complete effective
content, including referenced agent-instruction files. Non-semantic YAML
differences such as formatting, comments, and key ordering do not change the
version. A Git commit and a manually maintained version field are not required.

Boards, workflow columns, and agents have explicit stable **Process entity
IDs**, separate from their editable display names. Renaming or reordering an
entity preserves its identity. Changing an ID removes one entity and adds
another.

### Invalid definitions

If startup validation fails, the application enters a configuration-error
mode, reports the location-aware diagnostics defined by the authoring
experience, and starts no automation. It does not silently execute the previous
definition. Existing board information may remain visible when that falls out
naturally from durable state, but the first version does not preserve extra
display metadata solely to build a historical board UI while configuration is
invalid. The user fixes the files and restarts the application.

### Unmapped tasks and restored identities

A valid definition is applied even when some live state no longer maps to it. A
non-completed task whose saved workflow-column ID no longer exists becomes an
**Unmapped task**. The UI presents unmapped tasks in a conspicuous system-owned
holding area that is not a process column. Unmapped tasks preserve their former
board and column identities and full history, but:

- agent board queries exclude them;
- they cannot have agent runs;
- agent mentions in their comments remain authored text but create no
  activation; and
- only the user can move them into a defined workflow column.

Existing activations for an unmapped task remain durable and dormant. Moving
the task back into a workflow column does not replay mentions or create an
activation; the user decides whether to resume or dismiss preserved work and
may mention an agent in a new comment when another response is wanted.

Restoring the same stable workflow-column ID asserts continuity with the
previous column and automatically maps its tasks again without creating
activations. A conceptually different column must use a new ID.

### Completion and retired boards

Every board has exactly one framework-owned **Completion column**. It is
permanently last, has a stable framework-controlled identity, cannot be deleted
or reordered, and cannot have a watching agent. Process definitions specify
only the workflow columns preceding it. Entering it completes a task and
creates no column-agent activation. Process-definition changes cannot displace
completed tasks or reinterpret them as incomplete. Unlike unmapped tasks,
completed tasks remain deliberately queryable and inspectable by agents.

Removing a previously used board ID retires rather than deletes the board. A
retired board accepts no new tasks and has no active watchers. Its completed
tasks remain in its Completion column and stay inspectable; its other tasks are
unmapped. Restoring the same board ID restores the board, and matching workflow
column IDs map their tasks again without activation. Removing a board that has
never held live state leaves no retired shell.

### Activations across process versions

An activation records the Process definition version under which it was
created, but the framework does not retain old definitions merely to execute
old work. After a different version is applied, every older queued, failed, or
interrupted activation is a **Stale activation**. It does not dispatch or retry
automatically.

The startup impact view lists stale activations. One process-level **Resume with
current process** approval rebases all compatible stale activations: their
original reason, source-event pointer, activation order, and target agent ID
stay fixed, while new attempts use the target agent's current role and
instructions. Activations for unmapped tasks remain dormant. An activation
whose target agent ID no longer exists cannot be rebased and requires individual
dismissal.

When an activation already owns a usable Codex conversation, an approved
attempt resumes that conversation whether the preceding attempt was interrupted
or failed. It supplies the current instructions as authoritative context and
records the process-version change in the attempt context. A fresh Codex thread
is used only when the previous conversation cannot be resumed. No executable
copy of the old process definition is needed.

Loading or restoring a definition never synthesizes activations from existing
state. Changed watchers, newly mapped tasks, or any other reinterpretation are
not column entries, comments, or relationship events. The user can create an
explicit new expectation by commenting on a task and mentioning the relevant
agent.

### Related decisions exposed

The separate user-facing manual Reactivate action is unnecessary. A comment
that mentions the intended agent provides both the activation and durable
instructions explaining what should happen, so the settled lifecycle and board
interaction decisions now use mentions instead.

The user also needs a process-wide automation suspension covering all boards so
they can reach a confirmed state in which no agent is changing board state.
The detailed pause, transition, display, and resume behavior remains part of
**[Define Automation Observability and Recovery](./11-define-automation-observability-and-recovery.md)**.
