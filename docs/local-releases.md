# Shared framework releases and local installation

The repository contains source and release tooling. Versioned **application ZIPs
are attached to GitHub Releases**, so everyone with repository access can obtain
the same build without committing generated installations into Git history.

The local `agent-devteam-releases` folder is an installation cache. Its location
outside the checkout isolates running application files; it is not the place
where shared releases are published. `COORDINATION_RELEASE_ROOT` can select a
different cache location.

## Publish a shared release

A release is built from an existing stable version tag, such as `v0.1.0`, and
records its complete commit SHA. Uncommitted changes are excluded. The maintainer
owns commits, pushes and tags; an agent may perform those steps when explicitly
asked to create a release. Inspect the working tree and index first, preserve
unrelated work, and use the reviewed committed revision.
The tag must match the committed package version. For local builds, the executing
release tooling must also match the selected tag; use that tag's checkout or its
CI workflow rather than mixing newer dirty build tooling with an older version.

After reviewing and committing the release tooling and source, the maintainer
pushes the commit and version tag to GitHub. The release workflow runs on version
tag pushes; it can also be run manually for an existing tag. Use a new version
tag for each release. Do not move tags or replace an already-published package.
An agent handling publication follows the workflow through its final result and
verifies the published tag, ZIP and checksum assets. A failed or canceled tag is
not silently moved; commit corrections under a new package version and tag.

The workflow:

1. Checks out the selected tagged commit on Windows and installs the locked
   dependencies with the repository's pinned pnpm version.
2. Typechecks and runs the normal non-browser suite without real-model opt-ins,
   with two concurrent test files and a five-minute test timeout. TAP output
   includes assertion diagnostics as tests finish; the check step also has a
   fifteen-minute limit and the build job has a thirty-minute limit.
3. Builds the complete installation from the committed tree and verifies it
   against disposable project state.
4. Packs a platform-specific ZIP and checksum, preserving hidden package files
   and readable source.
5. Transfers only verified output to the publication job, which attaches assets
   to a draft GitHub Release and then publishes the completed release as latest.

The build job has read-only repository access. The publishing job alone receives
contents-write permission, verifies that the remote tag exists and does not
silently create a tag from a branch. External actions are pinned to full commits.
Repository **release immutability** is recommended for future releases; this
implementation does not enable that setting or claim it is already enabled.

Before creating test fixtures or building the package, the workflow resolves
Windows' temporary directory to its canonical path and exports it as `TEMP` and
`TMP`. Hosted runners can supply an 8.3 alias such as `RUNNER~1`, while Git records
the full account directory. Mixing those spellings makes valid test worktrees
fail registration checks. Canonicalizing the fixture root avoids that mismatch
without weakening production ownership or archival guards. If checks stop
advancing, inspect failed assertions and job logs rather than treating an
in-progress job as evidence that every test is still passing.

Publication and hosted cleanup run in one repository-wide queued critical
section. After a successful publication, cleanup keeps **five published stable
framework releases**, protecting the new release and GitHub's designated latest.
Older matching release objects and their ZIP/checksum assets are removed. Git
tags and source commits remain. Drafts, prereleases, unrelated releases and
changed/uncertain targets are preserved. Historical download URLs for removed
releases stop working; already installed copies remain independent.

Cleanup failures produce a workflow warning without undoing the successful
publication. A separate Actions-write-only cleanup job deletes that run's
temporary transfer artifact after successful publication. Failed/canceled runs
retain it for at most one day. This is separate from hosted release retention.
GitHub currently documents
per-asset limits rather than a small cumulative release-download quota; five
versions is the project's housekeeping policy.

To build and inspect the same artifact locally from an existing tag:

```powershell
pnpm release:build --tag v0.1.0
```

The artifact is named
`agent-coordination-framework-v0.1.0-win32-x64.zip`. Local build output is not
uploaded automatically. The legacy `release:local` command now aliases this
committed artifact build and also requires a tag; it no longer means publishing
an uncommitted checkout as the current application.

Publication requires committed/pushed tooling and a version tag. Failed tests
block publication. The
superseded conversation-history assertion is aligned with issue 107's intentional
self-mention rejection; the behavioral gate is not skipped or waived.

## Install the launcher once

This increment targets Windows x64 with installed Node.js 24 or later, Git and
Windows PowerShell. End users do not need pnpm, build tools, GitHub CLI or a
framework source checkout to run an installed application. The longer-term
bundled-runtime distribution remains the intent of ADR 0002.

