# Shared releases built from committed revisions

Status: implemented — reviewed and fully verified; hosted publication awaits user Git actions. Issue 04 is resolved.

## Problem Statement

The first delivery isolated runtime execution through local snapshots, but the
user defines a release as a versioned application artifact shared through the
repository. A local copy containing uncommitted changes is insufficient. The
user accepted committed source revisions and repository-attached downloads,
automatically installed and adopted when the existing project batch file starts.

## Solution

Create a complete Windows x64 application ZIP from an existing version tag's
committed tree. Verify it before attaching it to a draft GitHub Release, then
publish the complete release as latest. Keep generated archives out of Git.

The batch launcher checks GitHub latest once per start, verifies the correct
platform asset against GitHub's SHA-256 digest, installs it atomically into a
local cache, and returns one concrete installation for process validation and
host startup. The host and later workers never consult latest again.

The existing sibling installation root remains a compatibility cache, not the
shared release location. Running hosts and project state remain untouched.

## User Stories

1. As the maintainer, I want to release an existing version tag, so that the artifact's source is committed and identifiable.
2. As the maintainer, I want dirty checkout changes excluded, so that an artifact contains the tagged revision only.
3. As the maintainer, I want native build and verification before publication, so that users receive a complete runnable application.
4. As the maintainer, I want archives attached to GitHub Releases, so that readers can obtain the same artifact without generated copies in Git history.
5. As the maintainer, I want draft assembly before publication, so that latest never points to an asset that is still being uploaded.
6. As the maintainer, I want release tooling committed alongside source, so that publication is reviewable and repeatable.
7. As the user, I want the same V2 batch-file location, so that my startup routine remains unchanged.
8. As the user, I want startup to install latest automatically, so that I do not copy packages or select versions.
9. As the user, I want the downloaded bytes verified before extraction, so that an incomplete or substituted download cannot become active.
10. As the user, I want fresh bounded extraction and atomic installation, so that incomplete or escaping archive contents cannot alter unrelated files.
11. As the user, I want concurrent project starts to share complete installations, so that they cannot race into partial packages.
12. As the user, I want running hosts fixed to one version, so that publication and startup elsewhere cannot affect their children or browser assets.
13. As the user, I want matching source, version, commit and diagnostic evidence, so that outside agents can investigate installed failures.
14. As the user, I want ordinary database migration and recovery behavior, so that new application versions preserve state guarantees.
15. As the user, I want a visible cached-start warning when discovery is offline, so that network availability alone need not stop established local work.
16. As the user, I want integrity failures and startup/migration failures reported directly, so that fallback does not hide corruption or attempt unsafe downgrades.
17. As the maintainer, I want commits, pushes and tag publication to remain mine, so that agent implementation does not alter accepted Git history.

## Implementation Decisions

- Retain the complete readable TypeScript installation format and installed
  Node.js 24/Git prerequisites. Add Windows PowerShell's built-in ZIP APIs; no
  dependency on GitHub CLI for consumer startup. Windows x64 is the first asset.
- Accept stable version tags in the form vMAJOR.MINOR.PATCH. Resolve the existing
  tag to its full commit SHA and export that tree rather than copying the current
  checkout. Verify the locked dependency graph against the exported source.
- Artifact metadata records tag, full source revision and committed provenance.
  Retain existing source/package digests and installed-host verification.
- Use distinct artifact build and hosted publication responsibilities. A tag
  push, or manual run for an existing tag, drives a Windows CI build; GitHub CLI
  publication verifies that the remote tag exists. Do not create tags implicitly.
- Run typechecking and the complete normal suite before publication. Keep build
  permissions read-only, grant publication-only contents write, pin action SHAs,
  and disable persistent checkout credentials. Do not waive the existing unrelated
  conversation-history failure to get a release through CI.
- Upload the verified ZIP and checksum into a draft, then publish as latest.
  Recommend repository release immutability, but do not change repository settings
  or claim that the setting is enabled without evidence.
- Consumer discovery uses the known repository's published latest release API,
  excluding drafts/prereleases. Match exact version/platform asset naming and
  require its SHA-256 digest. Verify committed provenance against the tagged commit.
- Stream bounded downloads and extract only validated regular files/directories
  into a fresh staging directory. Reject traversal, links, ambiguous or colliding
  paths and oversized archives. Include hidden package files when packing.
- Advance the cache pointer only after complete installation validation. Never
  overwrite existing release contents. Same-version conflicting provenance fails.
- A bootstrap updater is installed independently of the development checkout.
  Existing process launchers can keep their one-time resolveLatestRelease call.
  Bootstrap configuration contains repository identity, not credentials.
- Public downloads need no credentials. Optional private access must keep tokens
  out of persisted configuration/logs and must not forward them to an unrelated
  redirected origin. Tests explicitly isolate their endpoint and environment.
- If discovery is unavailable or no first hosted release exists, emit a warning
  and allow the last validated cached installation, including the existing local
  snapshot during transition. No cached installation means a clear startup error.
  Malformed releases, integrity/extraction failures and host startup/migration
  failures fail closed; there is no older-version retry after host startup begins.
- Preserve project state bindings, process inputs, native permissions, paused
  startup and normal stop/restart adoption. No application-state migration is
  performed by download or installation itself.

## Testing Decisions

Retain the approved artifact/installed-host subprocess seam. Extend it with a
controlled HTTP boundary standing in for GitHub, with no real-model calls.

- Build from a disposable committed tag after modifying its checkout; inspect the
  unpacked source and committed metadata, then start the installed application.
- Exercise pack/unpack with hidden/deep package paths under Windows PowerShell
  5.1 and reject malicious entry shapes through the public archive helper.
- Serve tagged release metadata and ZIP bytes through a controlled endpoint;
  verify first install, cached reuse, startup-time adoption and fixed host paths.
- Reject missing/mismatched digests, invalid provenance and unsafe extraction
  without advancing latest. Exercise interrupted/concurrent installation.
- Verify offline cached start separately from fail-closed corruption and runtime
  migration behavior. Existing installed migration tests remain authoritative.
- Keep the real V2 batch file unchanged; verify wrapper resolution/validation and
  start against disposable prepared clones. Never start the live game projects.

## Out of Scope

- Agent commits, pushes, tag creation or automatic repository setting changes.
- Publishing uncommitted tooling as a committed release or inventing a successful
  remote CI/publishing run before the user commits and pushes it.
- Node bundling, additional OS/architectures, differential updates, live reload,
  automatic cache cleanup, and automatic database downgrade/restoration.
- Freezing external process definitions, credentials or operating-system inputs.

## Further Notes

User acceptance on 14 November 2026 supersedes the local-only publication and
dirty-source behavior of the first delivery, while preserving its isolation and
diagnostic guarantees. [Primary-source research](research.md) supports the change.
Read-only GitHub API inspection confirmed a public repository and no existing
releases/tags among the returned entries. Actual publication must wait for the
user's committed/pushed version tag and successful CI checks.

Delivery: [01](issues/01-committed-release-artifact.md) ->
[02](issues/02-download-at-startup.md) -> [03](issues/03-transition-launchers.md).

See [integrated verification and deployment](verification/results.md). No hosted release or successful remote workflow run is claimed.
