# Distribute the local application as a self-contained host-native program

Status: accepted

The production application will be distributed as a self-contained program
that runs on the user's host and serves its interface on localhost. It will
bundle its runtime and application dependencies so using the product does not
require installing Node.js, pnpm, or repository dependencies. Development
continues to use the ordinary TypeScript, Node.js, and pnpm toolchain; the exact
executable or installer technology remains a packaging decision rather than an
application-architecture constraint.

Running host-native keeps the application, Git task workspaces, and the Codex
SDK in one operating-system environment. This avoids a container-to-host worker
protocol, duplicated authentication and lifecycle management, and incompatible
Windows-host/Linux-container paths in Git worktree metadata. Docker may remain
useful for development, testing, or an optional deployment, but it is not the
primary first-version distribution and must not determine application paths or
interfaces.

## Considered options

- Distribute a Docker Compose control plane and run Codex and Git inside its
  containers.
- Distribute a Docker Compose control plane plus a separate Windows host worker
  for Codex, Git, and local filesystem access.
- Require users to install the TypeScript development toolchain and run the
  application from source.
- Distribute one self-contained host-native application while retaining the
  localhost browser interface.

## Consequences

- The version-controlled process definition and agent instructions remain in
  the selected project repository.
- Durable coordination data belongs in a framework-owned per-user application
  data directory outside every project repository. On Windows the default is
  under `%LOCALAPPDATA%\AgentCoordination\projects\<project-id>`; other hosts use
  their platform-equivalent application-data location.
- The task-workspace root remains deployment configuration outside the primary
  checkout. Its default should be on the same filesystem and near the project
  when practical, while allowing the user to choose another location.
- Git and the Codex SDK run host-native under the user's existing filesystem,
  authentication, sandbox, and permission environment.
- A later packaging ticket must produce and verify the self-contained artifact.
  Source-based `pnpm` commands remain the developer workflow, not end-user setup.