From the framework checkout, install the small self-contained bootstrap into the
local cache:

```powershell
pnpm release:install
```

Use `--root <directory>` or `COORDINATION_RELEASE_ROOT` for another cache location.
The bootstrap and its repository configuration stay in that cache, independently
of subsequent source edits. It does not alter any installed application version
or start/migrate a project. The configuration contains no access tokens.

## Start the idle-game project

Keep using `start-agent-devteam-v2.bat` in `idle-games-autonomous-v2`. Its name and
location are unchanged. The process-repository launcher resolves latest once,
validates the V2 process using the returned installation and starts that same
installation. Port 3001 and `--port` / `--additional-allowances` remain supported.
The legacy original idle-game batch integration uses the same bootstrap with its
Autonomous process and default port 3000, where that checkout is still present.

On every start, the bootstrap:

1. Reads the known repository's latest published stable release from GitHub.
2. Selects the exact compatible application asset and checks its published
   SHA-256 digest and tagged commit provenance.
3. Downloads and verifies missing packages before extracting into a fresh staging
   directory. Unsafe paths, link entries, collisions and oversized archives fail.
4. Atomically installs the complete version and advances the local selection.
   Concurrent project starts reuse the same validated installation.
5. Returns that one concrete installation for the entire host lifetime.

Publishing a newer release has no effect on a running host, browser assets or
workers/MCP processes started later. A normal stop and restart adopts latest.
Installed versions are never edited in place. Cache bookkeeping pins each
selected installation for its host process before startup can race cleanup.
Automatic cleanup removes managed versions only when no host or lingering worker
can use them. The normal steady state is **one selected installation**; older
running versions stay until their users exit and a later startup reclaims them.
Unknown process evidence and legacy installations from before usage tracking are
retained conservatively until safe ownership proof is available. Process
definitions and role instructions remain external inputs.

The small `release-usage.sqlite3` in the cache records usage and serializes final
installation, selection and pruning. It is separate from every project's
coordination database and does not store tasks, transcripts or game state.

The public repository requires no download credentials. Private deployments may
supply an authorized token through the documented process environment; tokens
must not be placed in repository files, cache configuration, logs or batch files.

## Offline startup and failures

If discovery is offline, or the repository does not yet have its first published
release, startup warns and may use the last validated local installation. During
transition this can be the existing local snapshot. A first installation without
any valid cache fails clearly. There is no silent source-checkout fallback.

Malformed release data, checksum/provenance failures, unsafe extraction and
application startup errors fail visibly. Once the selected host starts, its
ordinary state guard, schema checks, verified migration backup, transactional
upgrade and paused startup remain authoritative. A migration failure never
silently retries an older executable or restores the database.

## Diagnose an installed host

Launch output identifies the selected version, installation and source digest.
Read its `release.json` and matching `src`, rather than assuming development source
matches the running version. Shared artifacts additionally identify the tag and
full committed source revision.

Task, activation, attempt, transcript and native thread evidence remains in its
existing database/session locations under the existing retention rules. Task
worktrees and external process inputs retain their meanings. For a live incident
database capture use SQLite's online backup facility; do not copy only the main
file and omit committed WAL data. Follow the project-state recovery guide.

## Development snapshots

The lower-level installation builder and `snapshot:local` remain useful for
throwaway verification. They may capture uncommitted development source and must
use a separate snapshot root. They are not shared releases. Snapshot publication
must refuse a cache managed by the GitHub updater, so it cannot replace the
normal project bootstrap or latest selection.

## Dependency handling

Dependencies remain bundled and locked into each verified application ZIP. A new
version is downloaded once and then starts without installing pnpm/npm packages
or contacting a package registry. This retains the exact tree tested before
publication and needs no manual dependency work on the consuming project.

Downloading dependencies separately is possible, but introduces package-manager,
registry and lifecycle-script requirements during installation. With the accepted
approximately 220 MB download, it adds complexity without solving a current need.
Bundling only production dependencies after the browser build is the simplest
future size optimization; it is not part of the retention change.

See the [release decision](adr/0051-distribute-tagged-releases-through-github.md)
and [retention decision](adr/0052-bound-hosted-and-installed-release-retention.md)
for reasoning. The [distribution research](../.scratch/shared-framework-releases/research.md)
and [retention/dependency research](../.scratch/release-retention/research.md)
provide supporting primary sources. Earlier local-only specifications are
historical; this guide and the superseding ADRs describe the current policy.
