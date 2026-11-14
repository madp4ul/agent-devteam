# 02 — Install the latest verified hosted release at startup

Status: resolved — implementation verified and reviewed; awaiting user code review.

Type: task

Blocked by: 01.

Parent: [Specification](../spec.md).

What to build: a self-contained bootstrap launcher discovers the repository's
latest complete stable release, verifies and atomically caches its application
archive, and returns one installation for that host lifetime.

- [x] Exact version/platform asset, GitHub digest and committed tag provenance are verified.
- [x] Bounded streaming download and fresh safe extraction precede atomic installation and selection.
- [x] Concurrent starts never see partial files or overwrite a conflicting installation.
- [x] Cached reuse and visible offline/no-first-release fallback work without any development checkout dependency.
- [x] Corrupt release metadata, mismatched bytes, unsafe extraction and failed startup do not trigger hidden fallback.
- [x] Credentials remain out of persisted data and redirected unrelated requests.
- [x] Controlled HTTP and installed-host tests prove startup adoption and no effect on running hosts.

## Comments

- 2026-11-14: Implementation of the independent downloader boundary proceeds alongside the archive producer; integration and completion remain blocked by ticket 01's artifact contract.

## Implementation evidence

- Added a self-contained bootstrap installer, hosted-release launcher and updater.
  It discovers stable GitHub metadata, selects the exact platform ZIP, streams and
  hashes bytes, resolves the tagged commit, and validates committed provenance
  before any accepted installation or latest pointer changes.
- ZIP extraction uses the producer's Windows PowerShell 5.1 helper in a fresh
  owned staging tree. Concurrent starters accept only an identical verified
  winner; conflicting installed artifacts are preserved and rejected.
- A shared atomic cache-file replacement helper centralizes same-directory rename
  and bounded Windows contention retry for bootstrap, latest selection and the
  legacy development snapshot publisher. The latter refuses managed caches.
- Red: the initial public startup test failed on the absent archive/bootstrap
  interface. Green: the end-to-end HTTP/app fixture now passes in about 2.5s.
  It covers first-install offline failure, same-asset cache reuse, malformed
  metadata rejection, checksum and committed-revision mismatch preservation,
  simultaneous B starters, running A's later import remaining on A, visible
  offline cached-B startup, and development-snapshot refusal of a managed cache.
- Typechecking passed after the implementation. Parent-owned real committed
  artifact/installed-host integration and final two-axis review complete the
  integrated verification.
- No real project host, state, repository history or remote release was changed.

- Final spec review correction: only discovery's no-published-release HTTP 404 permits cached startup. A declared tag or asset returning HTTP 404 now fails closed. Public HTTP regression proves both missing-resource failures preserve the accepted selection, while discovery 404 warns and uses cache. Focused updater regression passed (4.8s).

## Integrated completion

Implementation, local bootstrap setup and two-axis review are complete. See [verification and deployment](../verification/results.md). This does not claim a hosted release: user-owned commit/push/tag and the existing full-suite blocker remain explicit publication gates.
