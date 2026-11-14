# Shared committed framework releases: primary-source research

Researched 14 November 2026. This is design evidence, not a claim that a hosted
release or repository setting has already been created or changed.

## Recommended model

Keep three distinct responsibilities: source and release tooling in Git;
versioned application archives attached to GitHub Releases; unpacked immutable
installations in a local cache. GitHub describes releases as downloadable software
iterations based on tags. Its generated source ZIP/tarballs contain the repository
at the tag, so this application still needs a separately built archive containing
its browser output, runtime dependencies, worker/MCP entry points and resources.
Generated installations do not belong in Git history. [About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)

For this Windows-first increment, build an explicit version such as `v0.2.0` from
one committed revision on a native Windows CI runner, retaining installed Node.js
24 and Git as prerequisites. Use a clean checkout or export of the chosen commit,
not the publisher's working tree. Record version, full commit SHA, platform,
architecture, Node requirement and package/source digests in the artifact. This is
a project recommendation derived from the user requirement and existing runtime
layout; provenance does not by itself promise byte-identical reproducible builds.

## Publication and immutability

GitHub immutable releases lock their tag and attached assets after publication.
Their release title/notes and latest/prerelease designation remain editable.
GitHub recommends creating a draft, attaching all assets, then publishing it;
immutability also creates release attestations. Adopt this sequence so consumers
cannot see a published version before its application archive is present.
[Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

Release immutability is enabled through the repository's Settings / Releases and
applies to future releases. Its state on this repository is not established by
this research. Do not claim immutable-server enforcement merely because local
directories are versioned. [Prevent release changes](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes)

Prefer an already-existing remote tag for publication. `gh release create
--verify-tag` refuses an absent tag; without it, the CLI can create a tag from the
default branch or `--target`. Current CLI creates a draft, uploads assets and
publishes when assets are supplied, but these are separate requests. Explicit
draft publication makes the readiness boundary inspectable. Tag creation/push and
the final publication action must respect the repository's user-owned Git policy.
[GitHub CLI release create](https://cli.github.com/manual/gh_release_create)

## Discovery, integrity and private repositories

Use `GET /repos/{owner}/{repo}/releases/latest`, rather than a moving branch, as
the stable channel's discovery API. It excludes draft/prerelease releases.
Explicitly mark the newly published version latest rather than implementing a
client's own guess from tag sorting; the release API supports `make_latest`.
Public resources can be read without authentication; private repository release
metadata requires authorized access, with Contents:read for a fine-grained token.
Repository visibility and effective account permissions remain unverified here.
[Releases REST API](https://docs.github.com/en/rest/releases/releases?apiVersion=latest)

GitHub computes SHA-256 digests for uploaded assets and exposes them in release
metadata. Require the application's exact platform-specific asset and a valid
`sha256:<hex>` digest, then hash the downloaded bytes before extraction. Reject
missing or mismatching integrity metadata. A checksum obtained with authenticated
GitHub metadata detects substituted/truncated download bytes; it is not a defense
against a compromised release publisher. [Asset-digest announcement](https://github.blog/changelog/2025-06-03-releases-now-expose-digests-for-release-assets/)

The asset API accepts `Accept: application/octet-stream` and may either stream
bytes (200) or redirect (302). Its read permission mirrors release metadata.
Authenticated download implementations must handle both without forwarding a
GitHub token to an unrelated redirected origin or writing secrets to disk/logs.
Use the known repository's asset endpoint and platform asset name, rather than
executing a URL or command supplied by release notes. [Release assets REST API](https://docs.github.com/en/rest/releases/assets)

`gh release verify` and `gh release verify-asset` can verify immutable releases
and attached local assets. This is a stronger optional publisher/operator check,
but requiring GitHub CLI for every launch would add a new consumer prerequisite;
a direct HTTPS API updater can retain the current Node/Git runtime requirements.
[Verify release integrity](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity)

## Windows archive choice

Use ZIP through a small PowerShell helper using built-in .NET `ZipArchive`, with
entry-by-entry packing and extraction. Avoid `Compress-Archive`: Microsoft
explicitly documents that it omits hidden files and recommends the .NET API when
those files must be retained. Its documented per-file limit is 2 GB, above this
application's expected individual files but still worth enforcing explicitly.
[Compress-Archive](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.archive/compress-archive)

For downloaded archives, Microsoft recommends streaming APIs, path containment,
size/entry-count limits and explicit link policy. Extract into a fresh owned
staging directory; normalize each path and require it beneath that directory
including the trailing separator; reject absolute/traversal paths, link entries,
duplicate/colliding names and unexpected entry types. Do not reuse a destination
that can already contain junctions. Create files without overwrite. The ZIP
helper must prove it works with this application's real deep package tree and
the consumer's installed PowerShell, rather than assuming CI PowerShell 7 proves
Windows PowerShell 5.1 compatibility. [Microsoft ZIP/TAR best practices](https://learn.microsoft.com/en-us/dotnet/standard/io/zip-tar-best-practices)

Windows also ships libarchive-based `tar`, supporting archive creation, listing
and extraction without installing another package. It is a viable alternative,
but validating TAR entry types/links safely through textual CLI listing is more
complex than enumerating ZIP entries. Do not treat `tar -tf` names alone as proof
that link targets cannot escape. [tar on Windows](https://learn.microsoft.com/en-us/windows/tar/)

## CI build and permissions

Use separate build/verification and publication jobs. The build job checks out
the exact tagged commit, installs the lockfile with the pinned package manager,
typechecks/tests and smoke-tests the complete artifact without paid model calls.
The publish job receives only verified archives and metadata, then attaches and
publishes. Keep repository contents read-only during build and grant
Contents:write only to the publishing job. GitHub recommends minimum required
`GITHUB_TOKEN` permissions at workflow/job scope. [Workflow token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)

Pin external actions to full verified commit SHAs; GitHub warns that movable
action tags can change. Dependency lockfiles for workflows are another supported
mechanism, but SHA pins are a small fit for this repository's first workflow.
Disable unnecessary credential persistence and caches in privileged steps.
[Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)

Verified current official release commit links, suitable starting pins:

| Action | Version | Full commit |
| --- | --- | --- |
| checkout | v7.0.1 | [3d3c42e5aac5ba805825da76410c181273ba90b1](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1) |
| setup-node | v7.1.0 | [949feb2413d6458794dcd2491c4babbbce0c15c1](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1) |
| upload-artifact | v7.0.2 | [cf430e030ddbb5b0abf93d22962f4752f3646cd9](https://github.com/actions/upload-artifact/commit/cf430e030ddbb5b0abf93d22962f4752f3646cd9) |
| download-artifact | v8.0.2 | [9000827ccba6bdab643e8b6fd33ac0654aef8333](https://github.com/actions/download-artifact/commit/9000827ccba6bdab643e8b6fd33ac0654aef8333) |

Use a documented Windows runner label for a Windows x64 artifact; native SDK
executables mean a Linux-generated package is not interchangeable. GitHub's
`-latest` images are its current stable images, not necessarily the newest vendor
OS. Recording the runner/toolchain versions helps explain later differences.
[Hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

The existing readable TypeScript runtime can remain. Node 24's type stripping
preserves line positions and does not require source maps for erased types. It
does not typecheck, honor transformation-dependent tsconfig features, or support
TypeScript directly under a `node_modules` path. Keep the application source at
the installation root as today, with typechecking during build.
[Node 24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html)

## Startup behavior: project-specific recommendations

The following are architectural inferences, not GitHub-mandated updater policy:

1. At each batch-file start, discover latest, download the exact compatible asset
   if absent, verify its digest, extract/validate in a fresh temporary directory,
   then atomically install it under a repository/release-specific identity.
2. Do not modify an existing installation. Concurrent launchers may reuse a
   completed installation or lose the install race cleanly; none may see partial
   extraction. Only after validation may the local selected pointer advance.
3. Return one concrete installation to the existing V2 validation/start path.
   Its host never performs an update lookup again; later workers/MCP processes
   remain on that version.
4. Treat network unavailability separately from artifact corruption and runtime
   startup/migration failure. A reasonable offline policy is a visible warning
   plus the last verified installed release when discovery is unavailable; first
   installation must fail clearly. Never silently fall back after a selected
   release starts and fails migration. This policy needs explicit documentation.
5. Do not assume GitHub latest is monotonic: maintainers may change that flag
   even on immutable releases. Existing schema compatibility checks must remain
   authoritative; no automatic database downgrade/restore is implied.

## Repository-specific uncertainties and follow-through

- The current implementation captures working-tree changes and creates only
  local installations. Official shared releases must instead be captured from
  a resolved committed revision. The currently uncommitted release tooling cannot
  publish itself as a committed artifact until the user commits/pushes it.
- Repository visibility, existing Actions settings, release immutability setting,
  authenticated access and any organization restrictions were not inspected.
  Do not assume a release can currently be published from this session.
- The current package graph includes build tooling. Keeping it initially avoids
  a packaging rewrite; production-only pruning can be considered separately after
  proving browser/worker/MCP/native-runtime parity. Current pnpm deploy docs describe
  workspace deployment and newer version behavior, while this repository pins
  pnpm 11.9.0 and is a single package; copying the documented current command is
  not automatically a drop-in replacement. [pnpm deploy](https://pnpm.io/cli/deploy)
- Preserve existing migration guards, backups, external project/process inputs
  and user-owned staging/commits/pushes. Implement the shared artifact pipeline and
  verified startup updater as dependency-aware tracker tickets, with public
  artifact/startup seam tests, before claiming the distribution goal complete.
