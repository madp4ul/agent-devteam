# Relocate project state with one recoverable offline command

Status: accepted

An initialized project's bound state root is relocated only by the dedicated
offline `coordination relocate-state <destination>` command. The command derives
the source from the repository-local binding, excludes normal startup and agent
runs, stages and validates the complete destination, repairs persisted paths and
Git worktree registrations, and changes the binding only at verified cutover.
This keeps the user's workflow to one destination argument while concentrating
cross-filesystem copy, interruption recovery, and rollback hazards inside a
single guarded operation instead of a browser action or manual procedure.

## Consequences

- Normal startup never interprets a changed `--state-root` value as a relocation
  request.
- The application and relocation command need one shared exclusive project-state
  operation guard.
- A durable journal outside the moving root makes an interrupted operation
  recoverable and prevents either root from being silently adopted.
- The intact source is rollback material until cutover; a separate user-created
  backup is not required for the ordinary relocation path.
- Backup and restore remains a same-location recovery workflow rather than a
  supported substitute for relocation.
