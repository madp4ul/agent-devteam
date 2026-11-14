# Shared release verification and deployment

Date: 14 November 2026.

## Delivered

- A stable version tag is exported from Git with command-scoped autocrlf disabled.
  Package version and tag must agree. Builder, packager and ZIP helper must match
  the tagged versions before capture and before exposing an output archive.
- Complete Windows x64 application ZIPs retain matching readable source, full
  source revision, version and package/source digests. Existing outputs are not
  overwritten. Hidden and long-path files are retained.
- The GitHub workflow builds/verifies the tagged commit with read-only access,
  transfers output to a contents-write-only publishing job, rechecks the ZIP
  checksum and remote tag SHA, uploads to a draft and publishes only when ready.
- The self-contained bootstrap discovers published stable latest, verifies the
  exact platform asset's digest and tagged source revision, safely stages it and
  atomically installs/selects it. Existing installations stay unchanged.
- Concurrent starts share a complete installation. Running hosts retain their
  version for later activity; new starts can adopt newer releases.
- Discovery unavailability/no first release permits warned verified-cache reuse.
  Missing declared tags/assets, invalid metadata, checksum/provenance failures and
  runtime startup/migration errors do not silently run an older version.

## Validation

- Final typechecking: passed.
- Final committed-artifact and archive boundary tests: 2 passed, 0 failed.
  Tagged build took 104.0 seconds; hidden/deep-path/unsafe-entry proof 1.8 seconds.
  The fixture explicitly enables autocrlf and compares committed blob bytes.
  Separate modified executing copies of each packaging tool are rejected.
- Final downloader plus actual hosted-host tests: 2 passed, 0 failed, 115.6 seconds.
  The real application starts paused and serves HTTP 200 after its committed ZIP
  is served through a controlled GitHub endpoint and the source is removed.
- Downloader regression includes first-install failure offline, cache reuse,
  mismatched bytes/revision, missing declared tag/asset, concurrent installs,
  running-A later imports after installing B, and managed-cache snapshot refusal.
- Archive helper ran under actual Windows PowerShell 5.1, including true Hidden
  attributes and file paths longer than 260 characters, with bounded entry streams.
- V2 launcher contract tests: 5 passed. Its actual batch file is unchanged.
- Workflow YAML parsed; full action SHAs and scoped permissions were reviewed.
  No GitHub Actions run or remote publication is claimed from local validation.
- Standards and Spec reviews: zero remaining findings. The fixture-version
  coupling and overly broad HTTP-404 fallback findings were corrected. A final
  artifact-only review also accepted the committed-tooling provenance refinement.

The full normal suite ran once with bounded concurrency and real-model opt-ins
unset: 552 tests, 543 passed, 7 skipped, 2 failed, 403.7 seconds. One was the
existing conversation-history failure described below. The other was a Windows
artifact expected-byte line-ending mismatch; canonical Git export and a committed
blob expectation corrected it, and the final focused artifact test passed. The
full suite was not rerun after that correction and is not claimed green.

HTTP checks used scoped execution outside the sandbox because its loopback
connections are blocked. Tests use disposable Git repositories/project state and
controlled model-free runtime boundaries, never the live game repositories.

## Remaining publication gate

The existing `a self-authored activation source stays available through retained
conversation history` test fails at line 154 of the application conversation
test. It already failed before release tooling changes; neither application
source nor that test changed. The CI workflow deliberately keeps the full-suite
gate. [Ticket 04](../issues/04-restore-release-test-gate.md) records this existing
blocker instead of silently skipping or weakening the assertion.

The user also owns committing/pushing the release tooling and creating/pushing
the matching version tag. No real source commit, tag, push, hosted release,
repository setting change or live project migration was performed.

## Local setup

The reviewed bootstrap is installed in the existing sibling
`agent-devteam-releases` directory, now explicitly an installation cache. Its
configuration targets the public `madp4ul/agent-devteam` repository. Read-only API
inspection found no hosted releases or tags in the returned lists. Resolving the
installed bootstrap emitted the expected no-first-release warning and selected
the retained snapshot `2026-11-14T15-35-44-974Z-7c4c3091` without changing it.

A final real-V2 wrapper smoke used a disposable prepared clone: paused startup,
browser HTTP 200 and fixture-only state binding all passed through the installed
bootstrap. The real V2 batch file remains unchanged. No live host was restarted.

The original `idle-games` checkout is no longer present during final inspection.
It was not recreated and its retained state was not touched. The optional legacy
consumer proof now skips that absent checkout and still verifies V2.

All implementation changes remain unstaged. The pre-existing staged framework
diff remains byte-for-byte unchanged, SHA-256
`492A6F37D14369C566A1EAEFFDB8F01FE23F27291032E6DF03B16D30E0334A3A`.

## Follow-up: stale test gate resolved

The user identified issue 107 as the newer intentional rejection contract. The obsolete self-activation assertion is now aligned while supported own-note history and continuation remain covered. Full normal suite: 557 tests, 550 passed, 7 skipped, zero failures. See [current verification](../../release-retention/verification/results.md). The former issue 04 publication blocker is resolved; first hosted publication still awaits user-owned commit/push/tag.
