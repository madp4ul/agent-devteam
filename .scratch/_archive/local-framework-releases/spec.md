# Local framework releases independent of the development checkout

Status: implemented — verified and reviewed; source changes awaiting user review.

## Problem Statement

The user develops the Agent Coordination Framework while using it to coordinate
work in sibling idle-game repositories. Their launchers currently execute the
framework's development checkout. Editing framework source, installing
dependencies, or rebuilding browser assets can therefore affect those projects,
including files loaded by newly started workers during an existing host session.

The user wants to choose when accumulated framework changes become a release.
Consuming projects should adopt that release automatically on their next normal
host start, without a manual version-selection step. Outside Codex agents must
retain their ability to investigate project and framework failures.

## Solution

Provide an explicit local release operation that assembles and verifies a
complete, independently runnable installation outside the development checkout.
Publish each release into a new versioned directory that is never modified in
place. Only after verification succeeds, atomically select it as the latest local
release. Building or testing development code does not publish a release.

At startup, a project launcher resolves the latest release once and starts that
concrete installation. The host and every child it launches use the same release
throughout that host lifetime. Publishing another release has no effect until the
user stops and restarts the consuming host. Existing installed Node.js may be
used; bundling Node.js is not required for this local delivery increment.

## User Stories

1. As the user, I want to edit framework source while idle-game work continues, so that development does not alter the running installation.
2. As the user, I want to create a release explicitly after enough changes accumulate, so that publication follows my judgment.
3. As the user, I want ordinary builds and tests to leave the published release unchanged, so that verification does not deploy development code.
4. As the user, I want each release to contain everything needed from the framework, so that application execution does not depend on its checkout.
5. As the user, I want to use my installed supported Node.js, so that runtime bundling does not delay isolation.
6. As the user, I want a failed release attempt to preserve the previous latest release, so that a broken candidate is never selected for normal startup.
7. As the user, I want each host to select latest only at startup, so that publishing does not interrupt ongoing work.
8. As the user, I want workers and MCP processes started later to use their host's release, so that one session never mixes application versions.
9. As the user, I want restarting an idle-game host to adopt the latest release automatically, so that I do not edit paths or select versions for each update.
10. As the user, I want old installations preserved while they may be in use, so that publication cannot invalidate an active host.
11. As the user, I want project state and task workspaces to remain in their existing locations, so that installing a release does not relocate or reset my work.
12. As the user, I want normal database compatibility checks, verified migration backups, migrations and failure reporting to run on startup, so that release consumption preserves recovery guarantees.
13. As the user, I want a failed startup to report the selected release and problem without silently trying older code, so that database compatibility is not guessed.
14. As an investigating Codex agent, I want existing task, activation, transcript, session and workspace evidence to remain available, so that installed releases remain diagnosable.
15. As an investigating Codex agent, I want the running release's identity and matching readable source, so that I can interpret evidence against the code that actually ran.
16. As the user, I want framework development instances to use disposable project fixtures, so that release testing does not mutate live idle-game coordination state.
17. As the user, I want clear first-install and missing-release instructions, so that startup never silently falls back to executing the development checkout.

## Implementation Decisions

- Maintain separate development checkout, versioned installation, and bound
  project-state responsibilities. No new coordination authority or state owner is
  introduced.
- A release is a complete installation, not just a browser build. Include host
  entry points, startup and Codex workers, MCP adapter, browser assets, required
  schema snapshot, reviewer-policy resources/notices, and runtime dependencies,
  including the SDK's required platform executable assets.
- Runtime dependencies must not resolve through development-checkout links or
  package-manager storage whose maintenance could invalidate the installation.
  Artifact verification must exercise this boundary, not just directory shape.
- An immutable TypeScript snapshot executed by installed Node.js is acceptable.
  Host compilation is an implementation choice. If transformed code is shipped,
  retain matching source and source maps for diagnosis.
- Give each release a unique identity and provenance sufficient to identify the
  exact shipped source and dependency graph. Do not label modified source with
  only an unchanged Git commit ID. Do not stage or commit to create a release.
- Assemble a coherent source snapshot before building the artifact; reject or
  otherwise prevent mixed-input releases if development changes during capture.
