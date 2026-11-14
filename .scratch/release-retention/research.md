# Release retention and dependency distribution

Researched 14 November 2026 against primary GitHub, npm and pnpm documentation.
These findings recommend policy; they do not claim a GitHub mutation occurred.

## Storage limits and a pragmatic hosted retention policy

GitHub documents at most 1,000 assets per release, with each individual asset
smaller than 2 GiB. Its Releases documentation states no total release-size or
bandwidth limit. A roughly 220 MB application ZIP is well below the per-asset
limit. Do not describe a small cumulative repository Release-asset quota as an
established risk: the cited documentation does not establish one. A five-release
cap is sensible project housekeeping, not a GitHub requirement. Five ZIPs at the
measured size occupy roughly 1.1 GB, excluding small checksum/metadata files.
[GitHub Releases limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)

Actions build artifacts and package registries are different storage products.
The original workflow used seven-day Actions artifact retention; do not assume
that expiry also deletes downloadable GitHub Release assets. The implementation
instead removes the successful run's transfer artifact by its upload-produced
ID, using a separate Actions-write-only job, and sets one-day expiry for failed
or canceled runs. This avoids duplicated packages after publication without
granting the release-publishing job extra permissions.
[Actions artifact API](https://docs.github.com/en/rest/actions/artifacts),
[Upload artifact outputs and retention](https://github.com/actions/upload-artifact#outputs)

GitHub
documents standard hosted runners as free for public repositories, while private
usage receives plan-dependent storage and compute allowances. This is distinct
from release-download limits.
[Actions billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage)

Recommended minimal policy, derived from this project's always-latest updater:

1. Publish and verify the new release before pruning anything.
2. Identify only published stable releases for this framework, using canonical
   version tags and the expected framework application asset naming/ownership.
   Preserve drafts, prereleases, unrelated releases and malformed/uncertain data.
3. Preserve the just-published release and GitHub's current designated latest.
   Fill the remaining retained slots with the most recent eligible releases by
   publication time, for five total under normal serialized publication.
4. Delete older eligible **release objects**, including their application assets,
   while leaving Git tags and commits alone. Never remove source history or a
   reference merely to enforce binary retention.
5. Recheck the designated latest and target identity before each deletion. If
   an outside actor changed the release or latest designation, preserve it or
   stop cleanup rather than act on stale assumptions. A temporary extra retained
   version is preferable to deleting a protected release.
6. Report cleanup failures separately from the already-successful publication.
   Do not delete the new valid release to compensate for a cleanup failure.

This should run automatically after successful publication, without a personal
manual cleanup routine. Deleting older downloads means their historical custom
ZIP URLs stop working; the retained tags still identify source, and running local
installations do not depend on those URLs.

## Immutability, deletion and source preservation

Immutable releases prohibit modifying or deleting individual attached assets.
The entire immutable release can be deleted; its associated tag can then be
deleted, but a tag name used by an immutable release cannot be reused. Therefore
asset-only expiry is incompatible with the recommended future immutable-release
setting. Deleting entire old framework releases is the simpler consistent policy.
Do not automatically disable immutability or delete/recreate tags.
[Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

If preserving release notes indefinitely matters more than immutable binaries,
asset-only pruning is possible for mutable releases, but adds mixed policy and
special handling. It is unnecessary for the user's expressed five-version goal.
The API has separate release-object and asset deletion endpoints. Deletion
requires repository Contents:write; the existing publication job can provide
that without broadening the build job's permissions.
[Delete releases API](https://docs.github.com/en/rest/releases/releases),
[Delete release assets API](https://docs.github.com/en/rest/releases/assets)

GitHub CLI exposes tag cleanup as an explicit additional `--cleanup-tag` option
to `gh release delete`; omit it when retaining source tags. A retention script
using only the Release DELETE endpoint should never call a Git-ref deletion API.
[GitHub CLI release deletion](https://cli.github.com/manual/gh_release_delete)

## API and concurrency details

Release listings are paginated, with a maximum page size of 100. Follow API
pagination instead of counting only the first page. Sort the relevant population
explicitly; do not treat API order or semantic-version text order as the desired
publication-retention order. The latest endpoint returns a stable published
release and supports the maintainer's latest designation.
[Releases REST API](https://docs.github.com/en/rest/releases/releases),
[REST pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)

GitHub recommends serial API calls, pausing between numerous mutating requests,
and observing Retry-After / rate-limit reset headers. Use bounded, observable
failure behavior; do not blindly retry a destructive request with a changed
target. The current workflow's per-tag concurrency does not serialize two
different release tags. Add a repository-wide publication/retention critical
section, so one successful publish-and-prune run cannot race another automated
run's latest selection. Independent builds may still run in parallel.
[GitHub REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

## Local installed versions

The desired steady state is one selected installation. During transitions it
must mean **selected latest plus every installation still used by a live host**.
A project started on A may still run A after another project downloads B; the
user explicitly requires that A's later workers and browser files remain intact.

Use a process-lifetime usage record/lease acquired before a selected installation
can race cleanup, including the V2 validation/start interval. Serialize the
selection/acquisition/pruning boundary. Remove an old installation only when
ownership evidence proves no live process can use it, and validate canonical
cache containment before any recursive removal. PID reuse, failed inspection,
crashes and stale records must not turn uncertainty into deletion permission.

Migration needs care: hosts started by the previous bootstrap have no new usage
lease. With same-process imports, their OS command lines may identify only the
bootstrap, not the selected release path. Absence of a lease therefore does not
prove a legacy installation unused. Preserve uncertain legacy versions until a
supported known-stopped/reboot transition proves the old processes gone; do not
silently delete them immediately after installing lease-aware bootstrap code.

These are project-specific concurrency conclusions from the implemented launch
flow, not claims that GitHub mandates a particular local locking mechanism.

## Dependency-management options

| Option | User operation | Assessment for this framework |
| --- | --- | --- |
| Keep complete verified bundles | Download and start; no package manager required | Recommended now: accepted download size and exact independently tested package |
| Bundle production dependencies only after build | Same download/start routine | Good later size optimization, retaining the current operational simplicity |
| Download source plus install locked production dependencies at startup | Can be automated, but requires package manager and registry access | Feasible, but moves installation/lifecycle failures into every fresh-version startup |
| Share content-addressed dependency storage between versions | Needs reference-aware store and garbage collection | Additional lifecycle complexity; unnecessary for the accepted size |

The user accepts approximately 220 MB per version and does not want manual
dependency work. Keep the existing self-contained locked bundle for this change.
Retention solves the stated accumulation concern without creating a new runtime
installation service.

For future production-only bundling, build with the full toolchain, then assemble
only runtime dependencies and required optional platform binaries into a fresh
artifact before final verification. pnpm supports `install --prod` and
`prune --prod`; retain the frozen lockfile and exact package-manager version.
Do not apply these commands blindly to the current hand-copied portable graph or
remove optional packages indiscriminately: the SDK's native executable can depend
on platform packages.
[pnpm install](https://pnpm.io/cli/install),
[pnpm prune](https://pnpm.io/cli/prune)

pnpm's deployment documentation describes isolated portable production graphs,
but current docs include behavior introduced in versions 12.2 and 12.15. The
repository pins pnpm 11.9 and is a single package, so a modern workspace deploy
example is not proof of a drop-in solution for this checkout.
[pnpm deploy](https://pnpm.io/cli/deploy)

An automated startup install could use a frozen production dependency graph, but
the consumer would need pnpm or npm, compatible registry access and lifecycle
script policy. npm's `ci` requires its own lockfile and refuses manifest/lock
mismatch; this repository uses pnpm's lockfile, so `npm ci` cannot simply consume
it. Adding a second lockfile or runtime package-manager bootstrap would increase
maintenance rather than reduce it.
[npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

## Follow-through

Implement hosted keep-five retention and safe local usage-aware pruning as
dependency-aware tracker work, preserving the existing startup migration and
diagnostic guarantees. Keep dependency-bundle composition unchanged for now.
No actual GitHub release deletion, cache cleanup, source staging or remote
publication was performed by this research task.
