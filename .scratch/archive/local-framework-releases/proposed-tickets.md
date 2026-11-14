# Proposed implementation tickets

Status: approved and published as individual issues on 14 November 2026.

Parent: [Local framework releases specification](spec.md).

After approval, publish each proposal as its own numbered Markdown issue under
this effort's issues directory. Keep the dependencies below and mark the issues
ready-for-agent. Each implementation uses the repository implement workflow,
including meaningful seam tests and code review, and leaves changes unstaged.

## 01 — Run a complete framework installation outside the development checkout

Blocked by: none.

What it delivers: an explicit local command assembles a uniquely identified
installation that can start a disposable project using installed Node.js, without
reading framework application code, assets or dependencies from the checkout.
It can be launched by its concrete installation path; latest selection follows
in ticket 02.

Acceptance criteria:

- Capture coherent inputs and provenance, including modified source if allowed;
  never require staging/committing and never overwrite an existing installation.
- Include host, browser, workers, MCP adapter, schema snapshot, runtime resources,
  notices, dependency graph and required SDK platform assets.
- An unavailable development checkout and its dependency links do not prevent
  installed startup, asset serving, controlled worker execution or MCP operation.
- Preserve matching readable source and source maps when applicable; expose the
  installed identity/location for outside diagnosis.
- Verify a disposable incident through existing database/session/workspace
  evidence and matching source without relying on the checkout.
- Use disposable project state and controlled runtime fixtures for routine tests;
  preserve normal state guards, paused startup and runtime policy.
- Document how to create and launch this local installation, supported Node.js,
  and its relationship to the longer-term bundled product distribution. Update
  the architecture map to reflect the implemented runtime path.

## 02 — Publish latest explicitly and adopt it only at host startup

Blocked by: 01.

What it delivers: the user explicitly publishes a verified release; a stable
local launcher automatically selects latest once per host start. Running hosts
and their subsequently launched children keep using the old installation.

Acceptance criteria:

- Ordinary builds/tests do not publish; explicit release publication verifies the
  candidate before changing latest and never modifies existing installations.
- Interrupted, failed and competing publications cannot expose partial releases;
  a racing launcher observes one complete installation or a clear failure.
- Publish B while A runs; verify A's later browser requests, workers and MCP
  processes still use A. Restart via the same launcher and verify B is selected.
- Latest resolution is not repeated by a running host or its children.
- Missing/invalid latest and unsupported Node.js fail with actionable information;
  there is no fallback to the checkout or silent older-release selection.
- Retain older installations; no automatic cleanup, restart or agent interruption.
- Through installed startup, verify a retained-database upgrade and failure path
  preserve existing migration verification, backups, reporting and no-fallback
  behavior. Release publication itself never opens consuming project state.
- Record durable publication/lifetime reasoning in an ADR and document the
  release, stop and restart workflow; update the architecture inspection map.

## 03 — Move the local idle-game launchers to the release workflow

Blocked by: 02.

What it delivers: the existing local idle-game entry points consume the shared
latest-release launcher, so users create a framework release on the framework
side and adopt it on the next normal project-host restart without selecting paths.

Acceptance criteria:

- Adapt both existing idle-game launch paths, including the process-repository
  wrapper used by Autonomous V2. Inspect each repository's applicable agent and
  process-authoring instructions before edits.
- Configure the shared local release location once. Normal launches do not build,
  install framework dependencies, or execute development source.
- Preserve each launcher's project validation, process definition, port,
  additional allowances, exit status and Ctrl+C/graceful-shutdown behavior.
- Launching preserves existing state bindings and does not relocate, initialize
  replacement state or bypass migrations. Invalid release selection produces an
  actionable error without source fallback.
- Verify the consuming launcher contract against disposable project fixtures,
  including A-running/B-published/restart-adopts-B; do not restart a live host or
  run tests against live idle-game databases.
- Document first-time release bootstrap and normal operation. Reaching installed
  operation on the user's live project requires a separately coordinated normal
  stop/restart; do not claim live adoption merely because launcher edits landed.
- Leave all changes unstaged in their owning repositories and report those
  locations. Do not commit, stage, push or disturb the user's accepted content.
