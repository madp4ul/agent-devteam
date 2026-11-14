# 02 — Publish latest explicitly and adopt it only at host startup

Status: resolved

Type: task

Parent: [Specification](../spec.md).

Blocked by: 01.

What it delivers: the user explicitly publishes a verified release; a stable
local launcher automatically selects latest once per host start. Running hosts
and their subsequently launched children keep using the old installation.

Acceptance criteria:

- [x] Ordinary builds/tests do not publish; explicit release publication verifies the
  candidate before changing latest and never modifies existing installations.
- [x] Interrupted, failed and competing publications cannot expose partial releases;
  a racing launcher observes one complete installation or a clear failure.
- [x] Publish B while A runs; verify A's later browser requests, workers and MCP
  processes still use A. Restart via the same launcher and verify B is selected.
- [x] Latest resolution is not repeated by a running host or its children.
- [x] Missing/invalid latest and unsupported Node.js fail with actionable information;
  there is no fallback to the checkout or silent older-release selection.
- [x] Retain older installations; no automatic cleanup, restart or agent interruption.
- [x] Through installed startup, verify a retained-database upgrade and failure path
  preserve existing migration verification, backups, reporting and no-fallback
  behavior. Release publication itself never opens consuming project state.
- [x] Record durable publication/lifetime reasoning in an ADR and document the
  release, stop and restart workflow; update the architecture inspection map.

## Comments

- 2026-11-14: User approved the breakdown and authorized implementation. Preserve the Autonomous V2 batch entry point at its current location.
- 2026-11-14: Implementation started after the independent-installation seam passed. The publication regression first failed because the publication entry point did not exist, then passed after adding explicit publication and one-time startup selection. Enhanced verification covers actual host worker dispatch and competing publishers.

## Answer

Implemented explicit local publication through `pnpm release:local`. Each candidate
is captured and verified by the independent-installation command before publication.
The shared self-contained launcher and latest selection are written to temporary
files, flushed, and atomically renamed into place. Windows file-sharing contention
retries the atomic rename for at most 500ms; it never removes the accepted selection.
Competing publishers may finish in either order, selecting one complete installation.

The startup launcher resolves one canonical installation, checks readiness,
platform, architecture, supported Node.js and required application files, then
imports that concrete launcher in the host process. There is no checkout fallback,
release-directory overwrite, automatic cleanup or host restart. The resolver is
also available to project-specific wrappers so validation and startup share a
single selected installation.

Verification:

- Initial public regression failed because the publisher entry point did not exist.
- Initial A/B publication regression passed after implementation.
- A genuine competing-publication regression exposed Windows EPERM rename contention;
  bounded atomic retries corrected it without introducing a missing-pointer window.
- Enhanced regression passed with two competing candidates, an existing host serving A,
  real host task dispatch starting its A runtime worker after publication, and normal
  restart selecting the latest complete B/C installation. The fixture forces an absent
  model executable and verifies exact single source substitutions before capture.
- Failed duplicate/incomplete candidates preserve latest; interrupted temporary files
  are ignored; unsupported Node.js and traversal selections fail without fallback.
- After code-review isolation corrections, the same regression passed with inherited
  COORDINATION_RELEASE_ROOT deliberately pointing outside the fixture (79.6 seconds).
  Every launcher subprocess explicitly selects the fixture release root.
- Typechecking passed. Installed migration success/failure and recovery-backup behavior
  is independently covered by the parent agent's packaged migration regression.

All changes remain unstaged. Parent owns final aggregate review, complete-suite
verification and publication of the user's first operational release.

## Completion

Final Standards and Spec reviews have zero remaining findings. The publication regression also passed with a deliberately invalid inherited release-root environment. See [integrated verification](../verification/results.md). Changes remain unstaged for user review.