- Keep candidate assembly separate from latest selection. Partial installation,
  failed verification, concurrent publication and interrupted publication must
  never expose an incomplete installation as latest. Never overwrite an existing
  release identity. Exact storage layout and pointer representation are left to
  implementation.
- Resolve latest to one concrete installation at the launcher boundary. All host,
  browser, worker and MCP paths subsequently derive from that installation,
  including processes started after another release is published.
- A launch racing publication may select either complete release; it must never
  combine them. Normal startup with a missing or invalid selection fails clearly.
- Do not delete old installations automatically in this increment. This avoids
  needing to infer whether another host still uses them.
- Preserve project paths, process inputs, ports, launch allowances, Codex home and
  native permissions. Process definitions and role instructions remain external
  inputs; this effort does not introduce process-definition release management.
- Preserve the existing project-state guard, paused startup and graceful shutdown.
  No automatic host restart or agent interruption is part of publication.
- On next startup, use the usual migration ledger, compatibility refusal,
  independently verified recovery backup and transactional migration process.
  Report failures through the existing startup path. Never silently retry with
  older application code or restore state automatically.
- Existing database, session, worktree and transcript evidence remains subject to
  its existing retention rules; this feature does not promise undeleted archived
  transcripts or complete raw-event logging.
- Make selected release identity, installation location and matching source
  discoverable to an outside investigating agent through launch output and local
  metadata. Retain the existing diagnostic channels.
- Document this as an interim local distribution using installed Node.js. The
  accepted longer-term self-contained host-native product distribution remains
  unchanged. Update the architecture map when the runtime flow is implemented,
  and record durable release-selection reasoning in an ADR.

## Testing Decisions

Approved primary verification seam: launch and inspect a
real packaged host as a subprocess against a disposable project. Reuse the
existing CLI host-lifecycle and startup fixtures. Test external behavior and
observable release identity rather than private packager helpers.

- Build release A, launch it with the development checkout unavailable, and verify
  browser serving, schema-resource loading and normal paused startup.
- Exercise packaged worker and authenticated MCP boundaries using controlled
  runtime fixtures; do not require paid model calls in routine verification.
- Publish B while A runs; request browser assets and start controlled child work
  afterwards. Verify every application component still belongs to A. Stop and
  restart through the same consuming launcher and verify B is selected.
- Change development source, browser assets and dependency installation without
  altering either running A or installed B. Verify no source dependency is hidden
  behind a link into the checkout.
- Reject incomplete/failed candidates without changing latest. Cover an
  interruption or concurrency at the publication boundary with a deterministic
  observation that only complete A or complete B can be launched.
- Reuse retained released-database fixtures to verify successful upgrade and a
  rejected/failed upgrade through installed startup, including recovery evidence
  and absence of silent fallback. Do not duplicate the entire migration suite.
- Inspect a disposable incident's task/attempt/transcript/thread evidence and
  matching packaged source from outside the installed application; establish
  diagnostic parity without access to the development checkout.
- Test missing release, unsupported installed runtime and invalid selection as
  actionable launch failures. Integration fixtures stand in for real idle-game
  repositories; automated checks must not open their retained state.

## Out of Scope

- Bundling Node.js, a single-file executable, installer, public registry,
  downloadable releases, remote update service or general cross-platform rollout.
- Automatic publication after tickets, commits, builds or tests.
- Hot upgrades, automatic host restart, or changing an active host's release.
- Automatic downgrade, database rollback, or recovery-backup restoration.
- Automatic old-release cleanup or a release-management browser interface.
- Pinning process definitions, role instructions, Node.js, Git, credentials,
  operating-system configuration or other independently changing external inputs.
- Expanding diagnostic retention or introducing a logging/telemetry subsystem.

## Further Notes

The user explicitly accepted normal startup migration and failure behavior on
14 November 2026. There is no remaining product decision blocking this proposal.
The user approved the verification seam and all three implementation tickets,
and authorized implementation. Autonomous V2 must retain its batch entry point
in the same checkout location and consume latest on startup.

Tickets: [01](issues/01-independent-installation.md),
[02](issues/02-publish-and-adopt-at-startup.md),
[03](issues/03-idle-game-launchers.md).

Implementation and local bootstrap are complete. See [verification and deployment](verification/results.md). Existing live hosts remain on their previous execution environment until the user normally stops and restarts them.
