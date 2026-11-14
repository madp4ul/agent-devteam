# Bounded release retention and current comment-test expectations

Status: implemented — full suite and two-axis review passed; changes await user review.

## Problem Statement

The user accepts approximately 220 MB downloads but wants bounded storage and no
manual dependency maintenance. Hosted versions should remain near five; local
versions should be removed once known unused. The user also identified that the
publication-blocking comment test predates intentional self-mention rejection.

## Solution

Keep complete locked dependency bundles. Automatically prune old published
stable framework releases after a successful publication, retaining five plus
any exceptional protected current/latest identity. Keep Git tags and commits.
Locally keep selected latest plus installations still used by processes or whose
legacy ownership cannot yet be proved safe. Use cache-local usage bookkeeping
and serialization so selection and deletion cannot race.

Align the stale test with the newer self-mention rejection ticket while retaining
coverage for supported progress notes, same-thread continuation and history.

## User Stories

1. As the maintainer, I want old hosted packages removed automatically, so that storage remains bounded without a manual routine.
2. As the maintainer, I want the current/latest version, drafts, prereleases and unrelated releases preserved, so that cleanup cannot remove work outside its scope.
3. As the maintainer, I want source tags and commits preserved, so that removing binaries does not remove source history.
4. As the user, I want unused local versions removed during startup/update housekeeping, so that installed copies do not grow indefinitely.
5. As the user, I want any running older host and its later children protected, so that cleanup preserves fixed-version execution.
6. As the user, I want uncertain process/legacy ownership retained rather than guessed, so that storage reduction never deletes live application files.
7. As the user, I want dependency handling automatic, so that project startup does not require package-manager maintenance.
8. As the maintainer, I want tests aligned with intentional rejection behavior, so that obsolete assertions do not block valid release publication.

## Implementation Decisions

- Default hosted retention is five eligible published stable framework releases,
  ordered by publication time. Always protect just-published and server-designated
  latest. Only canonical version tags with this framework's expected ZIP qualify.
- Delete whole old release objects and their attached files; never delete Git
  refs. This remains compatible with immutable GitHub Releases, which forbid
  deleting individual assets but allow release deletion.
- Paginate listings, recheck latest and candidate identity before each deletion,
  serialize mutations and respect bounded request/rate behavior. Cleanup failure
  is reported independently of already-successful publication.
- Serialize automated publish+prune repository-wide while allowing independent
  builds; queue publications instead of canceling a valid in-progress publication.
- Remove the successful run's temporary Actions transfer artifact in a separate
  Actions-write-only job. Unpublished/failed-run artifacts expire after one day.
  Do not leave duplicated packages stored for a week after publication.
- Local cleanup uses process-lifetime usage records and a small separate cache
  bookkeeping database/guard. It is not project coordination state.
- Acquire use protection before returning an installation to the launcher, and
  serialize final install, validation, selection, pinning and prune. Preserve
  alive/inaccessible/reused process identities and executable/command-line
  references from native worker processes. Failed inspection suppresses deletion.
- Untracked pre-lease installations are a conservative migration exception. New
  steady-state installations reduce to latest once old users exit; do not claim
  an absent lease proves a legacy host stopped. Unknown directories and paths
  escaping the cache, including reparse points, are never cleanup targets.
- Keep bundled dependencies because the user accepts the download size. Registry
  installation at startup would add package-manager/network/lifecycle-script
  obligations. Production-only packaging may be a later size optimization.
- The comment test follows issue 107's atomic same-task self-mention rejection
  and issue 82's retained progress-note/continuation contract. Change tests only;
  do not weaken production rejection behavior or discard supported history proof.
- Preserve the user's staged snapshot and leave every new change unstaged. No
  actual remote deletion or live-host restart is part of implementation validation.

## Testing Decisions

Use existing public boundaries: application commands for comment behavior;
controlled HTTP GitHub publication APIs for hosted pruning; installed-bootstrap
subprocesses against disposable caches/projects for usage-aware cleanup.

Cover five-version ordering/protection/pagination and changed target identity;
live A while B installs, A exits then cleanup can remove managed A, crash/stale
records, concurrent starts, uncertain legacy/process evidence and containment.
Run typechecking and the complete normal suite after focused checks. Real model
opt-ins remain disabled.

## Out of Scope

- Dependency registry installation, shared package stores, delta updates or
  production-only package pruning.
- Actual deletions from the live GitHub repository during this coding session.
- Removing unknown legacy installations without evidence or touching project
  databases, task worktrees, source tags or accepted Git index content.

## Further Notes

[Research](research.md) distinguishes documented GitHub asset limits from an
unestablished small cumulative quota. The original stale test is tracked as
[shared-release issue 04](../shared-framework-releases/issues/04-restore-release-test-gate.md).

Delivery tickets: [01](issues/01-hosted-retention.md),
[02](issues/02-local-retention.md). The test correction is independent of both.
