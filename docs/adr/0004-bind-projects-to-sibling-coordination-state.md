# Bind each project to a sibling coordination state root

Status: accepted

Each project repository clone is bound through repository-local Git
configuration to one framework-owned project state root. The default root is a
sibling named `<repository-name>-agent-coordination-state`; it contains both the
coordination database and the project's task worktrees. This keeps state close
and discoverable without exposing the database to ordinary `git clean` inside
the primary checkout, while avoiding machine-specific paths in the
version-controlled process definition.

## Considered options

- Keep the database and task worktrees in an ignored directory inside the
  primary checkout.
- Put durable coordination state in a per-user application-data directory and
  task worktrees in a separately configured root.
- Keep one explicitly bound state root beside the primary checkout, with an
  optional custom location selected during initialization.

## Consequences

- The binding is resolved once and reused across launches; omitted or changed
  startup arguments cannot silently select another database or workspace root.
- Startup validates the binding, database workspace records, physical
  directories, and Git worktree registrations before allowing automation.
- A missing or inconsistent bound root fails closed and is never replaced by an
  empty store.
- Relocating initialized state is a separate, explicit operation because Git
  retains worktree-location metadata. The first implementation need not support
  relocation.
- This decision supersedes only ADR 0002's application-data and independent
  task-workspace-root location consequences; its host-native distribution
  decision remains accepted.
